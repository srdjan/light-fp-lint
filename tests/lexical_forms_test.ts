import { ADAPTER, check, fires, silent } from "./harness.ts";

check("lexical-forms", [
  {
    name: "an unknown escape in a string",
    source: `export const a = "a\\qb";`,
    expect: fires("lexical-forms"),
  },
  {
    name: "a regex-style escape in a string",
    source: `export const a = "\\d";`,
    expect: fires("lexical-forms"),
  },
  {
    name: "an unknown escape in a single-quoted string",
    source: `export const a = 'a\\a';`,
    expect: fires("lexical-forms"),
  },
  {
    name: "an unknown escape in a template quasi",
    source: "export const a = (n: number) => `x\\d${n}`;",
    expect: fires("lexical-forms"),
  },
  {
    name: "an unknown escape in each template quasi",
    source: "export const a = (n: number) => `x\\d${n}y\\e`;",
    expect: fires("lexical-forms", 2),
  },
  {
    name: "an unknown escape in an import source",
    source: `import { x } from "./a\\qb.ts";`,
    expect: fires("lexical-forms"),
  },
  {
    name: "an unknown escape in a literal type",
    source: `export type T = "\\d";`,
    expect: fires("lexical-forms"),
  },
  {
    name: "two unknown escapes in one string report once",
    source: `export const a = "\\q\\d";`,
    expect: fires("lexical-forms"),
  },
  {
    name: "every escape in the closed set is allowed",
    source:
      `export const a = "\\n\\r\\t\\b\\f\\v\\0\\\\\\'\\"\\\`\\$\\x41\\u0041\\u{1F600}";`,
    expect: silent,
  },
  {
    name: "allowed escapes in a template quasi",
    source: "export const a = (n: number) => `\\n\\`\\$\\${n}`;",
    expect: silent,
  },
  {
    name: "a tagged template reads raw text",
    source: "export const a = String.raw`\\q\\d`;",
    expect: silent,
  },
  {
    name: "a backslash in a JSX attribute is text",
    source: `export const a = <a b="\\d" />;`,
    filename: "/repo/src/domain/sample.tsx",
    expect: silent,
  },
  {
    name: "a line continuation in a string",
    source: `export const a = "a\\\nb";`,
    expect: fires("lexical-forms"),
  },
  {
    name: "a CRLF line continuation in a string",
    source: `export const a = "a\\\r\nb";`,
    expect: fires("lexical-forms"),
  },
  {
    name: "a CR line continuation in a string",
    source: `export const a = "a\\\rb";`,
    expect: fires("lexical-forms"),
  },
  {
    name: "a line separator continuation in a string",
    source: `export const a = "a\\\u2028b";`,
    expect: fires("lexical-forms"),
  },
  {
    name: "a paragraph separator continuation in a string",
    source: `export const a = "a\\\u2029b";`,
    expect: fires("lexical-forms"),
  },
  {
    name: "a line continuation in a template quasi",
    source: "export const a = (n: number) => `a\\\nb${n}`;",
    expect: fires("lexical-forms"),
  },
  {
    name: "a literal with both problems reports each kind",
    source: `export const a = "\\q\\\nb";`,
    expect: fires("lexical-forms", 2),
  },
  {
    name: "a newline escape is allowed",
    source: `export const a = "a\\nb";`,
    expect: silent,
  },
  {
    name: "a multi-line template without a backslash is allowed",
    source: "export const a = `a\nb`;",
    expect: silent,
  },
  {
    name: "a non-ASCII variable name",
    source: `export const café = 1;`,
    expect: fires("lexical-forms"),
  },
  {
    name: "each non-ASCII identifier is reported",
    source: `export const café = 1;\nexport const b = café;`,
    expect: fires("lexical-forms", 2),
  },
  {
    name: "a non-ASCII function name",
    source: `export function naïve(): number {\n  return 1;\n}`,
    expect: fires("lexical-forms"),
  },
  {
    name: "a non-ASCII string is allowed",
    source: `export const a = "café";`,
    expect: silent,
  },
  {
    name: "ASCII identifiers with _ and $ are allowed",
    source: `export const _a$1 = 1;`,
    expect: silent,
  },
  {
    name: "adapter files are exempt",
    source: `export const café = "a\\q";`,
    filename: ADAPTER,
    expect: silent,
  },
  {
    name: "prelude files are exempt",
    source: `// @light-fp prelude\nexport const café = "a\\q";`,
    expect: silent,
  },
]);
