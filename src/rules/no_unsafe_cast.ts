// @light-fp adapter -- a lint rule adapts Deno's visitor API: it reports through a
// void callback and is driven by mutation it does not own.
import { isDomain, isPrelude } from "../layer.ts";

const SUPPRESSIONS = /@ts-(ignore|expect-error|nocheck)/;

const CAST_HINT =
  "Use `satisfies`, narrow with a type guard, or move the cast into the smart constructor beside the type it creates.";

/** Type alias and interface names declared anywhere in this file. */
const localTypeNames = (ast: Deno.lint.Program): ReadonlySet<string> => {
  const names = new Set<string>();
  const visit = (node: Deno.lint.Node) => {
    if (
      node.type === "TSTypeAliasDeclaration" ||
      node.type === "TSInterfaceDeclaration"
    ) {
      names.add(node.id.name);
    }
    if (node.type === "ExportNamedDeclaration" && node.declaration) {
      visit(node.declaration);
    }
  };
  for (const statement of ast.body) visit(statement);
  return names;
};

const targetName = (typeNode: Deno.lint.Node): string | undefined => {
  if (typeNode.type !== "TSTypeReference") return undefined;
  const name = typeNode.typeName;
  if (name.type === "Identifier") return name.name;
  return undefined;
};

const isConstAssertion = (typeNode: Deno.lint.Node): boolean =>
  targetName(typeNode) === "const";

export const noUnsafeCast: Deno.lint.Rule = {
  create(context) {
    if (!isDomain(context.filename, context.sourceCode)) return {};
    // The prelude builds the branded types everything else consumes, so it is the
    // one place a cast is the point rather than an escape.
    if (isPrelude(context.filename, context.sourceCode)) return {};

    const local = localTypeNames(context.sourceCode.ast);

    return {
      Program() {
        for (const comment of context.sourceCode.getAllComments()) {
          const match = SUPPRESSIONS.exec(comment.value);
          if (!match) continue;
          context.report({
            range: comment.range,
            message: `\`@ts-${match[1]}\` switches the type checker off.`,
            hint:
              "The gate depends on `deno check` proving what the linter cannot. Fix the type instead.",
          });
        }
      },

      TSAsExpression(node) {
        if (isConstAssertion(node.typeAnnotation)) return;
        // Casting to a type declared in this file is how a smart constructor
        // builds a branded value, and the brand is unforgeable elsewhere because
        // the cast is illegal elsewhere.
        const name = targetName(node.typeAnnotation);
        if (name && local.has(name)) return;
        context.report({
          node,
          message:
            "A cast overrules the type checker, which is what makes a brand forgeable.",
          hint: CAST_HINT,
        });
      },

      TSTypeAssertion(node) {
        context.report({
          node,
          message: "Angle-bracket casts overrule the type checker.",
          hint: CAST_HINT,
        });
      },

      TSNonNullExpression(node) {
        context.report({
          node,
          message: "`!` asserts a value is present without proving it.",
          hint:
            "Narrow with a check, or return `err(...)` when the value is missing.",
        });
      },

      TSAnyKeyword(node) {
        context.report({
          node,
          message: "`any` disables checking for everything it touches.",
          hint:
            "Use `unknown` and narrow it, so the parse happens once and explicitly.",
        });
      },
    };
  },
};
