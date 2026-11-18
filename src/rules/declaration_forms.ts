// @light-fp adapter -- a lint rule adapts Deno's visitor API: it reports through a
// void callback and is driven by mutation it does not own.
import { isFlatShorthandObjectPattern } from "../ast.ts";
import { isDomain } from "../layer.ts";

const DESTRUCTURING_MESSAGE =
  "A destructuring pattern binds several names at once.";
const DESTRUCTURING_HINT =
  "Bind the value to one name, then read each member into a `const`.";

const isDestructuring = (
  node: Deno.lint.Node,
): node is Deno.lint.ObjectPattern | Deno.lint.ArrayPattern =>
  node.type === "ObjectPattern" || node.type === "ArrayPattern";

const isFlatIdentifierPattern = (node: Deno.lint.ArrayPattern): boolean =>
  node.elements.length > 0 &&
  node.elements.every((element) => element?.type === "Identifier");

const isInsideFunctionBody = (
  node: Deno.lint.Node,
  sourceCode: Deno.lint.SourceCode,
): boolean => {
  const ancestors = sourceCode.getAncestors(node);
  for (const ancestor of ancestors.toReversed()) {
    if (ancestor.type === "StaticBlock") return false;
    if (
      ancestor.type !== "FunctionDeclaration" &&
      ancestor.type !== "FunctionExpression" &&
      ancestor.type !== "ArrowFunctionExpression"
    ) {
      continue;
    }
    const body = ancestor.body;
    return body?.type === "BlockStatement" && ancestors.includes(body);
  }
  return false;
};

const isFlatConstPositionalBinding = (
  node: Deno.lint.VariableDeclarator,
  sourceCode: Deno.lint.SourceCode,
): boolean => {
  if (node.id.type !== "ArrayPattern" || !isFlatIdentifierPattern(node.id)) {
    return false;
  }
  const declaration = node.parent;
  if (
    declaration.type !== "VariableDeclaration" || declaration.kind !== "const"
  ) {
    return false;
  }
  const owner = declaration.parent;
  if (owner.type === "ForInStatement") return false;
  if (owner.type === "ForOfStatement" && owner.await) return false;
  return isInsideFunctionBody(node, sourceCode);
};

const isFlatConstObjectBinding = (
  node: Deno.lint.VariableDeclarator,
  sourceCode: Deno.lint.SourceCode,
): boolean => {
  if (
    node.id.type !== "ObjectPattern" ||
    !isFlatShorthandObjectPattern(node.id)
  ) {
    return false;
  }
  const declaration = node.parent;
  if (
    declaration.type !== "VariableDeclaration" || declaration.kind !== "const"
  ) {
    return false;
  }
  const owner = declaration.parent;
  if (owner.type === "ForInStatement") return false;
  if (owner.type === "ForOfStatement" && owner.await) return false;
  return isInsideFunctionBody(node, sourceCode);
};

/**
 * `light-fp/declaration-forms`: domain code binds each name on its own. A flat
 * positional or flat shorthand object binding inside a function may bind
 * immutable names. An arrow assigned to a `const` is an immutable function
 * value. Other destructuring, a function expression, and a function assigned
 * to a mutable binding are refused.
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
          if (
            isFlatConstPositionalBinding(node, context.sourceCode) ||
            isFlatConstObjectBinding(node, context.sourceCode)
          ) {
            return;
          }
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
        if (
          declaration.kind === "const" &&
          init.type === "ArrowFunctionExpression"
        ) {
          return;
        }
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
