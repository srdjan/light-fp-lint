// @light-fp adapter -- a lint rule adapts Deno's visitor API: it reports through a
// void callback and is driven by mutation it does not own.
import { isDomain } from "../layer.ts";

// One backslash escape. The first group matches a line continuation. The second
// matches an escape outside the closed set `\n \r \t \b \f \v \0 \\ \' \" \` \$
// \xHH \uHHHH \u{H...}`.
const ESCAPE =
  /\\(?:u\{[0-9A-Fa-f]+\}|u[0-9A-Fa-f]{4}|x[0-9A-Fa-f]{2}|[nrtbfv0\\'"`$]|(\r\n|[\n\r\u2028\u2029])|([\s\S]))/g;

const NON_ASCII = /[\u0080-\uFFFF]/;

type EscapeProblems = {
  readonly unknownEscape: boolean;
  readonly lineContinuation: boolean;
};

const escapeProblems = (text: string): EscapeProblems => {
  const matches = [...text.matchAll(ESCAPE)];
  return {
    lineContinuation: matches.some((match) => match[1] !== undefined),
    unknownEscape: matches.some((match) => match[2] !== undefined),
  };
};

/**
 * `light-fp/lexical-forms`: domain code writes each string with escapes from a
 * closed set, never continues a string over a line break, and names every
 * identifier with ASCII characters. Legacy octal literals belong to Deno's
 * `no-octal` rule.
 */
export const lexicalForms: Deno.lint.Rule = {
  create(context) {
    if (!isDomain(context.filename, context.sourceCode)) return {};

    const checkEscapes = (node: Deno.lint.Node, text: string) => {
      const { unknownEscape, lineContinuation } = escapeProblems(text);
      if (unknownEscape) {
        context.report({
          node,
          message: "This string holds an escape outside the allowed set.",
          hint:
            "Remove the backslash, or write one of \\n \\r \\t \\b \\f \\v \\0 \\\\ \\' \\\" \\` \\$ \\xHH \\uHHHH \\u{H...}.",
        });
      }
      if (lineContinuation) {
        context.report({
          node,
          message: "A backslash before a line break continues a string.",
          hint: "Join the lines, or write \\n.",
        });
      }
    };

    return {
      Literal(node) {
        if (typeof node.value !== "string") return;
        // JSX attribute strings carry no escapes: a backslash there is text.
        if (node.parent?.type === "JSXAttribute") return;
        checkEscapes(node, node.raw.slice(1, -1));
      },

      TemplateElement(node) {
        const template = node.parent;
        // A tag reads the raw text, so a tagged template keeps its escapes.
        if (template?.parent?.type === "TaggedTemplateExpression") return;
        checkEscapes(node, node.raw);
      },

      Identifier(node) {
        if (!NON_ASCII.test(node.name)) return;
        context.report({
          node,
          message: "An identifier holds a character outside ASCII.",
          hint: "Rename it with ASCII letters, digits, `_`, or `$`.",
        });
      },
    };
  },
};
