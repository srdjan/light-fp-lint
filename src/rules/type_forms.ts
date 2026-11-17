// @light-fp adapter -- a lint rule adapts Deno's visitor API: it reports through a
// void callback and is driven by mutation it does not own.
import { isDomain } from "../layer.ts";

/**
 * `light-fp/type-forms`: domain code writes one spelling for each type. It
 * annotates a declaration instead of using `satisfies`, writes arrays as `T[]`,
 * and writes `undefined` instead of `void`.
 */
export const typeForms: Deno.lint.Rule = {
  create(context) {
    if (!isDomain(context.filename, context.sourceCode)) return {};

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
    };
  },
};
