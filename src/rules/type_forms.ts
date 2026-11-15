// @light-fp adapter -- a lint rule adapts Deno's visitor API: it reports through a
// void callback and is driven by mutation it does not own.
import { isDomain } from "../layer.ts";

type SignatureNode =
  | Deno.lint.FunctionDeclaration
  | Deno.lint.TSDeclareFunction;

const RAW_KEYWORDS: readonly string[] = [
  "TSStringKeyword",
  "TSNumberKeyword",
  "TSBooleanKeyword",
  "TSObjectKeyword",
  "TSUnknownKeyword",
];

const isRaw = (node: Deno.lint.TypeNode): boolean => {
  if (RAW_KEYWORDS.includes(node.type)) return true;
  if (node.type === "TSArrayType") return isRaw(node.elementType);
  if (node.type === "TSTypeOperator") {
    return node.operator === "readonly" && isRaw(node.typeAnnotation);
  }
  if (node.type === "TSUnionType") return node.types.some(isRaw);
  return false;
};

const unwrapPromise = (node: Deno.lint.TypeNode): Deno.lint.TypeNode => {
  if (node.type !== "TSTypeReference") return node;
  if (node.typeName.type !== "Identifier" || node.typeName.name !== "Promise") {
    return node;
  }
  const params = node.typeArguments?.params ?? [];
  return params.length === 1 ? params[0] : node;
};

const parameterAnnotation = (
  parameter: Deno.lint.Parameter,
): Deno.lint.TSTypeAnnotation | undefined => {
  if (parameter.type === "TSParameterProperty") {
    return parameterAnnotation(parameter.parameter);
  }
  if (parameter.type === "AssignmentPattern") {
    return parameter.left.typeAnnotation;
  }
  return parameter.typeAnnotation;
};

/**
 * `light-fp/type-forms`: domain code writes one spelling for each type. It
 * annotates a declaration instead of using `satisfies`, writes arrays as `T[]`,
 * writes `undefined` instead of `void`, and names each raw built-in type that
 * an exported function signature exposes.
 */
export const typeForms: Deno.lint.Rule = {
  create(context) {
    if (!isDomain(context.filename, context.sourceCode)) return {};

    const checked = new Set<SignatureNode>();

    const reportRaw = (node: Deno.lint.TypeNode): void => {
      if (!isRaw(node)) return;
      context.report({
        node,
        message: "The exported signature exposes a raw built-in type.",
        hint:
          "Declare a named alias, such as `type Email = string`, and use it in the exported signature.",
      });
    };

    const checkSignature = (node: SignatureNode): void => {
      if (checked.has(node)) return;
      checked.add(node);
      for (const parameter of node.params) {
        const annotation = parameterAnnotation(parameter);
        if (annotation) reportRaw(annotation.typeAnnotation);
      }
      if (node.returnType) {
        reportRaw(unwrapPromise(node.returnType.typeAnnotation));
      }
    };

    const signaturesNamed = (name: string): readonly SignatureNode[] =>
      context.sourceCode.ast.body.filter(
        (statement): statement is SignatureNode =>
          (statement.type === "FunctionDeclaration" ||
            statement.type === "TSDeclareFunction") &&
          statement.id?.name === name,
      );

    return {
      TSSatisfiesExpression(node) {
        context.report({
          node,
          message: "`satisfies` checks a value but gives the binding no type.",
          hint: "Annotate the declaration instead: `const x: T = value`.",
        });
      },

      TSTypeReference(node) {
        if (node.typeName.type !== "Identifier") return;
        if (node.typeName.name === "Array") {
          context.report({
            node,
            message: "`Array<T>` is a second spelling of the array type.",
            hint: "Write `T[]`, or `readonly T[]` for data.",
          });
        } else if (node.typeName.name === "ReadonlyArray") {
          context.report({
            node,
            message:
              "`ReadonlyArray<T>` is a second spelling of the readonly array type.",
            hint: "Write `readonly T[]`.",
          });
        }
      },

      TSVoidKeyword(node) {
        context.report({
          node,
          message:
            "`void` hides the `undefined` value that a function returns.",
          hint: "Write `undefined`.",
        });
      },

      FunctionDeclaration(node) {
        if (node.parent.type === "ExportNamedDeclaration") checkSignature(node);
      },

      TSDeclareFunction(node) {
        if (node.parent.type === "ExportNamedDeclaration") checkSignature(node);
      },

      ExportNamedDeclaration(node) {
        if (node.source !== null) return;
        for (const specifier of node.specifiers) {
          if (specifier.local.type !== "Identifier") continue;
          for (const signature of signaturesNamed(specifier.local.name)) {
            checkSignature(signature);
          }
        }
      },
    };
  },
};
