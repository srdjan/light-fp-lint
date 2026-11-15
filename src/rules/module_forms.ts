// @light-fp adapter -- a lint rule adapts Deno's visitor API: it reports through a
// void callback and is driven by mutation it does not own.
import { isDomain, isRelativeSpecifier } from "../layer.ts";

const DEFAULT_HINT =
  "Export a named declaration, such as `export function name(...)`.";

const NON_TS_EXTENSION = /\.(?:js|jsx|mjs|cjs)$/;

const nameOf = (name: Deno.lint.Identifier | Deno.lint.StringLiteral): string =>
  name.type === "Identifier" ? name.name : name.value;

/**
 * `light-fp/module-forms`: domain code uses TypeScript files, named imports, and
 * named exports declared in the module that exports them. Each import and
 * export names its binding, so a reader finds where every name comes from.
 * Relative side-effect imports and dynamic `import()` belong to `layer-boundary`.
 */
export const moduleForms: Deno.lint.Rule = {
  create(context) {
    if (!isDomain(context.filename, context.sourceCode)) return {};

    const importedNames = (): ReadonlySet<string> =>
      new Set(
        context.sourceCode.ast.body.flatMap((statement) =>
          statement.type === "ImportDeclaration"
            ? statement.specifiers.map((specifier) => specifier.local.name)
            : []
        ),
      );

    return {
      Program(node) {
        if (!NON_TS_EXTENSION.test(context.filename.split(/[?#]/, 1)[0])) {
          return;
        }
        context.report({
          node,
          message: "Domain code lives in a TypeScript file.",
          hint: "Rename the file to .ts, or to .tsx for JSX.",
        });
      },

      ImportDeclaration(node) {
        if (
          node.specifiers.length === 0 &&
          !isRelativeSpecifier(node.source.value)
        ) {
          context.report({
            node,
            message: "A side-effect import runs code at load time.",
            hint:
              "Import a named value or type, and move the side effect into an adapter.",
          });
        }
      },

      ImportDefaultSpecifier(node) {
        context.report({
          node,
          message: "A default import hides the name the module exports.",
          hint:
            'Import the named export, for example `import { name } from "./mod.ts"`.',
        });
      },

      ImportNamespaceSpecifier(node) {
        context.report({
          node,
          message: "A namespace import hides which names the file uses.",
          hint: "Import each name you use.",
        });
      },

      ExportAllDeclaration(node) {
        context.report({
          node,
          message: "A re-export hides where a name is declared.",
          hint:
            "Import the name from its module, and declare the export in the module that owns it.",
        });
      },

      ExportNamedDeclaration(node) {
        if (node.source) {
          context.report({
            node,
            message: "A re-export hides where a name is declared.",
            hint:
              "Import the name from its module, and declare the export in the module that owns it.",
          });
          return;
        }
        const imported = importedNames();
        for (const specifier of node.specifiers) {
          if (specifier.type !== "ExportSpecifier") continue;
          if (nameOf(specifier.exported) === "default") {
            context.report({
              node: specifier,
              message: "A default export has no name that importers must use.",
              hint: DEFAULT_HINT,
            });
            continue;
          }
          if (!imported.has(nameOf(specifier.local))) continue;
          context.report({
            node: specifier,
            message: "Exporting an imported name is a re-export.",
            hint:
              "Import the name from its module, and declare the export in the module that owns it.",
          });
        }
      },

      ExportDefaultDeclaration(node) {
        context.report({
          node,
          message: "A default export has no name that importers must use.",
          hint: DEFAULT_HINT,
        });
      },
    };
  },
};
