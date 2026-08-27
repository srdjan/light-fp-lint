// @light-fp adapter -- a lint rule adapts Deno's visitor API: it reports through a
// void callback and is driven by mutation it does not own.
import { layerOf } from "../layer.ts";

const FUNCTION_SCOPES = new Set([
  "FunctionDeclaration",
  "FunctionExpression",
  "ArrowFunctionExpression",
  "MethodDefinition",
]);

const isAllowedStatementExpression = (node: Deno.lint.Node): boolean =>
  node.type === "AssignmentExpression" ||
  node.type === "UpdateExpression" ||
  node.type === "YieldExpression" ||
  (node.type === "CallExpression" && node.callee.type === "Super");

const isDirective = (
  node: Deno.lint.ExpressionStatement,
  ancestors: readonly Deno.lint.Node[],
): boolean => {
  if (node.expression.type !== "Literal") return false;
  if (typeof node.expression.value !== "string") return false;
  const block = ancestors.at(-1);
  const owner = ancestors.at(-2);
  if (!block || block.type !== "BlockStatement" || !owner) return false;
  if (!FUNCTION_SCOPES.has(owner.type)) return false;
  const position = block.body.indexOf(node);
  return position >= 0 &&
    block.body.slice(0, position + 1).every((statement) =>
      statement.type === "ExpressionStatement" &&
      statement.expression.type === "Literal" &&
      typeof statement.expression.value === "string"
    );
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
    if (layerOf(context.filename, context.sourceCode) === "adapter") return {};

    return {
      ExpressionStatement(node) {
        // Module scope is pure-module's territory; this rule owns function bodies.
        const ancestors = context.sourceCode.getAncestors(node);
        const insideFunction = ancestors.some((ancestor) =>
          FUNCTION_SCOPES.has(ancestor.type)
        );
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

        // Assignments and updates exist for their state transition. A directive
        // prologue is metadata, yield advances a generator, and super() is a
        // required constructor transition. Every other expression makes a value
        // and then silently loses it.
        if (isAllowedStatementExpression(expression)) return;
        if (isDirective(node, ancestors)) return;

        context.report({
          node,
          message: "The value this expression produces is discarded.",
          hint:
            "Assign it, return it, or match on its _tag. If nothing needs the value, the call does not belong in domain code.",
        });
      },
    };
  },
};
