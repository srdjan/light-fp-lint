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

const MUTABLE_COLLECTIONS: Readonly<Record<string, string>> = {
  Array: "ReadonlyArray",
  Map: "ReadonlyMap",
  Set: "ReadonlySet",
};

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

    const inAmbient = (): boolean => frames.some((frame) => frame.inAmbient);

    const inData = (): boolean =>
      frames.filter((frame) => frame.inData !== undefined).at(-1)?.inData ??
        false;

    const isCallableProperty = (node: Deno.lint.TSPropertySignature): boolean =>
      node.typeAnnotation?.typeAnnotation.type === "TSFunctionType";

    const readonlyArrayText = (node: Deno.lint.Node): string => {
      if (node.type !== "TSArrayType") return context.sourceCode.getText(node);
      const element = node.elementType;
      const elementText = element.type === "TSArrayType"
        ? `(${readonlyArrayText(element)})`
        : context.sourceCode.getText(element);
      return `readonly ${elementText}[]`;
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
        if (!inData() || node.readonly) return;
        context.report({
          node: node.key,
          message: "Data properties are readonly.",
          hint: "Rebuild the value with a spread instead of assigning to it.",
          fix: (fixer) => fixer.insertTextBefore(node, "readonly "),
        });
      },

      TSIndexSignature(node) {
        if (inAmbient() || !inData() || node.readonly) return;
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
        if (node.typeName.type !== "Identifier") return;
        const replacement = MUTABLE_COLLECTIONS[node.typeName.name];
        if (!replacement) return;
        if (inAmbient() || !inData()) return;
        context.report({
          node: node.typeName,
          message:
            `${node.typeName.name} is mutable; data types use ${replacement}.`,
          hint: `Build a new ${replacement} instead of mutating one in place.`,
          fix: (fixer) => fixer.replaceText(node.typeName, replacement),
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
