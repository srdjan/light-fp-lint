// @light-fp adapter -- a lint rule adapts Deno's visitor API: it reports through a
// void callback and is driven by mutation it does not own.
import { isDomain } from "../layer.ts";

const FUNCTION_SCOPES = new Set([
  "FunctionDeclaration",
  "FunctionExpression",
  "ArrowFunctionExpression",
  "MethodDefinition",
]);

const DISCARDED: Readonly<Record<string, string>> = {
  CallExpression: "The value this call returns is discarded.",
  AwaitExpression: "The value this await produces is discarded.",
  TaggedTemplateExpression:
    "The value this tagged template produces is discarded.",
};

/**
 * The unhandled-Result rule, made decidable by asking a syntactic question.
 *
 * "Is this a Result?" needs type information the linter does not have. "Is a
 * value being thrown away?" is pure syntax. Inside a pure function the two
 * coincide: a discarded call result is either dead code or a hidden effect, so
 * the same rule also catches floating promises and fire-and-forget effects.
 */
export const noDiscardedValues: Deno.lint.Rule = {
  create(context) {
    if (!isDomain(context.filename, context.sourceCode)) return {};

    return {
      ExpressionStatement(node) {
        // Module scope is pure-module's territory; this rule owns function bodies.
        const insideFunction = context.sourceCode
          .getAncestors(node)
          .some((ancestor) => FUNCTION_SCOPES.has(ancestor.type));
        if (!insideFunction) return;

        const expression = node.expression;

        // `void expr` is an explicit discard, which is still a discard.
        if (
          expression.type === "UnaryExpression" &&
          expression.operator === "void"
        ) {
          context.report({
            node,
            message: "The value this expression produces is discarded.",
            hint:
              "Assign it, return it, or match on its _tag. `void` hides the problem instead of solving it.",
          });
          return;
        }

        // A directive prologue such as "use strict" is a string, not a value.
        const message = DISCARDED[expression.type];
        if (!message) return;

        context.report({
          node,
          message,
          hint:
            "Assign it, return it, or match on its _tag. If nothing needs the value, the call does not belong in domain code.",
        });
      },
    };
  },
};
