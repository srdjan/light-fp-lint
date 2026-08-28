// @light-fp adapter -- a test helper: it fabricates a SourceCode without
// getAllComments to force the Deno 2.2 comment-scanner fallback on any Deno.
//
// On Deno 2.3+, runPlugin exposes getAllComments and the fallback in
// src/comments.ts never runs, so its 44% function coverage was only exercised
// by the real CLI under the 2.2 CI matrix. These cases judge the fallback on
// every Deno version: scanText, collectBlockedRanges, and childKeysOf must
// find comments without mistaking strings, templates, or regexes for them.
import { assertEquals } from "@std/assert";
import { commentsOf, headerComments, scanComments } from "../src/comments.ts";

// Capture a real AST, then hand it to scanComments without getAllComments.
const astOf = (source: string): Deno.lint.Program => {
  let ast: Deno.lint.Program | undefined;
  Deno.lint.runPlugin(
    {
      name: "probe",
      rules: {
        probe: {
          create(context) {
            ast = context.sourceCode.ast;
            return {};
          },
        },
      },
    },
    "/repo/src/domain/x.ts",
    source,
  );
  return ast!;
};

const fallbackComments = (source: string): readonly string[] => {
  const fake: Deno.lint.SourceCode = {
    ast: astOf(source),
    get text() {
      return source;
    },
  } as Deno.lint.SourceCode;
  return scanComments(fake).map((c) => c.value);
};

Deno.test("comments fallback: basic comments are found", () => {
  assertEquals(
    fallbackComments("// hello\nconst x = 1; // tail"),
    [" hello", " tail"],
  );
});

Deno.test("comments fallback: block comments are found", () => {
  assertEquals(
    fallbackComments("/* block */ const x = 1;"),
    [" block "],
  );
});

Deno.test("comments fallback: strings do not leak comment markers", () => {
  const source =
    `const url = "http://x/y"; // real\nconst path = 'a/*b'; // real2\n`;
  assertEquals(fallbackComments(source), [" real", " real2"]);
});

Deno.test("comments fallback: template literals do not leak comment markers", () => {
  const source = "const t = `a//b`; // real\n";
  assertEquals(fallbackComments(source), [" real"]);
});

Deno.test("comments fallback: template interpolation does not leak comment markers", () => {
  const source = "const t = `a${'x//y'}b`; // real\n";
  assertEquals(fallbackComments(source), [" real"]);
});

Deno.test("comments fallback: regex literals must not leak comment markers", () => {
  const source = "const r = /a\\/\\/b/; // real\n";
  assertEquals(fallbackComments(source), [" real"]);
});

Deno.test("comments fallback: division does not leak comment markers", () => {
  const source = "const q = a / b / c; // real\n";
  assertEquals(fallbackComments(source), [" real"]);
});

Deno.test("comments fallback: headerComments stops at the first statement", () => {
  const fake: Deno.lint.SourceCode = {
    ast: astOf("// head\nconst x = 1; // tail"),
    get text() {
      return "// head\nconst x = 1; // tail";
    },
  } as Deno.lint.SourceCode;
  assertEquals(
    headerComments(fake, 20).map((c) => c.value),
    [" head"],
  );
});

Deno.test("comments fallback: unavailable source text degrades to no comments", () => {
  const fake: Deno.lint.SourceCode = {
    ast: astOf("// head\nconst x = 1;"),
    get text() {
      throw new Error("no text on Deno 2.2 runPlugin");
    },
  } as unknown as Deno.lint.SourceCode;
  assertEquals(scanComments(fake), []);
});

Deno.test("comments fallback: commentsOf prefers getAllComments when present", () => {
  const fake: Deno.lint.SourceCode = {
    ast: astOf("// head\nconst x = 1;"),
    text: "// head\nconst x = 1;",
    getAllComments:
      () => [{ type: "Line" as const, value: " head", range: [0, 7] }],
  } as unknown as Deno.lint.SourceCode;
  assertEquals(commentsOf(fake).map((c) => c.value), [" head"]);
});

Deno.test("comments fallback: comment markers inside a header docstring", () => {
  const source = `/** Doc: use "// not a comment" inside. */\nconst x = 1;`;
  const fake: Deno.lint.SourceCode = {
    ast: astOf(source),
    get text() {
      return source;
    },
  } as Deno.lint.SourceCode;
  const found = headerComments(fake, 100);
  assertEquals(found.length, 1);
  assertEquals(found[0].value, `* Doc: use "// not a comment" inside. `);
});

Deno.test("comments fallback: regex character class with double slash", () => {
  const source = "const r = /[//]/; // real\n";
  assertEquals(fallbackComments(source), [" real"]);
});

Deno.test("comments fallback: regex with slash-star sequence", () => {
  const source = "const r = /a\\/*b/; // real\n";
  assertEquals(fallbackComments(source), [" real"]);
});

Deno.test("comments fallback: template with nested template", () => {
  const source = "const t = `a${`b//c`}d`; // real\n";
  assertEquals(fallbackComments(source), [" real"]);
});
