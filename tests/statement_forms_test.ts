import { assertEquals } from "@std/assert";
import { ADAPTER, check, diagnose, DOMAIN, fires, silent } from "./harness.ts";

check("statement-forms", [
  // Branching and loops.
  {
    name: "a return-terminating switch",
    source:
      `function f(x: number): number { switch (x) { case 1: return 1; default: return 2; } }`,
    expect: silent,
  },
  {
    name: "grouped switch labels share a returning body",
    source:
      `function f(x: string): number { switch (x) { case "a": case "b": return 1; default: return 2; } }`,
    expect: silent,
  },
  {
    name: "a closed switch needs no default",
    source:
      `function f(x: "a" | "b"): number { switch (x) { case "a": return 1; case "b": return 2; } }`,
    expect: silent,
  },
  {
    name: "a no-default switch composes with a post-switch never check",
    source:
      `function f(x: "a" | "b"): number { switch (x) { case "a": return 1; case "b": return 2; } const unreachable: never = x; return unreachable; }`,
    expect: silent,
  },
  {
    name: "a case may end in a returning block",
    source:
      `function f(x: number): number { switch (x) { case 1: { return 1; } default: { return 2; } } }`,
    expect: silent,
  },
  {
    name: "a case may end in an if whose branches return",
    source:
      `function f(x: number, flag: boolean): number { switch (x) { case 1: if (flag) { return 1; } else { return 2; } default: return 3; } }`,
    expect: silent,
  },
  {
    name: "an empty switch",
    source:
      `function f(x: number): undefined { switch (x) {} return undefined; }`,
    expect: fires("statement-forms"),
  },
  {
    name: "a final empty switch label",
    source:
      `function f(x: number): number { switch (x) { case 1: return 1; default: } return 2; }`,
    expect: fires("statement-forms"),
  },
  {
    name: "a conditional return without else",
    source:
      `function f(x: number, flag: boolean): number { switch (x) { case 1: if (flag) return 1; default: return 2; } }`,
    expect: fires("statement-forms"),
  },
  {
    name: "a case that breaks",
    source:
      `function f(x: number): number { switch (x) { case 1: break; default: return 2; } return 3; }`,
    expect: fires("statement-forms"),
  },
  {
    name: "a conditional break before a final return",
    source:
      `function f(x: number, flag: boolean): number { switch (x) { case 1: if (flag) break; return 1; default: return 2; } return 3; }`,
    expect: fires("statement-forms"),
  },
  {
    name: "a conditional continue before a final return",
    source:
      `function f(xs: readonly number[], flag: boolean): number { for (const x of xs) { switch (x) { case 1: if (flag) continue; return 1; default: return 2; } } return 3; }`,
    expect: fires("statement-forms"),
  },
  {
    name: "an assignment-driven fallthrough switch",
    source:
      `function f(x: number): number { let result = 0; switch (x) { case 1: result = 1; default: result = 2; } return result; }`,
    expect: fires("statement-forms"),
  },
  {
    name: "a returning default does not cover a non-returning case",
    source:
      `function f(x: number): number { switch (x) { case 1: use(x); default: return 2; } }`,
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
  // Empty statements belong to `no-empty-statement`.
  {
    name: "a while loop with a lone semicolon body reports only the loop",
    source: `function f(x: boolean): void { while (x) ; }`,
    expect: fires("statement-forms"),
  },
  {
    name: "a label on a lone semicolon reports only the label",
    source: `function f(): void { a: ; }`,
    expect: fires("statement-forms"),
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
    name: "an index write through a const alias declared in the loop body",
    source:
      `function f(xs: number[]): void { for (const x of xs) { const ys = xs; ys[ys.length] = x; } }`,
    expect: fires("statement-forms"),
  },
  {
    name: "a mutating call through a const alias declared before the loop",
    source:
      `function f(xs: number[]): void { const ys = xs; for (const x of xs) { ys.push(x); } }`,
    expect: fires("statement-forms"),
  },
  {
    name: "a loop over a const alias that mutates the original",
    source:
      `function f(xs: number[]): void { const ys = xs; for (const x of ys) { xs.push(x); } }`,
    expect: fires("statement-forms"),
  },
  {
    name: "a chain of const aliases of a member chain",
    source:
      `function f(state: State): void { for (const x of state.items) { const s = state; const items = s.items; items.push(x); } }`,
    expect: fires("statement-forms"),
  },
  {
    name: "a let binding is not an alias",
    source:
      `function f(xs: number[]): void { for (const x of xs) { let ys = xs; ys = []; ys.push(x); } }`,
    expect: silent,
  },
  {
    name: "a const bound to a copy is not an alias",
    source:
      `function f(xs: number[]): void { for (const x of xs) { const ys = [...xs]; ys.push(x); } }`,
    expect: silent,
  },
  {
    name: "a parameter shadows an outer const alias",
    source:
      `function f(xs: number[]): void { const ys = xs; for (const x of xs) { run((ys: number[]) => ys.push(x)); } }`,
    expect: silent,
  },
  {
    name: "a parameter default that reads an alias does not shadow it",
    source:
      `function f(xs: number[]): void { const ys = xs; for (const x of ys) { ((unused: number[] = ys): number => ys.push(x))(ys); } }`,
    expect: fires("statement-forms"),
  },
  {
    name: "a declaration in a switch case shadows an outer const alias",
    source:
      `function f(xs: number[], other: number[]): void { const ys = xs; for (const x of xs) { switch (x) { default: const ys = other; ys.push(x); return; } } }`,
    expect: silent,
  },
  {
    name: "a destructuring default that reads an alias does not shadow it",
    source:
      `function f(xs: number[], o: { a?: number[] }): void { const ys = xs; for (const x of xs) { const { a = ys } = o; ys.push(a.length); } }`,
    expect: fires("statement-forms"),
  },
  {
    name: "a declaration in a switch case does not shadow the discriminant",
    source:
      `function f(xs: number[], other: number[]): void { const ys = xs; for (const x of xs) { switch (ys.push(x)) { default: const ys = other; run(ys); return; } } }`,
    expect: fires("statement-forms"),
  },
  {
    name: "a declaration in a class static block shadows an outer const alias",
    source:
      `function f(xs: number[], other: number[]): void { const ys = xs; for (const x of xs) { run(class { static { const ys = other; ys.push(x); } }); } }`,
    expect: silent,
  },
  {
    name: "a class expression name shadows an outer const alias",
    source:
      `function f(xs: number[]): void { const ys = xs; for (const x of xs) { run(class ys { static add(n: number): number { return n; } static m(): number { return ys.add(x); } }); } }`,
    expect: silent,
  },
  {
    name: "a function expression name shadows an outer const alias",
    source:
      `function f(xs: { prototype: number[] }): void { const ys = xs; for (const x of xs.prototype) { run(function ys(): void { ys.prototype.push(x); }); } }`,
    expect: silent,
  },
  {
    name: "a declaration in a namespace shadows an outer const alias",
    source:
      `declare const xs: number[]; const ys = xs; namespace N { const ys: number[] = []; for (const x of xs) { ys.push(x); } }`,
    expect: silent,
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
