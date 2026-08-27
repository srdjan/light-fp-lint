// @light-fp adapter -- a lint rule adapts Deno's visitor API: it reports through a
// void callback and is driven by mutation it does not own.
import { isDomain } from "../layer.ts";

const DATA_DECLARATIONS = new Set([
  "TSTypeAliasDeclaration",
  "TSInterfaceDeclaration",
]);

const MUTABLE_COLLECTIONS: Readonly<Record<string, string>> = {
  Map: "ReadonlyMap",
  Set: "ReadonlySet",
};

/**
 * Visiting the member nodes directly, rather than walking down from a type alias,
 * is what makes nesting free: a property inside a union member, inside a nested
 * object, or inside a generic argument is the same node type at any depth. The
 * old shape missed every discriminated union member, which is the central data
 * shape of this style.
 */
export const readonlyData: Deno.lint.Rule = {
  create(context) {
    if (!isDomain(context.filename, context.sourceCode)) return {};

    const inDataPosition = (node: Deno.lint.Node): boolean =>
      context.sourceCode.getAncestors(node).some((ancestor) =>
        DATA_DECLARATIONS.has(ancestor.type)
      );

    return {
      TSPropertySignature(node) {
        if (node.readonly) return;
        context.report({
          node: node.key,
          message: "Data properties are readonly.",
          hint: "Rebuild the value with a spread instead of assigning to it.",
          fix: (fixer) => fixer.insertTextBefore(node.key, "readonly "),
        });
      },

      TSIndexSignature(node) {
        if (node.readonly) return;
        context.report({
          node,
          message: "Index signatures in data types are readonly.",
          hint: "Rebuild the value with a spread instead of assigning to it.",
          fix: (fixer) => fixer.insertTextBefore(node, "readonly "),
        });
      },

      TSArrayType(node) {
        if (!inDataPosition(node)) return;
        const parent = context.sourceCode.getAncestors(node).at(-1);
        // `readonly T[]` parses as a readonly type operator wrapping the array.
        if (
          parent && parent.type === "TSTypeOperator" &&
          parent.operator === "readonly"
        ) return;
        context.report({
          node,
          message: "Arrays in data types are readonly.",
          hint: "Write `readonly T[]`, and build new arrays with a spread.",
          fix: (fixer) => fixer.insertTextBefore(node, "readonly "),
        });
      },

      TSTypeReference(node) {
        if (node.typeName.type !== "Identifier") return;
        const replacement = MUTABLE_COLLECTIONS[node.typeName.name];
        if (!replacement) return;
        if (!inDataPosition(node)) return;
        context.report({
          node: node.typeName,
          message:
            `${node.typeName.name} is mutable; data types use ${replacement}.`,
          hint: `Build a new ${replacement} instead of mutating one in place.`,
          fix: (fixer) => fixer.replaceText(node.typeName, replacement),
        });
      },
    };
  },
};
