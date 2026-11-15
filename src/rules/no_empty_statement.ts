// @light-fp adapter -- a lint rule adapts Deno's visitor API: it reports through a
// void callback and is driven by mutation it does not own.

const HIDDEN_MESSAGE =
  "Deno hides an empty statement and every statement after it in the same block from lint rules.";
const HIDDEN_HINT = "Remove the standalone semicolon.";
const EMPTY_MESSAGE = "An empty statement does nothing.";
const EMPTY_HINT = "Write a block with a body, or remove the statement.";

/**
 * `light-fp/no-empty-statement`: an empty statement does nothing, and Deno's
 * plugin AST drops a standalone `;` and every later statement in the same list,
 * so the rule runs in every layer.
 */
export const noEmptyStatement: Deno.lint.Rule = {
  create(context) {
    const comments = context.sourceCode.getAllComments();

    /** The source text between two offsets, with each comment blanked out. */
    const codeBetween = (from: number, to: number): string =>
      comments.reduce(
        (masked, comment) =>
          comment.range[0] >= from && comment.range[1] <= to
            ? masked.slice(0, comment.range[0] - from) +
              " ".repeat(comment.range[1] - comment.range[0]) +
              masked.slice(comment.range[1] - from)
            : masked,
        context.sourceCode.text.slice(from, to),
      );

    // Text that remains between the visible statements, outside comments, is
    // the code that Deno hid.
    const reportHiddenCode = (
      start: number,
      statements: readonly Deno.lint.Node[],
      end: number,
    ): void => {
      const bounds = [
        start,
        ...statements.flatMap((statement) => statement.range),
        end,
      ];
      for (let index = 0; index < bounds.length; index += 2) {
        const offset = codeBetween(bounds[index], bounds[index + 1]).search(
          /\S/,
        );
        if (offset === -1) continue;
        const at = bounds[index] + offset;
        context.report({
          range: [at, at + 1],
          message: HIDDEN_MESSAGE,
          hint: HIDDEN_HINT,
        });
      }
    };

    // A lone `;` used as a body is stored as a `null` body.
    const reportEmptyBody = (
      node: Deno.lint.Node,
      body: Deno.lint.Node | null,
    ): void => {
      if (body !== null) return;
      context.report({ node, message: EMPTY_MESSAGE, hint: EMPTY_HINT });
    };

    // `else ;` leaves `alternate` null, so the `else` keyword stays in the text
    // after the consequent.
    const reportEmptyElse = (node: Deno.lint.IfStatement): void => {
      if (node.alternate !== null) return;
      const from = (node.consequent ?? node.test).range[1];
      const found = /\belse\b/.exec(codeBetween(from, node.range[1]));
      if (found === null) return;
      context.report({
        range: [from + found.index, node.range[1]],
        message: EMPTY_MESSAGE,
        hint: EMPTY_HINT,
      });
    };

    const reportBlockBody = (
      node: Deno.lint.BlockStatement | Deno.lint.TSModuleBlock,
    ): void => {
      reportHiddenCode(node.range[0] + 1, node.body, node.range[1] - 1);
    };

    return {
      Program(node) {
        const text = context.sourceCode.text;
        const newline = text.indexOf("\n");
        const start = !text.startsWith("#!")
          ? 0
          : newline === -1
          ? text.length
          : newline + 1;
        reportHiddenCode(start, node.body, text.length);
      },

      BlockStatement: reportBlockBody,

      TSModuleBlock: reportBlockBody,

      // The statement list starts after the case colon. The test range excludes
      // parentheses, so the first `:` after the test, outside comments, is the
      // case colon.
      SwitchCase(node) {
        const from = node.test ? node.test.range[1] : node.range[0];
        const colon = codeBetween(from, node.range[1]).indexOf(":");
        reportHiddenCode(from + colon + 1, node.consequent, node.range[1]);
      },

      IfStatement(node) {
        reportEmptyBody(node, node.consequent);
        reportEmptyElse(node);
      },

      LabeledStatement(node) {
        reportEmptyBody(node, node.body);
      },

      WhileStatement(node) {
        reportEmptyBody(node, node.body);
      },

      DoWhileStatement(node) {
        reportEmptyBody(node, node.body);
      },

      ForStatement(node) {
        reportEmptyBody(node, node.body);
      },

      ForInStatement(node) {
        reportEmptyBody(node, node.body);
      },

      ForOfStatement(node) {
        reportEmptyBody(node, node.body);
      },
    };
  },
};
