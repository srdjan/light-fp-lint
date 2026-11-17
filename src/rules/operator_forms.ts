// @light-fp adapter -- a lint rule adapts Deno's visitor API: it reports through a
// void callback and is driven by mutation it does not own.
import { childValuesOf } from "../ast.ts";
import { isDomain } from "../layer.ts";

const COMPOUND_OPERATORS: readonly string[] = [
  "+=",
  "-=",
  "*=",
  "/=",
  "%=",
  "**=",
  "&=",
  "|=",
  "^=",
  "<<=",
  ">>=",
  ">>>=",
];

const LOGICAL_OPERATORS: readonly string[] = ["&&=", "||=", "??="];

const LOOSE_OPERATORS: readonly string[] = ["==", "!="];

const EQUALITY_OPERATORS: readonly string[] = ["===", "!==", "==", "!="];

const IMPURE_TYPES: readonly string[] = [
  "CallExpression",
  "NewExpression",
  "UpdateExpression",
  "AssignmentExpression",
  "AwaitExpression",
  "TaggedTemplateExpression",
];

const containsImpure = (value: unknown): boolean => {
  if (Array.isArray(value)) return value.some(containsImpure);
  if (typeof value !== "object" || value === null) return false;
  if ("type" in value && typeof value.type === "string") {
    if (IMPURE_TYPES.includes(value.type)) return true;
  }
  return childValuesOf(value).some(containsImpure);
};

const isBooleanLiteral = (node: Deno.lint.Node): boolean =>
  node.type === "Literal" && typeof node.value === "boolean";

const isStringLiteral = (node: Deno.lint.Node): boolean =>
  node.type === "Literal" && typeof node.value === "string";

const isInsideFunctionBody = (
  node: Deno.lint.Node,
  sourceCode: Deno.lint.SourceCode,
): boolean => {
  const ancestors = sourceCode.getAncestors(node);
  for (const ancestor of ancestors.toReversed()) {
    if (
      ancestor.type === "StaticBlock" ||
      ancestor.type === "PropertyDefinition"
    ) {
      return false;
    }
    if (
      ancestor.type !== "FunctionDeclaration" &&
      ancestor.type !== "FunctionExpression" &&
      ancestor.type !== "ArrowFunctionExpression"
    ) {
      continue;
    }
    const body = ancestor.body;
    return body !== null && (body === node || ancestors.includes(body));
  }
  return false;
};

/**
 * `light-fp/operator-forms`: domain code compares with strict equality, assigns
 * in its own statement, and builds values without coercing or hidden-effect
 * operators. A literal field-presence query inside a function retains the
 * language's inherited-property and Proxy `has` behavior. Each refused operator
 * either coerces a value, mutates a binding in the middle of an expression, or
 * runs an effect that a reader cannot see.
 */
export const operatorForms: Deno.lint.Rule = {
  create(context) {
    if (!isDomain(context.filename, context.sourceCode)) return {};

    const reportImpureTarget = (target: Deno.lint.Node): void => {
      if (target.type !== "MemberExpression" || !containsImpure(target)) return;
      context.report({
        node: target,
        message:
          "An assignment target that calls, creates, or assigns hides an effect in the target.",
        hint: "Compute the key or the object into a `const` first.",
      });
    };

    return {
      BinaryExpression(node) {
        if (LOOSE_OPERATORS.includes(node.operator)) {
          context.report({
            node,
            message: "Loose equality coerces its operands.",
            hint: "Write `===` or `!==`.",
          });
        }
        if (node.operator === "instanceof") {
          context.report({
            node,
            message: "`instanceof` tests a prototype chain, not a data shape.",
            hint: "Discriminate with a tag field such as `_tag`.",
          });
        }
        if (
          node.operator === "in" &&
          !(isStringLiteral(node.left) &&
            isInsideFunctionBody(node, context.sourceCode))
        ) {
          context.report({
            node,
            message:
              "`in` is allowed only for a string-literal field query inside a function body.",
            hint:
              'Move the query into a function and write a fixed key such as `"kind" in value`.',
          });
        }
        if (
          EQUALITY_OPERATORS.includes(node.operator) &&
          (isBooleanLiteral(node.left) || isBooleanLiteral(node.right))
        ) {
          context.report({
            node,
            message:
              "A comparison with a boolean literal restates the boolean.",
            hint: "Use the boolean directly: `x` or `!x`.",
          });
        }
      },

      UpdateExpression(node) {
        context.report({
          node,
          message: "`++` and `--` change a binding inside an expression.",
          hint: "Write `x = x + 1`.",
        });
        reportImpureTarget(node.argument);
      },

      AssignmentExpression(node) {
        if (COMPOUND_OPERATORS.includes(node.operator)) {
          context.report({
            node,
            message: "A compound assignment hides the read of its target.",
            hint: "Write `x = x + e`.",
          });
        }
        if (LOGICAL_OPERATORS.includes(node.operator)) {
          context.report({
            node,
            message: "A logical assignment hides a branch in an assignment.",
            hint: "Write `x = x ?? value`.",
          });
        }
        const parent = node.parent.type;
        if (
          parent !== "ExpressionStatement" && parent !== "ForStatement" &&
          parent !== "SequenceExpression"
        ) {
          context.report({
            node,
            message: "An assignment inside an expression hides a write.",
            hint: "Assign in its own statement.",
          });
        }
        reportImpureTarget(node.left);
      },

      UnaryExpression(node) {
        if (node.operator === "+") {
          context.report({
            node,
            message: "Unary `+` coerces its operand to a number.",
            hint:
              "Remove it from a number, or parse text with `parseFloat` or `parseInt`.",
          });
        } else if (node.operator === "void") {
          context.report({
            node,
            message: "`void` discards a value to produce `undefined`.",
            hint: "Write `undefined`, and run an effect as its own statement.",
          });
        } else if (node.operator === "delete") {
          context.report({
            node,
            message: "`delete` mutates an object.",
            hint: "Build a new object without the key.",
          });
        }
      },

      NewExpression(node) {
        context.report({
          node,
          message: "`new` builds an object with hidden construction logic.",
          hint: "Call a factory function, or write an object literal.",
        });
      },

      Literal(node) {
        if (!("regex" in node) || node.regex === undefined) return;
        context.report({
          node,
          message: "A regular expression literal packs a parser into a token.",
          hint:
            "Use string methods such as `includes`, `startsWith`, `endsWith`, `indexOf`, or `split` with a string.",
        });
      },

      SequenceExpression(node) {
        if (node.parent.type === "ForStatement") return;
        context.report({
          node,
          message: "A sequence expression runs several expressions as one.",
          hint: "Write separate statements.",
        });
      },

      TaggedTemplateExpression(node) {
        context.report({
          node,
          message: "A tagged template runs a function on a template literal.",
          hint: "Call the function with a string argument.",
        });
      },

      CallExpression(node) {
        // Deno marks every call in an optional chain, so `a?.b()` also reads
        // `optional: true`. Only a `?.` directly before the arguments counts.
        if (!node.optional) return;
        const head = context.sourceCode.text.slice(
          node.callee.range[1],
          node.range[1],
        );
        if (!head.slice(0, head.indexOf("(")).includes("?.")) return;
        context.report({
          node,
          message: "An optional call hides a branch in the call.",
          hint: "Check for `undefined`, then call.",
        });
      },

      MemberExpression(node) {
        // Deno marks the tail of an optional chain, so `a?.b[0]` also reads
        // `optional: true`. Only a `?.` directly before the key counts.
        if (!node.computed || !node.optional) return;
        const gap = context.sourceCode.text.slice(
          node.object.range[1],
          node.property.range[0],
        );
        if (!gap.includes("?.")) return;
        context.report({
          node,
          message: "An optional computed access hides a branch in the index.",
          hint: "Check for `undefined`, then index.",
        });
      },

      ConditionalExpression(node) {
        const parent = node.parent;
        if (
          parent.type !== "ConditionalExpression" || parent.test === node
        ) {
          return;
        }
        context.report({
          node,
          message: "A conditional inside a conditional is hard to read.",
          hint: "Use `match` from `ts-pattern`, or `if`/`else`.",
        });
      },
    };
  },
};
