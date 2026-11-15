// @light-fp adapter -- a lint rule adapts Deno's visitor API: it reports through a
// void callback and is driven by mutation it does not own.
import { isDomain } from "../layer.ts";

const MUTATING_METHODS: readonly string[] = [
  "push",
  "pop",
  "shift",
  "unshift",
  "splice",
  "sort",
  "reverse",
  "fill",
  "copyWithin",
  "set",
  "add",
  "delete",
  "clear",
];

const LIVE_MESSAGE =
  "A loop body changes the collection that the loop iterates.";
const LIVE_HINT = "Read one collection and build the changed one separately.";

/** An identifier, or a chain of non-computed member reads such as `state.items`. */
const isReadChain = (node: Deno.lint.Node): boolean =>
  node.type === "Identifier" ||
  (node.type === "MemberExpression" && !node.computed &&
    isReadChain(node.object));

const methodName = (node: Deno.lint.MemberExpression): string | undefined => {
  if (!node.computed) {
    return node.property.type === "Identifier" ? node.property.name : undefined;
  }
  return node.property.type === "Literal" &&
      typeof node.property.value === "string"
    ? node.property.value
    : undefined;
};

/**
 * `light-fp/statement-forms`: domain code branches with `if` or a lookup and
 * iterates a finite collection with `for...of`. A `switch`, an unbounded loop,
 * a label, an empty statement, and a loop that changes its own collection each
 * hide the control flow from the reader.
 */
export const statementForms: Deno.lint.Rule = {
  create(context) {
    if (!isDomain(context.filename, context.sourceCode)) return {};

    const textOf = (node: Deno.lint.Node): string =>
      context.sourceCode.getText(node);

    /** True when `node` sits in the body of a `for...of` over the source text `text`. */
    const isInLoopOver = (
      node: Deno.lint.Node | Deno.lint.TSParameterProperty,
      text: string,
    ): boolean => {
      if (
        node.type === "Program" || node.type === "Line" ||
        node.type === "Block"
      ) {
        return false;
      }
      const parent = node.parent;
      if (
        parent.type === "ForOfStatement" && parent.body === node &&
        isReadChain(parent.right) && textOf(parent.right) === text
      ) {
        return true;
      }
      return isInLoopOver(parent, text);
    };

    const reportLive = (
      node: Deno.lint.Node,
      target: Deno.lint.Node,
    ): void => {
      if (!isInLoopOver(node, textOf(target))) return;
      context.report({ node, message: LIVE_MESSAGE, hint: LIVE_HINT });
    };

    const reportMemberWrite = (
      node: Deno.lint.Node,
      target: Deno.lint.Node,
    ): void => {
      if (target.type === "MemberExpression") reportLive(node, target.object);
    };

    // Deno's parser drops a standalone `;` and stores a lone `;` body as `null`.
    const reportEmptyBody = (
      node: Deno.lint.Node,
      body: Deno.lint.Node | null,
    ): void => {
      if (body !== null) return;
      context.report({
        node,
        message: "An empty statement does nothing.",
        hint: "Write a block with a body, or remove the statement.",
      });
    };

    return {
      IfStatement(node) {
        reportEmptyBody(node, node.consequent);
      },

      LabeledStatement(node) {
        reportEmptyBody(node, node.body);
        context.report({
          node,
          message: "A label makes `break` and `continue` jump across loops.",
          hint:
            "Use a conditional, or move the loop into a function and return.",
        });
      },

      SwitchStatement(node) {
        context.report({
          node,
          message: "A `switch` statement falls through and hides its branches.",
          hint: "Use `match` from `ts-pattern`, or `if`/`else`.",
        });
      },

      WhileStatement(node) {
        reportEmptyBody(node, node.body);
        context.report({
          node,
          message: "A `while` loop has no bound on its iterations.",
          hint: "Iterate a finite collection with `for...of`.",
        });
      },

      DoWhileStatement(node) {
        reportEmptyBody(node, node.body);
        context.report({
          node,
          message: "A `do...while` loop has no bound on its iterations.",
          hint: "Iterate a finite collection with `for...of`.",
        });
      },

      ForStatement(node) {
        reportEmptyBody(node, node.body);
        context.report({
          node,
          message: "A C-style `for` loop manages its own counter.",
          hint:
            "Iterate the collection with `for...of`, or the indices with `for (const i of xs.keys())`.",
        });
      },

      ForInStatement(node) {
        reportEmptyBody(node, node.body);
        context.report({
          node,
          message:
            "A `for...in` loop walks inherited keys in an unspecified order.",
          hint: "Write `for (const key of Object.keys(record))`.",
        });
      },

      ForOfStatement(node) {
        reportEmptyBody(node, node.body);
      },

      CallExpression(node) {
        const callee = node.callee;
        if (callee.type !== "MemberExpression") return;
        const name = methodName(callee);
        if (name === undefined || !MUTATING_METHODS.includes(name)) return;
        reportLive(node, callee.object);
      },

      AssignmentExpression(node) {
        reportMemberWrite(node, node.left);
      },

      UpdateExpression(node) {
        reportMemberWrite(node, node.argument);
      },

      UnaryExpression(node) {
        if (node.operator === "delete") reportMemberWrite(node, node.argument);
      },
    };
  },
};
