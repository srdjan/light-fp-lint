// @light-fp adapter -- a lint rule adapts Deno's visitor API: it reports through a
// void callback and is driven by mutation it does not own.
import { layerOf } from "../layer.ts";

const FUNCTION_SCOPES = new Set([
  "FunctionDeclaration",
  "FunctionExpression",
  "ArrowFunctionExpression",
  "MethodDefinition",
  "StaticBlock",
]);

const CONTROL_FLOW: Readonly<Record<string, string>> = {
  IfStatement: "a branch",
  ForStatement: "a loop",
  ForOfStatement: "a loop",
  ForInStatement: "a loop",
  WhileStatement: "a loop",
  DoWhileStatement: "a loop",
  SwitchStatement: "a switch",
  TryStatement: "a try block",
  LabeledStatement: "a labeled statement",
  BlockStatement: "a bare block",
};

export const pureModule: Deno.lint.Rule = {
  create(context) {
    if (layerOf(context.filename, context.sourceCode) === "adapter") return {};

    // Module scope means no enclosing function. Testing the direct parent for
    // `Program` never works for an expression: a top-level `await` sits inside a
    // declarator, several nodes down from Program.
    const atModuleScope = (node: Deno.lint.Node) =>
      !context.sourceCode.getAncestors(node).some((ancestor) =>
        FUNCTION_SCOPES.has(ancestor.type)
      );

    // Statements need one condition more. Only the outermost offending statement
    // is worth reporting: a bare call inside a top-level `if` is one problem, the
    // `if`, not two. So the statement must also sit directly in the module body,
    // looking through the export wrapper.
    const isModuleStatement = (node: Deno.lint.Node) => {
      if (!atModuleScope(node)) return false;
      const parent = context.sourceCode.getAncestors(node).at(-1);
      if (!parent) return false;
      return parent.type === "Program" ||
        parent.type === "ExportNamedDeclaration" ||
        parent.type === "ExportDefaultDeclaration";
    };

    const report = (node: Deno.lint.Node, message: string, hint: string) => {
      if (!isModuleStatement(node)) return;
      context.report({ node, message, hint });
    };

    const controlFlow = (node: Deno.lint.Node) => {
      const what = CONTROL_FLOW[node.type];
      if (!what) return;
      report(
        node,
        `A domain module must not run ${what} at load time.`,
        "A domain module declares; main.ts runs. Move this into a function.",
      );
    };

    const runsOnImport = (node: Deno.lint.Node) => {
      if (!atModuleScope(node)) return;
      const coveredByAncestor = context.sourceCode
        .getAncestors(node)
        .some((ancestor) =>
          ancestor.type === "ExpressionStatement" ||
          ancestor.type === "AwaitExpression" ||
          ancestor.type === "CallExpression" ||
          CONTROL_FLOW[ancestor.type] !== undefined
        );
      if (coveredByAncestor) return;
      context.report({
        node,
        message: "A module-level expression runs when the module is imported.",
        hint: "Return it from a function and call that function from main.ts.",
      });
    };

    return {
      VariableDeclaration(node) {
        if (node.kind === "const") return;
        report(
          node,
          `Module-level \`${node.kind}\` is shared mutable state.`,
          "Return the value from a function so each caller gets its own.",
        );
      },

      ExpressionStatement(node) {
        report(
          node,
          "A bare statement at module scope runs on import.",
          "A domain module declares; main.ts runs.",
        );
      },

      AwaitExpression(node) {
        // An expression, not a statement, so it uses the looser predicate.
        if (!atModuleScope(node)) return;
        context.report({
          node,
          message: "Top-level await runs work when the module is imported.",
          hint:
            "Return the promise from a function, or await it in an adapter.",
        });
      },

      CallExpression: runsOnImport,
      TaggedTemplateExpression: runsOnImport,

      IfStatement: controlFlow,
      ForStatement: controlFlow,
      ForOfStatement: controlFlow,
      ForInStatement: controlFlow,
      WhileStatement: controlFlow,
      DoWhileStatement: controlFlow,
      SwitchStatement: controlFlow,
      TryStatement: controlFlow,
      LabeledStatement: controlFlow,
      BlockStatement: controlFlow,
    };
  },
};
