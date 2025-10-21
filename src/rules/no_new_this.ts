import { normalizeOptions, toPosix } from "../util/options.ts";

export const noNew: Deno.lint.RuleModule = {
  meta: { docs: { description: "Disallow `new` in domain code" } },
  create(context) {
    const opts = normalizeOptions(context.options?.[0]);
    const file = toPosix(context.filename ?? "");
    if (!opts.domainMatcher(file) || opts.adapterMatcher(file)) return {};
    return {
      NewExpression(node) {
        context.report({ node, message: "Use a factory function instead of `new` in domain code." });
      },
    };
  },
};

export const noThis: Deno.lint.RuleModule = {
  meta: { docs: { description: "Disallow `this` in domain code" } },
  create(context) {
    const opts = normalizeOptions(context.options?.[0]);
    const file = toPosix(context.filename ?? "");
    if (!opts.domainMatcher(file) || opts.adapterMatcher(file)) return {};
    return {
      ThisExpression(node) {
        context.report({ node, message: "Avoid `this`; prefer explicit parameters and closures." });
      },
    };
  },
};
