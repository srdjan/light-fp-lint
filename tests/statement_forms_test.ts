import { assertEquals } from "@std/assert";
import { ADAPTER, check, diagnose, DOMAIN, fires, silent } from "./harness.ts";

check("statement-forms", [
  // Branching and loops.
  {
    name: "a switch statement",
    source:
      `function f(x: number): number { switch (x) { case 1: return 1; default: return 2; } }`,
    expect: fires("statement-forms"),
  },
  {
    name: "an if and else chain is fine",
    source:
      `function f(x: number): number { if (x === 1) { return 1; } else { return 2; } }`,
    expect: silent,
  },
  {
    name: "a while loop",
    source: `function f(x: boolean): void { while (x) { run(); } }`,
    expect: fires("statement-forms"),
  },
  {
    name: "a do while loop",
    source: `function f(x: boolean): void { do { run(); } while (x); }`,
    expect: fires("statement-forms"),
  },
  {
    name: "a C-style for loop",
    source:
      `function f(xs: readonly number[]): void { for (let i = 0; i < xs.length; i = i + 1) { run(xs[i]); } }`,
    expect: fires("statement-forms"),
  },
  {
    name: "a for in loop",
    source:
      `function f(o: Record<string, number>): void { for (const k in o) { run(k); } }`,
    expect: fires("statement-forms"),
  },
  {
    name: "a for of loop is fine",
    source:
      `function f(xs: readonly number[]): void { for (const x of xs) { run(x); } }`,
    expect: silent,
  },
  {
    name: "a for of loop over the indices is fine",
    source:
      `function f(xs: readonly number[]): void { for (const i of xs.keys()) { run(i); } }`,
    expect: silent,
  },
  // Labels.
  {
    name: "a labeled statement reports once, not for its break",
    source:
      `function f(xs: readonly number[]): void { outer: for (const x of xs) { if (x === 1) { break outer; } } }`,
    expect: fires("statement-forms"),
  },
  {
    name: "a labeled continue reports only the label",
    source:
      `function f(xs: readonly number[]): void { outer: for (const x of xs) { for (const y of xs) { if (y === x) { continue outer; } } } }`,
    expect: fires("statement-forms"),
  },
  // Empty statements. Deno's plugin AST drops a standalone `;` and every later
  // statement in the same list, so no other rule sees that code. A lone `;`
  // used as a body is kept as a `null` body.
  {
    name: "a standalone semicolon hides the statements after it",
    source: `export const b = 1;\n;\nlet a = 0;`,
    expect: fires("statement-forms"),
  },
  {
    name: "a leading semicolon hides the whole file",
    source: `;\nlet a = 0;`,
    expect: fires("statement-forms"),
  },
  {
    name: "two semicolons in one gap are one report",
    source: `;;\nexport const a = 1;`,
    expect: fires("statement-forms"),
  },
  {
    name: "a standalone semicolon in a function body",
    source: `export function f(): number { ; return 1; }`,
    expect: fires("statement-forms"),
  },
  {
    name: "a standalone semicolon in a nested block",
    source: `export function f(): number { { ; } return 1; }`,
    expect: fires("statement-forms"),
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
    name: "an if with a lone semicolon body",
    source: `function f(): void { if (check()) ; }`,
    expect: fires("statement-forms"),
  },
  {
    name: "a for of loop with a lone semicolon body",
    source: `function f(xs: readonly number[]): void { for (const x of xs) ; }`,
    expect: fires("statement-forms"),
  },
  {
    name:
      "a while loop with a lone semicolon body reports the loop and the body",
    source: `function f(x: boolean): void { while (x) ; }`,
    expect: fires("statement-forms", 2),
  },
  {
    name: "a label on a lone semicolon reports the label and the body",
    source: `function f(): void { a: ; }`,
    expect: fires("statement-forms", 2),
  },
  {
    name: "an empty block is fine",
    source: `function f(): void { if (check()) { } }`,
    expect: silent,
  },
  // Live iteration.
  {
    name: "push into the iterated identifier",
    source:
      `function f(xs: number[]): void { for (const x of xs) { xs.push(x); } }`,
    expect: fires("statement-forms"),
  },
  {
    name: "a mutating call on a member chain that is iterated",
    source:
      `function f(state: State): void { for (const x of state.items) { state.items.splice(0, 1); } }`,
    expect: fires("statement-forms"),
  },
  {
    name: "a mutating method named by a string key",
    source:
      `function f(xs: number[]): void { for (const x of xs) { xs["pop"](); } }`,
    expect: fires("statement-forms"),
  },
  {
    name: "set, add, delete, and clear report once each",
    source:
      `function f(m: Map<string, number>, s: Set<string>): void { for (const k of m) { m.set("a", 1); m.delete("a"); m.clear(); s.add("b"); } }`,
    expect: fires("statement-forms", 3),
  },
  {
    name: "an index write into the iterated identifier",
    source:
      `function f(xs: number[]): void { for (const x of xs) { xs[0] = x; } }`,
    expect: fires("statement-forms"),
  },
  {
    name: "a length write into the iterated identifier",
    source:
      `function f(xs: number[]): void { for (const x of xs) { xs.length = 0; } }`,
    expect: fires("statement-forms"),
  },
  {
    name: "an index update of the iterated identifier",
    source:
      `function f(xs: number[]): void { for (const x of xs) { xs[0]++; } }`,
    expect: fires("statement-forms"),
  },
  {
    name: "a delete of a member of the iterated identifier",
    source:
      `function f(xs: number[]): void { for (const x of xs) { delete xs[0]; } }`,
    expect: fires("statement-forms"),
  },
  {
    name: "a mutation inside a nested block and a nested function",
    source:
      `function f(xs: number[]): void { for (const x of xs) { if (x === 1) { run(() => xs.push(x)); } } }`,
    expect: fires("statement-forms"),
  },
  {
    name: "a mutation of another collection is fine",
    source:
      `function f(xs: number[], ys: number[]): void { for (const x of xs) { ys.push(x); } }`,
    expect: silent,
  },
  {
    name: "a mutation of a different member chain is fine",
    source:
      `function f(state: State): void { for (const x of state.items) { state.other.push(x); } }`,
    expect: silent,
  },
  {
    name: "reassigning the iterated binding is fine",
    source:
      `function f(xs: number[]): void { for (const x of xs) { xs = [x]; } }`,
    expect: silent,
  },
  {
    name: "a non-mutating method on the iterated identifier is fine",
    source:
      `function f(xs: number[]): void { for (const x of xs) { run(xs.indexOf(x)); } }`,
    expect: silent,
  },
  {
    name: "a mutating call outside the loop is fine",
    source:
      `function f(xs: number[]): void { for (const x of xs) { run(x); } xs.push(1); }`,
    expect: silent,
  },
  {
    name: "a mutating call in the iterable expression is fine",
    source:
      `function f(xs: number[]): void { for (const x of xs.toSorted()) { run(x); } xs.sort(); }`,
    expect: silent,
  },
  {
    name: "a computed iterable is not compared",
    source:
      `function f(xs: number[][]): void { for (const x of xs[0]) { xs[0].push(x); } }`,
    expect: silent,
  },
  // Layers.
  {
    name: "an adapter file is exempt",
    source: `switch (x) { default: } while (x) {} for (;;) {} a: ;`,
    filename: ADAPTER,
    expect: silent,
  },
  {
    name: "a prelude file is exempt",
    source:
      `// @light-fp prelude\nswitch (x) { default: } while (x) {} for (;;) {} a: ;`,
    expect: silent,
  },
]);

const messagesOf = (source: string): readonly string[] =>
  diagnose(source, DOMAIN)
    .filter((d) => d.id === "light-fp/statement-forms")
    .map((d) => d.message);

Deno.test("statement-forms: a live mutation gets the live-iteration message", () => {
  assertEquals(
    messagesOf(
      `function f(xs: number[]): void { for (const x of xs) { xs.push(x); } }`,
    ),
    ["A loop body changes the collection that the loop iterates."],
  );
});

Deno.test("statement-forms: a while loop gets the unbounded-loop message", () => {
  assertEquals(
    messagesOf(`function f(x: boolean): void { while (x) { run(); } }`),
    ["A `while` loop has no bound on its iterations."],
  );
});
