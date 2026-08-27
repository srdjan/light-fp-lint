// @light-fp adapter -- a lint rule adapts Deno's visitor API: it reports through a
// void callback and is driven by mutation it does not own.
import { layerOf, readPragma, toPosix } from "../layer.ts";

const ADAPTER_SEGMENTS = new Set([
  "adapters",
  "adapter",
  "infra",
  "scripts",
  "bin",
]);

const stripExtension = (specifier: string): string =>
  specifier.replace(/\.(ts|tsx|js|jsx|mjs|cjs)$/, "");

/**
 * True when a specifier names an adapter. Segment matching, not substring
 * matching: `../adapters/http.ts` and the sibling module `../adapters.ts` both
 * count, while a package called `my-adapters-helper` does not.
 */
export const namesAdapter = (specifier: string): boolean =>
  stripExtension(toPosix(specifier)).split("/").some((segment) =>
    ADAPTER_SEGMENTS.has(segment)
  );

const isRelative = (specifier: string): boolean =>
  specifier.startsWith(".") || specifier.startsWith("/");

export const layerBoundary: Deno.lint.Rule = {
  create(context) {
    // This rule runs everywhere, because reporting a malformed pragma is its job
    // too and a malformed pragma leaves the file in the fail-closed domain layer.
    const pragma = readPragma(context.sourceCode);
    const checksBoundary = layerOf(context.filename, context.sourceCode) !==
      "adapter";

    const checkSource = (node: Deno.lint.Node | null | undefined) => {
      if (!node || node.type !== "Literal" || typeof node.value !== "string") {
        return;
      }
      if (!namesAdapter(node.value)) return;
      context.report({
        node,
        message: "Domain code must not import from an adapter.",
        hint:
          "Depend on a port type and take the capability as a parameter; let main.ts wire the adapter.",
      });
    };

    return {
      Program() {
        if (pragma.kind !== "invalid") return;
        context.report({
          range: pragma.range,
          message: `Unknown light-fp layer "${pragma.token}".`,
          hint:
            "Use @light-fp domain, @light-fp adapter, or @light-fp prelude. The file is treated as domain until this is fixed.",
        });
      },

      ImportDeclaration(node) {
        if (!checksBoundary) return;
        checkSource(node.source);
        // A side-effect-only import runs the module for what it does, not for
        // what it exports, which is the one import form that is itself an effect.
        if (node.specifiers.length === 0 && isRelative(node.source.value)) {
          context.report({
            node,
            message: "A side-effect import runs code at load time.",
            hint:
              "Import a value or a type, and move the side effect into an adapter.",
          });
        }
      },

      ExportNamedDeclaration(node) {
        if (!checksBoundary) return;
        checkSource(node.source);
      },

      ExportAllDeclaration(node) {
        if (!checksBoundary) return;
        checkSource(node.source);
      },

      ImportExpression(node) {
        if (!checksBoundary) return;
        context.report({
          node,
          message: "Dynamic import is an effect, whatever it targets.",
          hint: "Import statically, or move the dynamic load into an adapter.",
        });
      },
    };
  },
};
