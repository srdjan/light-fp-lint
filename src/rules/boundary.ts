import { normalizeOptions, toPosix } from "../util/options.ts";

export const importsBoundary: Deno.lint.RuleModule = {
  meta: { docs: { description: "Domain must not import from adapters" } },
  create(context) {
    const opts = normalizeOptions(context.options?.[0]);
    const file = toPosix(context.filename ?? "");
    if (!opts.domainMatcher(file) || opts.adapterMatcher(file)) return {};
    return {
      ImportDeclaration(node) {
        // @ts-ignore
        const spec = String(node.source.value);
        if (spec.includes("/adapters/")) {
          context.report({ node: node.source, message: "Domain code must not import from adapters. Depend on ports/capabilities instead." });
        }
      },
    };
  },
};
