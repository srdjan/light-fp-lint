import { normalizeOptions, toPosix } from "../util/options.ts";

const isTopLevel = (node: Deno.lint.Node) => (node as any).parent?.type === "Program";

export const noTopLevelEffects: Deno.lint.RuleModule = {
  meta: { docs: { description: "No side-effects at module top level in domain files" } },
  create(context) {
    const opts = normalizeOptions(context.options?.[0]);
    const file = toPosix(context.filename ?? "");
    if (!opts.domainMatcher(file) || opts.adapterMatcher(file)) return {};

    return {
      CallExpression(node) {
        if (!isTopLevel(node)) return;
        const callee: any = (node as any).callee;
        const name = callee?.type === "Identifier" ? callee.name :
          (callee?.type === "MemberExpression" && !callee.computed && callee.property.type === "Identifier")
            ? callee.property.name : undefined;
        if (name === "fetch" || name === "structuredClone") {
          context.report({ node, message: "Move side-effects behind an adapter or a setup factory." });
        }
      },
      'MemberExpression[object.name="Deno"]'(node) {
        if (isTopLevel(node as any)) context.report({ node, message: "No `Deno.*` at top level in domain." });
      },
      'MemberExpression[object.name="Date"][property.name="now"]'(node) {
        if (isTopLevel(node as any)) context.report({ node, message: "No `Date.now()` at top level in domain." });
      },
      'MemberExpression[object.name="Math"][property.name="random"]'(node) {
        if (isTopLevel(node as any)) context.report({ node, message: "No `Math.random()` at top level in domain." });
      },
    };
  },
};
