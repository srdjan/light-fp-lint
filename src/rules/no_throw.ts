// @light-fp adapter -- a lint rule adapts Deno's visitor API: it reports through a
// void callback and is driven by mutation it does not own.
import { isDomain } from "../layer.ts";

/**
 * Banning `try` alongside `throw` is what removes the need for any return-type
 * analysis. A function that can neither throw nor catch can only report failure
 * as a value, and `deno check` propagates that value's type from there.
 */
export const noThrow: Deno.lint.Rule = {
  create(context) {
    if (!isDomain(context.filename, context.sourceCode)) return {};

    return {
      ThrowStatement(node) {
        context.report({
          node,
          message:
            "Domain code reports failure as a value, not as an exception.",
          hint:
            'Return `err({ _tag: "..." })`, and wrap genuinely throwing calls with handleThrow at the boundary.',
        });
      },

      TryStatement(node) {
        context.report({
          node,
          message:
            "Domain code has nothing to catch, because nothing in it throws.",
          hint:
            "Move the try into the prelude's handleThrow or into an adapter, and match on the Result it returns.",
        });
      },
    };
  },
};
