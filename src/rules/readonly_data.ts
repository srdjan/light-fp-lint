// @light-fp adapter -- a lint rule adapts Deno's visitor API: it reports through a
// void callback and is driven by mutation it does not own.
import { layerOf } from "../layer.ts";

const CALLABLE_TYPES = new Set([
  "FunctionDeclaration",
  "FunctionExpression",
  "ArrowFunctionExpression",
  "MethodDefinition",
  "TSFunctionType",
  "TSMethodSignature",
  "TSCallSignatureDeclaration",
  "TSConstructSignatureDeclaration",
  "TSConstructorType",
]);

type PropertyLike = Deno.lint.TSPropertySignature | Deno.lint.TSIndexSignature;

const MUTABLE_COLLECTIONS: Readonly<Record<string, string>> = {
  Array: "readonly T[]",
  Map: "ReadonlyMap",
  Set: "ReadonlySet",
};

// An array element type that binds looser than `[]` needs parentheses.
const LOOSE_TYPES = new Set([
  "TSUnionType",
  "TSIntersectionType",
  "TSFunctionType",
  "TSConstructorType",
  "TSConditionalType",
  "TSTypeOperator",
  "TSInferType",
]);

type Frame = Readonly<{
  readonly inData: boolean | undefined;
  readonly inAmbient: boolean;
}>;

/**
 * Visiting the member nodes directly, rather than walking down from a type alias,
 * is what makes nesting free: a property inside a union member, inside a nested
 * object, or inside a generic argument is the same node type at any depth. The
 * old shape missed every discriminated union member, which is the central data
 * shape of this style.
 *
 * A node's policy is decided by its enclosing declarations: the nearest
 * data-or-callable declaration above it decides whether it is data, and any
 * enclosing ambient declaration (module or `declare` interface) exempts it. The
 * original rule re-derived that context by walking the ancestor chain for every
 * visited node. The enter/`:exit` visitors below maintain the same context as a
 * frame stack instead: entering a data, callable, or ambient declaration pushes
 * a frame, leaving pops it, and the answer is the deepest open frame.
 */
export const readonlyData: Deno.lint.Rule = {
  create(context) {
    if (layerOf(context.filename, context.sourceCode) === "adapter") return {};

    const frames: Frame[] = [];

    // A reference to `Map` (or `Array`/`Set`) inside a data type normally
    // names the global mutable collection. When the file instead declares its
    // own module-scope `type Map = { ... }` object alias, a bare reference to
    // that name is the alias, not the built-in. This is provable only for a
    // direct union member of a top-level non-generic alias, in an external
    // module; every other context keeps the name report.
    const hasTypeParams = (alias: Deno.lint.TSTypeAliasDeclaration): boolean =>
      alias.typeParameters != null;

    const body = context.sourceCode.ast.body;

    // An external module is required: without a top-level import or export, a
    // bare declaration participates in the global scope and the module-local
    // binding proof does not hold.
    const moduleBoundary = body.some((statement) =>
      statement.type === "ImportDeclaration" ||
      statement.type === "ExportNamedDeclaration" ||
      statement.type === "ExportDefaultDeclaration" ||
      statement.type === "ExportAllDeclaration"
    );

    type BindingCounts = {
      typeAlias: number;
      interface: number;
      class: number;
      enum: number;
      namespace: number;
      imports: number;
    };

    const countsBy = new Map<string, BindingCounts>();
    const aliasBy = new Map<string, Deno.lint.TSTypeAliasDeclaration>();

    const countsFor = (name: string): BindingCounts => {
      const existing = countsBy.get(name);
      if (existing) return existing;
      const fresh = {
        typeAlias: 0,
        interface: 0,
        class: 0,
        enum: 0,
        namespace: 0,
        imports: 0,
      };
      countsBy.set(name, fresh);
      return fresh;
    };

    for (const statement of body) {
      if (statement.type === "ImportDeclaration") {
        for (const specifier of statement.specifiers) {
          countsFor(specifier.local.name).imports += 1;
        }
        continue;
      }
      if (statement.type === "TSImportEqualsDeclaration") {
        countsFor(statement.id.name).imports += 1;
        continue;
      }
      const declaration = statement.type === "ExportNamedDeclaration" ||
          statement.type === "ExportDefaultDeclaration"
        ? statement.declaration
        : statement;
      if (declaration === null || declaration === undefined) continue;
      switch (declaration.type) {
        case "TSTypeAliasDeclaration":
          countsFor(declaration.id.name).typeAlias += 1;
          aliasBy.set(declaration.id.name, declaration);
          break;
        case "TSInterfaceDeclaration":
          countsFor(declaration.id.name).interface += 1;
          break;
        case "ClassDeclaration":
          if (declaration.id) countsFor(declaration.id.name).class += 1;
          break;
        case "TSEnumDeclaration":
          if (declaration.id) countsFor(declaration.id.name).enum += 1;
          break;
        case "TSModuleDeclaration":
          if (declaration.id.type === "Identifier") {
            countsFor(declaration.id.name).namespace += 1;
          }
          break;
      }
    }

    const inAmbient = (): boolean => frames.some((frame) => frame.inAmbient);

    const inData = (): boolean =>
      frames.filter((frame) => frame.inData !== undefined).at(-1)?.inData ??
        false;

    const isCallableProperty = (node: Deno.lint.TSPropertySignature): boolean =>
      node.typeAnnotation?.typeAnnotation.type === "TSFunctionType";

    // The literal inside `Readonly<{ ... }>`, when that is the only argument.
    const readonlyLiteralOf = (
      node: Deno.lint.Node | undefined,
    ): Deno.lint.TSTypeLiteral | undefined => {
      const [only, ...rest] = node?.type === "TSTypeReference" &&
          node.typeName.type === "Identifier" &&
          node.typeName.name === "Readonly"
        ? node.typeArguments?.params ?? []
        : [];
      return only?.type === "TSTypeLiteral" && rest.length === 0
        ? only
        : undefined;
    };

    // `Readonly<{ ... }>` makes every member of its literal readonly, so those
    // members need no marker of their own. The ancestors of a member are its
    // literal, the type-argument list, and then the `Readonly` reference.
    const isReadonlyWrapped = (node: PropertyLike): boolean => {
      const ancestors = context.sourceCode.getAncestors(node);
      return readonlyLiteralOf(ancestors.at(-3)) === ancestors.at(-1);
    };

    // The wrapper is redundant only when dropping it is type-identical: every
    // member is a property or index signature. A method, call, construct, or
    // accessor member is not made readonly by `readonly`.
    const wrappedDataLiteral = (
      node: Deno.lint.TSTypeReference,
    ): Deno.lint.TSTypeLiteral | undefined => {
      const literal = readonlyLiteralOf(node);
      return literal?.members.every(isPropertyLike) ? literal : undefined;
    };

    const isPropertyLike = (
      member: Deno.lint.TSTypeLiteral["members"][number],
    ): member is PropertyLike =>
      member.type === "TSPropertySignature" ||
      member.type === "TSIndexSignature";

    const unwrapEdits = (
      node: Deno.lint.TSTypeReference,
      literal: Deno.lint.TSTypeLiteral,
      fixer: Deno.lint.Fixer,
    ) => [
      fixer.removeRange([node.range[0], literal.range[0]]),
      ...literal.members.filter(isPropertyLike)
        .filter((member) => !member.readonly)
        .map((member) => fixer.insertTextBefore(member, "readonly ")),
      fixer.removeRange([literal.range[1], node.range[1]]),
    ];

    const readonlyArrayText = (node: Deno.lint.Node): string =>
      node.type === "TSArrayType"
        ? `readonly ${elementText(node.elementType)}[]`
        : context.sourceCode.getText(node);

    const elementText = (element: Deno.lint.Node): string =>
      element.type === "TSArrayType" || LOOSE_TYPES.has(element.type)
        ? `(${readonlyArrayText(element)})`
        : context.sourceCode.getText(element);

    // A mutable-collection name that is instead the file's own object alias:
    // unique module-scope `type X = { ... }`, non-generic, zero type arguments,
    // and the reference is a direct union member of another top-level
    // non-generic alias. Only then does the name refer to the alias, not the
    // built-in; everything else keeps the report.
    const isLocalObjectAlias = (
      name: string,
      node: Deno.lint.TSTypeReference,
    ): boolean => {
      if (!moduleBoundary) return false;
      const counts = countsBy.get(name);
      if (!counts || counts.typeAlias !== 1) return false;
      if (
        counts.interface !== 0 || counts.class !== 0 || counts.enum !== 0 ||
        counts.namespace !== 0 || counts.imports !== 0
      ) return false;
      const alias = aliasBy.get(name);
      if (!alias || alias.typeAnnotation.type !== "TSTypeLiteral") return false;
      if (hasTypeParams(alias)) return false;
      if (
        node.typeArguments !== undefined && node.typeArguments.params.length > 0
      ) {
        return false;
      }
      const ancestors = context.sourceCode.getAncestors(node);
      const shape = ancestors.map((ancestor) => ancestor.type);
      const exactShape = shape.length === 3
        ? shape[0] === "Program" &&
          shape[1] === "TSTypeAliasDeclaration" &&
          shape[2] === "TSUnionType"
        : shape.length === 4
        ? shape[0] === "Program" &&
          shape[1] === "ExportNamedDeclaration" &&
          shape[2] === "TSTypeAliasDeclaration" &&
          shape[3] === "TSUnionType"
        : false;
      if (!exactShape) return false;
      const owner = ancestors.at(-2);
      if (owner === undefined || owner.type !== "TSTypeAliasDeclaration") {
        return false;
      }
      if (owner.typeAnnotation !== ancestors.at(-1)) return false;
      if (hasTypeParams(owner)) return false;
      return true;
    };

    const visitors: Deno.lint.LintVisitor = {
      TSTypeAliasDeclaration() {
        frames.push({ inData: true, inAmbient: false });
      },
      "TSTypeAliasDeclaration:exit"() {
        frames.pop();
      },
      TSInterfaceDeclaration(node) {
        frames.push({ inData: true, inAmbient: node.declare });
      },
      "TSInterfaceDeclaration:exit"() {
        frames.pop();
      },
      TSModuleDeclaration() {
        frames.push({ inData: undefined, inAmbient: true });
      },
      "TSModuleDeclaration:exit"() {
        frames.pop();
      },

      TSPropertySignature(node) {
        if (inAmbient() || isCallableProperty(node)) return;
        if (!inData() || node.readonly || isReadonlyWrapped(node)) return;
        context.report({
          node: node.key,
          message: "Data properties are readonly.",
          hint: "Rebuild the value with a spread instead of assigning to it.",
          fix: (fixer) => fixer.insertTextBefore(node, "readonly "),
        });
      },

      TSIndexSignature(node) {
        if (inAmbient() || !inData() || node.readonly) return;
        if (isReadonlyWrapped(node)) return;
        context.report({
          node,
          message: "Index signatures in data types are readonly.",
          hint: "Rebuild the value with a spread instead of assigning to it.",
          fix: (fixer) => fixer.insertTextBefore(node, "readonly "),
        });
      },

      TSArrayType(node) {
        if (inAmbient() || !inData()) return;
        // `readonly T[]` parses as a readonly type operator wrapping the array.
        const parent = context.sourceCode.getAncestors(node).at(-1);
        if (
          parent && parent.type === "TSTypeOperator" &&
          parent.operator === "readonly"
        ) return;
        context.report({
          node,
          message: "Arrays in data types are readonly.",
          hint: "Write `readonly T[]`, and build new arrays with a spread.",
          fix: parent?.type === "TSArrayType"
            ? undefined
            : (fixer) =>
              node.elementType.type === "TSArrayType"
                ? fixer.replaceText(node, readonlyArrayText(node))
                : fixer.insertTextBefore(node, "readonly "),
        });
      },

      TSTypeReference(node) {
        const literal = wrappedDataLiteral(node);
        if (literal && !inAmbient() && inData()) {
          context.report({
            node: node.typeName,
            message: "Readonly<{ ... }> around a type literal is redundant.",
            hint:
              "Mark each member `readonly` and drop the Readonly<> wrapper.",
            fix: (fixer) => unwrapEdits(node, literal, fixer),
          });
        }
        if (node.typeName.type !== "Identifier") return;
        const replacement = MUTABLE_COLLECTIONS[node.typeName.name];
        if (!replacement) return;
        if (inAmbient() || !inData()) return;
        if (isLocalObjectAlias(node.typeName.name, node)) return;
        const element = node.typeArguments?.params[0];
        context.report({
          node: node.typeName,
          message:
            `${node.typeName.name} is mutable; data types use ${replacement}.`,
          hint: `Build a new ${replacement} instead of mutating one in place.`,
          fix: node.typeName.name !== "Array"
            ? (fixer) => fixer.replaceText(node.typeName, replacement)
            : element
            ? (fixer) =>
              fixer.replaceText(node, `readonly ${elementText(element)}[]`)
            : undefined,
        });
      },
    };

    // A callable type position demotes its contents out of the data policy.
    for (const type of CALLABLE_TYPES) {
      Object.assign(visitors, {
        [type]() {
          frames.push({ inData: false, inAmbient: false });
        },
        [`${type}:exit`]() {
          frames.pop();
        },
      });
    }
    return visitors;
  },
};
