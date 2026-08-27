// @light-fp adapter -- a lint rule adapts Deno's visitor API: it reports through a
// void callback and is driven by mutation it does not own.
import { isDomain } from "../layer.ts";

const MODEL_HINT =
  "Model data as a `type`, behavior as functions, and variants as a tagged union.";

export const noOo: Deno.lint.Rule = {
  create(context) {
    if (!isDomain(context.filename, context.sourceCode)) return {};

    const report = (node: Deno.lint.Node, message: string, hint = MODEL_HINT) =>
      context.report({ node, message, hint });

    const reportClass = (node: Deno.lint.Node) =>
      report(
        node,
        "Classes bundle data with behavior, which the domain keeps apart.",
      );

    return {
      ClassDeclaration: reportClass,
      ClassExpression: reportClass,

      ThisExpression(node) {
        report(
          node,
          "`this` depends on how a function is called.",
          "Pass what the function needs as a parameter.",
        );
      },

      TSEnumDeclaration(node) {
        report(
          node,
          "`enum` creates a runtime value and a type that disagree.",
          'Use a union of string literals: `type Status = "open" | "closed"`.',
        );
      },

      TSModuleDeclaration(node) {
        // `declare global` and other ambient declarations stay legal.
        if (node.declare) return;
        report(
          node,
          "`namespace` is a second module system.",
          "Use a module: one file, named exports.",
        );
      },

      Decorator(node) {
        report(
          node,
          "Decorators apply behavior implicitly.",
          "Call the wrapping function where the value is built, so the wiring is visible.",
        );
      },

      TSParameterProperty(node) {
        report(
          node,
          "A parameter property declares hidden state on a class.",
          MODEL_HINT,
        );
      },

      Property(node) {
        if (node.kind !== "get" && node.kind !== "set") return;
        report(
          node,
          "An accessor hides computation behind what looks like a field.",
          "Expose a plain function so the cost of the call is visible at the call site.",
        );
      },
    };
  },
};
