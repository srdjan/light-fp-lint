// @light-fp adapter -- a lint rule adapts Deno's visitor API: it reports through a
// void callback and is driven by mutation it does not own.
import { isDomain } from "../layer.ts";

const DESTRUCTURING_MESSAGE =
  "A destructuring pattern binds several names at once.";
const DESTRUCTURING_HINT =
  "Bind the value to one name, then read each member into a `const`.";

const isDestructuring = (
  node: Deno.lint.Node,
): node is Deno.lint.ObjectPattern | Deno.lint.ArrayPattern =>
  node.type === "ObjectPattern" || node.type === "ArrayPattern";

/**
 * `light-fp/declaration-forms`: domain code binds each name on its own and
 * declares each function with a `function` declaration. A destructuring pattern
 * hides which member feeds which name, and a function-valued `const` hides the
 * function from a reader who scans for declarations.
 */
export const declarationForms: Deno.lint.Rule = {
  create(context) {
    if (!isDomain(context.filename, context.sourceCode)) return {};

    const reportPatternParams = (
      node:
        | Deno.lint.FunctionDeclaration
        | Deno.lint.FunctionExpression
        | Deno.lint.ArrowFunctionExpression,
    ): void => {
      for (const param of node.params) {
        const pattern = param.type === "AssignmentPattern" ? param.left : param;
        if (pattern.type === "TSParameterProperty") continue;
        if (!isDestructuring(pattern)) continue;
        context.report({
          node: pattern,
          message: DESTRUCTURING_MESSAGE,
          hint: DESTRUCTURING_HINT,
        });
      }
    };

    return {
      VariableDeclarator(node) {
        if (isDestructuring(node.id)) {
          context.report({
            node,
            message: DESTRUCTURING_MESSAGE,
            hint: DESTRUCTURING_HINT,
          });
          return;
        }
        const init = node.init;
        if (
          !init ||
          (init.type !== "ArrowFunctionExpression" &&
            init.type !== "FunctionExpression")
        ) {
          return;
        }
        const declaration = node.parent;
        if (declaration.type !== "VariableDeclaration") return;
        if (declaration.kind !== "const" && declaration.kind !== "let") return;
        if (declaration.parent.type === "ExportNamedDeclaration") {
          context.report({
            node,
            message: "An exported function is declared as a `const` binding.",
            hint: "Write `export function name(...): T { ... }`.",
          });
          return;
        }
        context.report({
          node,
          message: "A reusable helper is declared as a `const` binding.",
          hint: "Write a named `function` declaration.",
        });
      },

      FunctionDeclaration: reportPatternParams,
      FunctionExpression: reportPatternParams,
      ArrowFunctionExpression: reportPatternParams,
    };
  },
};
