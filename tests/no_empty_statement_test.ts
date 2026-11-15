import { assertEquals } from "@std/assert";
import { ADAPTER, check, diagnose, DOMAIN, fires, silent } from "./harness.ts";

check("no-empty-statement", [
  // A standalone `;`. Deno's plugin AST drops it and every later statement in
  // the same list, so no other rule sees that code.
  {
    name: "a standalone semicolon hides the statements after it",
    source: `export const b = 1;\n;\nlet a = 0;`,
    expect: fires("no-empty-statement"),
  },
  {
    name: "a leading semicolon hides the whole file",
    source: `;\nlet a = 0;`,
    expect: fires("no-empty-statement"),
  },
  {
    name: "two semicolons in one gap are one report",
    source: `;;\nexport const a = 1;`,
    expect: fires("no-empty-statement"),
  },
  {
    name: "a standalone semicolon in a function body",
    source: `export function f(): number { ; return 1; }`,
    expect: fires("no-empty-statement"),
  },
  {
    name: "a standalone semicolon in a nested block",
    source: `export function f(): number { { ; } return 1; }`,
    expect: fires("no-empty-statement"),
  },
  {
    name: "a semicolon inside a comment is not code",
    source: `export const a = 1; // a ; comment\n/* ; */`,
    expect: silent,
  },
  {
    name: "a shebang line is not hidden code",
    source: `#!/usr/bin/env -S deno run\nexport const a = 1;`,
    expect: silent,
  },
  {
    name: "a standalone semicolon in an adapter file",
    source: `;\nthrow new Error("x");`,
    filename: ADAPTER,
    expect: fires("no-empty-statement"),
  },
  {
    name: "a standalone semicolon in a prelude file",
    source: `// @light-fp prelude\n;\nexport const a = 1;`,
    expect: fires("no-empty-statement"),
  },
  {
    name: "a standalone semicolon in a case body",
    source:
      `export function f(x: number): void { switch (x) { case 1: ; run(); } }`,
    expect: fires("no-empty-statement"),
  },
  {
    name: "a parenthesized case test and a colon in a comment are fine",
    source:
      `export function f(x: number): void { switch (x) { case (1): run(); break; default /* : */ : run(); } }`,
    expect: silent,
  },
  {
    name: "a case with no body is fine",
    source:
      `export function f(x: number): void { switch (x) { case 1: case 2: run(); } }`,
    expect: silent,
  },
  {
    name: "a standalone semicolon in a namespace body",
    source: `export namespace N { ; export const n = 1; }`,
    expect: fires("no-empty-statement"),
  },
  {
    name: "a standalone semicolon in a static block",
    source: `export class A { static { ; run(); } }`,
    expect: fires("no-empty-statement"),
  },
  {
    name: "a namespace body and a static block without a semicolon are fine",
    source:
      `export namespace N { export const n = 1; }\nexport class A { static { run(); } }`,
    expect: silent,
  },
  {
    name: "a semicolon in a class body is not a statement",
    source: `export class A { ; m(): void {} }`,
    expect: silent,
  },
  // A lone `;` used as a body is stored as a `null` body.
  {
    name: "an if with a lone semicolon body",
    source: `function f(): void { if (check()) ; }`,
    expect: fires("no-empty-statement"),
  },
  {
    name: "a for of loop with a lone semicolon body",
    source: `function f(xs: readonly number[]): void { for (const x of xs) ; }`,
    expect: fires("no-empty-statement"),
  },
  {
    name: "a while loop with a lone semicolon body",
    source: `function f(x: boolean): void { while (x) ; }`,
    expect: fires("no-empty-statement"),
  },
  {
    name: "a label on a lone semicolon",
    source: `function f(): void { a: ; }`,
    expect: fires("no-empty-statement"),
  },
  {
    name: "an else with a lone semicolon body",
    source: `function f(x: boolean): void { if (x) { run(); } else ; }`,
    expect: fires("no-empty-statement"),
  },
  {
    name: "an if and an else that both have a lone semicolon body",
    source: `function f(x: boolean): void { if (x) ; else ; }`,
    expect: fires("no-empty-statement", 2),
  },
  {
    name: "an else with a body is fine",
    source:
      `function f(x: boolean): void { if (x) { run(); } else { run(); } }`,
    expect: silent,
  },
  {
    name: "a dangling else belongs to the inner if",
    source:
      `function f(a: boolean, b: boolean): void { if (a) if (b) { run(); } else ; }`,
    expect: fires("no-empty-statement"),
  },
  {
    name: "an else in a comment is not code",
    source: `function f(x: boolean): void { if (x) { run(); } /* else ; */ }`,
    expect: silent,
  },
  {
    name: "an empty block is fine",
    source: `function f(): void { if (check()) { } }`,
    expect: silent,
  },
]);

const messagesOf = (source: string): readonly string[] =>
  diagnose(source, DOMAIN)
    .filter((d) => d.id === "light-fp/no-empty-statement")
    .map((d) => d.message);

Deno.test("no-empty-statement: hidden code gets the hidden-code message", () => {
  assertEquals(messagesOf(`;\nlet a = 0;`), [
    "Deno hides an empty statement and every statement after it in the same block from lint rules.",
  ]);
});

Deno.test("no-empty-statement: an empty body gets the empty-body message", () => {
  assertEquals(messagesOf(`function f(): void { if (check()) ; }`), [
    "An empty statement does nothing.",
  ]);
});
