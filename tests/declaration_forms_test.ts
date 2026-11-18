import { assertEquals, assertThrows } from "@std/assert";
import {
  ADAPTER,
  check,
  checkCompiler,
  diagnose,
  DOMAIN,
  fires,
  ruleCount,
  silent,
} from "./harness.ts";

check("declaration-forms", [
  {
    name: "an object destructuring declaration",
    source: `const { a } = pair;`,
    expect: fires("declaration-forms"),
  },
  {
    name: "an array destructuring declaration",
    source: `const [a, b] = pair;`,
    expect: fires("declaration-forms"),
  },
  {
    name: "a renamed destructuring declaration",
    source: `const { a: renamed } = pair;`,
    expect: fires("declaration-forms"),
  },
  {
    name: "a nested pattern reports once for the declarator",
    source: `const { a: { b }, c: [d] } = pair;`,
    expect: fires("declaration-forms"),
  },
  {
    name: "a let destructuring declaration",
    source: `let [a] = pair;`,
    expect: fires("declaration-forms"),
  },
  {
    name: "a for...of head pattern",
    source: `for (const [key, value] of entries) { use(key, value); }`,
    expect: fires("declaration-forms"),
  },
  {
    name: "a for...in head pattern",
    source: `for (const { length } in table) { use(length); }`,
    expect: fires("declaration-forms"),
  },
  {
    name: "two destructuring declarators report twice",
    source: `const { a } = one, [b] = two;`,
    expect: fires("declaration-forms", 2),
  },
  {
    name: "an object pattern parameter of a declaration",
    source: `function f({ a }: Pair): number { return a; }`,
    expect: fires("declaration-forms"),
  },
  {
    name: "a single-element positional parameter of a function expression",
    source: `run(function ([a]: readonly number[]): number { return a; });`,
    expect: silent,
  },
  {
    name: "an object pattern parameter of an arrow",
    source: `run(({ a }: Pair) => a);`,
    expect: fires("declaration-forms"),
  },
  {
    name: "a pattern parameter with a default value",
    source: `run(({ a } = pair) => a);`,
    expect: fires("declaration-forms"),
  },
  {
    name:
      "an object pattern parameter next to a flat positional one reports once",
    source:
      `function f({ a }: Pair, [b]: readonly number[]): number { return a + b; }`,
    expect: fires("declaration-forms"),
  },
  {
    name: "a pattern parameter next to a plain one reports once",
    source: `function f(x: number, { a }: Pair): number { return a + x; }`,
    expect: fires("declaration-forms"),
  },
  {
    name: "a flat positional parameter of an arrow",
    source: `run(([a, b]: readonly [number, number]) => a + b);`,
    expect: silent,
  },
  {
    name: "a contextual unannotated positional callback parameter",
    source: `run(([a, b]) => a + b);`,
    expect: silent,
  },
  {
    name: "an elided positional parameter",
    source:
      `function f([, b]: readonly [number, number]): number { return b; }`,
    expect: fires("declaration-forms"),
  },
  {
    name: "a rest positional parameter",
    source:
      `function f([a, ...rest]: readonly number[]): number { return a + rest.length; }`,
    expect: fires("declaration-forms"),
  },
  {
    name: "a nested positional parameter",
    source:
      `function f([[a]]: readonly [readonly [number]]): number { return a; }`,
    expect: fires("declaration-forms"),
  },
  {
    name: "an empty positional parameter",
    source: `function f([]: readonly []): number { return 0; }`,
    expect: fires("declaration-forms"),
  },
  {
    name: "a defaulted-element positional parameter",
    source: `function f([a = 0]: readonly [number]): number { return a; }`,
    expect: fires("declaration-forms"),
  },
  {
    name: "a default-wrapped positional parameter",
    source: `run(([a, b] = [1, 2]) => a + b);`,
    expect: fires("declaration-forms"),
  },
  {
    name: "assignment destructuring is out of scope",
    source: `let a = 1; let b = 2; [a, b] = [b, a];`,
    expect: silent,
  },
  {
    name: "a flat const array binding inside a function",
    source: `function f(): number { const [a, b] = pair; return a + b; }`,
    expect: silent,
  },
  {
    name: "a readonly pair parameter unpacked in the body",
    source:
      `function f(pair: readonly [number, number]): number { const [a, b] = pair; return a + b; }`,
    expect: silent,
  },
  {
    name: "a flat const array binding inside a nested block",
    source:
      `function f(pair: Pair, usePair: boolean): number { if (usePair) { const [a, b] = pair; return a + b; } return 0; }`,
    expect: silent,
  },
  {
    name: "a flat const array binding inside a function expression body",
    source:
      `run(function (pair: Pair): number { const [a, b] = pair; return a + b; });`,
    expect: silent,
  },
  {
    name: "a flat const array binding inside an arrow body",
    source:
      `const f = (pair: Pair): number => { const [a, b] = pair; return a + b; };`,
    expect: silent,
  },
  {
    name: "a synchronous for...of binding inside a function",
    source:
      `function f(pairs: readonly Pair[]): number { for (const [key, value] of pairs) { return key + value; } return 0; }`,
    expect: silent,
  },
  {
    name: "a var array binding inside a function",
    source: `function f(): number { var [a, b] = pair; return a + b; }`,
    expect: fires("declaration-forms"),
  },
  {
    name: "an empty array binding inside a function",
    source: `function f(): number { const [] = pair; return 0; }`,
    expect: fires("declaration-forms"),
  },
  {
    name: "an elided array binding inside a function",
    source: `function f(): number { const [, b] = pair; return b; }`,
    expect: fires("declaration-forms"),
  },
  {
    name: "a defaulted array binding inside a function",
    source: `function f(): number { const [a = 0] = pair; return a; }`,
    expect: fires("declaration-forms"),
  },
  {
    name: "a rest array binding inside a function",
    source:
      `function f(): number { const [a, ...rest] = values; return a + rest.length; }`,
    expect: fires("declaration-forms"),
  },
  {
    name: "a nested array binding inside a function",
    source: `function f(): number { const [a, [b]] = nested; return a + b; }`,
    expect: fires("declaration-forms"),
  },
  {
    name: "a flat const object binding inside a function",
    source: `function f(): number { const { a } = pair; return a; }`,
    expect: silent,
  },
  {
    name: "a two-field flat const object binding inside a function",
    source: `function f(): number { const { a, b } = pair; return a + b; }`,
    expect: silent,
  },
  {
    name: "a flat const object binding inside a nested block",
    source:
      `function f(pair: Pair, usePair: boolean): number { if (usePair) { const { a, b } = pair; return a + b; } return 0; }`,
    expect: silent,
  },
  {
    name: "a flat const object binding inside a function expression body",
    source:
      `run(function (pair: Pair): number { const { a, b } = pair; return a + b; });`,
    expect: silent,
  },
  {
    name: "a flat const object binding inside an arrow body",
    source:
      `const f = (pair: Pair): number => { const { a, b } = pair; return a + b; };`,
    expect: silent,
  },
  {
    name: "a synchronous for...of object binding inside a function",
    source:
      `function f(pairs: readonly Pair[]): number { for (const { a, b } of pairs) { return a + b; } return 0; }`,
    expect: silent,
  },
  {
    name: "a let object binding inside a function",
    source: `function f(): number { let { a } = pair; return a; }`,
    expect: fires("declaration-forms"),
  },
  {
    name: "a var object binding inside a function",
    source: `function f(): number { var { a } = pair; return a; }`,
    expect: fires("declaration-forms"),
  },
  {
    name: "a renamed object binding inside a function",
    source:
      `function f(): number { const { a: renamed } = pair; return renamed; }`,
    expect: fires("declaration-forms"),
  },
  {
    name: "a defaulted object binding inside a function",
    source: `function f(): number { const { a = 0 } = pair; return a; }`,
    expect: fires("declaration-forms"),
  },
  {
    name: "a rest object binding inside a function",
    source:
      `function f(): number { const { a, ...rest } = pair; return a + rest.b; }`,
    expect: fires("declaration-forms"),
  },
  {
    name: "a nested object binding inside a function",
    source: `function f(): number { const { a: { b } } = pair; return b; }`,
    expect: fires("declaration-forms"),
  },
  {
    name: "a computed object binding inside a function",
    source: `function f(): number { const { [key]: a } = pair; return a; }`,
    expect: fires("declaration-forms"),
  },
  {
    name: "an empty object binding inside a function",
    source: `function f(): undefined { const {} = pair; return undefined; }`,
    expect: fires("declaration-forms"),
  },
  {
    name: "a top-level object binding",
    source: `const { a } = pair; export const f = (): number => a;`,
    expect: fires("declaration-forms"),
  },
  {
    name: "a for...in object binding inside a function",
    source:
      `function f(table: Table): undefined { for (const { length } in table) { use(length); } return undefined; }`,
    expect: fires("declaration-forms"),
  },
  {
    name: "a for-await object binding inside a function",
    source:
      `async function f(pairs: AsyncIterable<Pair>): Promise<undefined> { for await (const { a, b } of pairs) { use(a, b); } return undefined; }`,
    expect: fires("declaration-forms"),
  },
  {
    name: "a static block object binding inside a function",
    source:
      `function f(): undefined { class C { static { const { a } = pair; use(a); } } return undefined; }`,
    expect: fires("declaration-forms"),
  },
  {
    name: "a flat positional parameter of a declaration",
    source:
      `function f([a, b]: readonly [number, number]): number { return a + b; }`,
    expect: silent,
  },
  {
    name: "a for...in array binding inside a function",
    source:
      `function f(table: Table): undefined { for (const [key, value] in table) { use(key, value); } return undefined; }`,
    expect: fires("declaration-forms"),
  },
  {
    name: "a for-await array binding inside a function",
    source:
      `async function f(pairs: AsyncIterable<Pair>): Promise<undefined> { for await (const [key, value] of pairs) { use(key, value); } return undefined; }`,
    expect: fires("declaration-forms"),
  },
  {
    name: "a static block nested inside a function",
    source:
      `function f(): undefined { class C { static { const [a, b] = pair; use(a, b); } } return undefined; }`,
    expect: fires("declaration-forms"),
  },
  {
    name: "a static block in an outer function default initializer",
    source:
      `function f(C = class { static { const [a, b] = pair; use(a, b); } }): undefined { return undefined; }`,
    expect: fires("declaration-forms"),
  },
  {
    name: "a local arrow const is an immutable function value",
    source: `const f = (x: number): number => x;`,
    expect: silent,
  },
  {
    name: "an exported arrow const is an immutable function value",
    source: `export const f = (x: number): number => x;`,
    expect: silent,
  },
  {
    name: "an async arrow const",
    source: `const f = async (x: number): Promise<number> => x;`,
    expect: silent,
  },
  {
    name: "a generic arrow const",
    source: `const f = <T>(x: T): T => x;`,
    expect: silent,
  },
  {
    name: "a type-annotated arrow const",
    source: `const f: Handler = (x) => x;`,
    expect: silent,
  },
  {
    name: "an arrow const stored in a record",
    source: `const f = (): number => 1; const record = { f };`,
    expect: silent,
  },
  {
    name: "an arrow const passed by reference as a callback",
    source: `const f = (): number => 1; run(f);`,
    expect: silent,
  },
  {
    name: "an arrow const inside a function body",
    source: `function g(): number { const f = (): number => 1; return f(); }`,
    expect: silent,
  },
  {
    name: "a let arrow binding",
    source: `let f = () => 1;`,
    expect: fires("declaration-forms"),
  },
  {
    name: "a const function expression",
    source: `const f = function (x: number): number { return x; };`,
    expect: fires("declaration-forms"),
  },
  {
    name: "a let function expression",
    source: `let f = function (x: number): number { return x; };`,
    expect: fires("declaration-forms"),
  },
  {
    name: "a plain const is fine",
    source: `const a = 1; export const b = "x";`,
    expect: silent,
  },
  {
    name: "an arrow in an object field is fine",
    source: `const o = { run: () => 1 };`,
    expect: silent,
  },
  {
    name: "an arrow passed as an argument is fine",
    source: `run(() => 1);`,
    expect: silent,
  },
  {
    name: "a call that receives an arrow is fine",
    source: `const f = make(() => 1);`,
    expect: silent,
  },
  {
    name: "a function declaration is fine",
    source: `export function f(x: number): number { return x; }`,
    expect: silent,
  },
  {
    name: "plain parameters are fine",
    source: `function f(a: number, b: number): number { return a + b; }`,
    expect: silent,
  },
  {
    name: "an adapter file may destructure and bind arrows",
    source: `const { a } = pair; export const f = () => a;`,
    filename: ADAPTER,
    expect: silent,
  },
  {
    name: "a prelude file may destructure and bind arrows",
    source:
      `// @light-fp prelude\nconst { a } = pair; export const f = () => a;`,
    expect: silent,
  },
]);

const messagesOf = (source: string): readonly string[] =>
  diagnose(source, DOMAIN)
    .filter((d) => d.id === "light-fp/declaration-forms")
    .map((d) => d.message);

Deno.test("declaration-forms: an exported function expression names the export", () => {
  assertEquals(messagesOf(`export const f = function () { return 1; };`), [
    "An exported function is declared as a `const` binding.",
  ]);
});

Deno.test("declaration-forms: a local function expression names the helper", () => {
  assertEquals(messagesOf(`const f = function () { return 1; };`), [
    "A reusable helper is declared as a `const` binding.",
  ]);
});

Deno.test("declaration-forms: live-iteration safeguards remain active", () => {
  const source = `type Pair = readonly [number, number];
function change(pairs: Pair[]): undefined {
  for (const [key, value] of pairs) {
    pairs.push([key, value]);
    pairs[0] = [value, key];
  }
  return undefined;
}`;
  assertEquals([
    ruleCount("declaration-forms", source),
    ruleCount("statement-forms", source),
    ruleCount("no-discarded-values", source),
  ], [0, 2, 1]);
});

Deno.test("declaration-forms: an ambient positional source remains diagnosed", () => {
  const source =
    `function firstArg(): string { const [first] = Deno.args; return first; }`;
  assertEquals([
    ruleCount("declaration-forms", source),
    ruleCount("no-ambient-effects", source),
  ], [0, 1]);
});

Deno.test("declaration-forms: mutable data remains diagnosed", () => {
  const source = `type Input = { readonly pair: number[] };
function first(input: Input): number { const [value] = input.pair; return value; }`;
  assertEquals([
    ruleCount("declaration-forms", source),
    ruleCount("readonly-data", source),
  ], [0, 1]);
});

Deno.test("declaration-forms: ignored Result and Promise calls remain diagnosed", () => {
  const source = `type Pair = readonly [number, number];
type Result = { readonly ok: boolean };
function result(): Result { return { ok: true }; }
function pending(): Promise<undefined> { return Promise.resolve(undefined); }
function usePair(pair: Pair): undefined {
  const [a, b] = pair;
  result();
  pending();
  return undefined;
}`;
  assertEquals([
    ruleCount("declaration-forms", source),
    ruleCount("no-discarded-values", source),
  ], [0, 2]);
});

Deno.test("declaration-forms: shorthand object binding keeps the live-iteration safeguard", () => {
  const shorthand = `type State = { readonly items: number[] };
function change(state: State): undefined {
  const { items } = state;
  for (const x of state.items) { items.push(x); }
  return undefined;
}`;
  const explicit = `type State = { readonly items: number[] };
function change(state: State): undefined {
  const items = state.items;
  for (const x of state.items) { items.push(x); }
  return undefined;
}`;
  assertEquals([
    ruleCount("declaration-forms", shorthand),
    ruleCount("statement-forms", shorthand),
    ruleCount("declaration-forms", explicit),
    ruleCount("statement-forms", explicit),
  ], [0, 1, 0, 1]);
});

Deno.test("declaration-forms: an ambient object source remains diagnosed", () => {
  const source =
    `function first(): number { const { length } = Deno.args; return length; }`;
  assertEquals([
    ruleCount("declaration-forms", source),
    ruleCount("no-ambient-effects", source),
  ], [0, 1]);
});

Deno.test("declaration-forms: an unsafe cast to reach an object binding remains diagnosed", () => {
  const source =
    `function first(input: unknown): number { const { a } = input as { readonly a: number }; return a; }`;
  assertEquals([
    ruleCount("declaration-forms", source),
    ruleCount("no-unsafe-cast", source),
  ], [0, 1]);
});

Deno.test("declaration-forms: an any annotation to reach an object binding remains diagnosed", () => {
  const source =
    `function first(input: any): number { const { a } = input; return a; }`;
  assertEquals([
    ruleCount("declaration-forms", source),
    ruleCount("no-unsafe-cast", source),
  ], [0, 1]);
});

Deno.test("declaration-forms: a default-wrapped positional parameter stays refused by both rules", () => {
  const source = `run(([a, b] = [1, 2]) => a + b);`;
  assertEquals([
    ruleCount("declaration-forms", source),
    ruleCount("function-forms", source),
  ], [1, 1]);
});

Deno.test("declaration-forms: an any annotation on a flat positional parameter stays diagnosed", () => {
  const source = `function first([a, b]: any): number { return a + b; }`;
  assertEquals([
    ruleCount("declaration-forms", source),
    ruleCount("no-unsafe-cast", source),
  ], [0, 1]);
});

Deno.test("declaration-forms: a flat positional parameter keeps data and discarded diagnostics independent", () => {
  const source = `type Input = { readonly pair: number[] };
type Result = { readonly ok: boolean };
function result(): Result { return { ok: true }; }
function first([input]: readonly [Input]): number {
  const [value] = input.pair;
  result();
  return value;
}`;
  assertEquals([
    ruleCount("declaration-forms", source),
    ruleCount("readonly-data", source),
    ruleCount("no-discarded-values", source),
  ], [0, 1, 1]);
});

Deno.test("declaration-forms: mutable object data remains diagnosed", () => {
  const source = `type Input = { readonly items: number[] };
function first(input: Input): number { const { items } = input; return items.length; }`;
  assertEquals([
    ruleCount("declaration-forms", source),
    ruleCount("readonly-data", source),
  ], [0, 1]);
});

Deno.test("declaration-forms: ignored Result and Promise calls with object binding remain diagnosed", () => {
  const source = `type Pair = { readonly a: number; readonly b: number };
type Result = { readonly ok: boolean };
function result(): Result { return { ok: true }; }
function pending(): Promise<undefined> { return Promise.resolve(undefined); }
function usePair(pair: Pair): undefined {
  const { a, b } = pair;
  result();
  pending();
  return undefined;
}`;
  assertEquals([
    ruleCount("declaration-forms", source),
    ruleCount("no-discarded-values", source),
  ], [0, 2]);
});

Deno.test("declaration-forms: shorthand reads members once, in order, from one RHS", () => {
  const events: string[] = [];
  let evaluations = 0;
  const record = {
    get a(): string {
      events.push("a");
      return "A";
    },
    get b(): string {
      events.push("b");
      return "B";
    },
  };
  const rhs = (): typeof record => {
    evaluations += 1;
    return record;
  };
  const { a, b } = rhs();
  assertEquals([a, b], ["A", "B"]);
  assertEquals(events, ["a", "b"]);
  assertEquals(evaluations, 1);
});

Deno.test("declaration-forms: object binding compiles for valid records", async () => {
  const source = `type Pair = { readonly a: number; readonly b: number };
function sum(pair: Pair): number {
  const { a, b } = pair;
  return a + b;
}`;
  assertEquals((await checkCompiler(source)).ok, true);
});

Deno.test("declaration-forms: a string length shorthand compiles", async () => {
  const source = `function width(text: string): number {
  const { length } = text;
  return length;
}`;
  assertEquals((await checkCompiler(source)).ok, true);
});

Deno.test("declaration-forms: object binding rejects unknown, null, and a missing field", async () => {
  const unknownSource =
    `function first(input: unknown): number { const { a } = input; return a; }`;
  const nullSource =
    `function first(input: null): number { const { a } = input; return a; }`;
  const missingSource = `type Pair = { readonly a: number };
function first(pair: Pair): number { const { b } = pair; return b; }`;
  assertEquals((await checkCompiler(unknownSource)).ok, false);
  assertEquals((await checkCompiler(nullSource)).ok, false);
  assertEquals((await checkCompiler(missingSource)).ok, false);
});

Deno.test("declaration-forms: object binding rejects an optional field read as required", async () => {
  const source = `type Pair = { readonly a?: number };
function first(pair: Pair): number { const { a } = pair; return a; }`;
  assertEquals((await checkCompiler(source)).ok, false);
});

Deno.test("declaration-forms: valid scopes and refused shapes all compile", async () => {
  const cases: readonly [string, string][] = [
    [
      "a synchronous for...of head",
      `type Pair = { readonly a: number; readonly b: number };
function first(pairs: readonly Pair[]): number {
  for (const { a, b } of pairs) { return a + b; }
  return 0;
}`,
    ],
    [
      "a function expression body",
      `type Pair = { readonly a: number; readonly b: number };
declare const run: (f: (pair: Pair) => number) => void;
run(function (pair: Pair): number { const { a, b } = pair; return a + b; });`,
    ],
    [
      "an arrow body",
      `type Pair = { readonly a: number; readonly b: number };
const f = (pair: Pair): number => { const { a, b } = pair; return a + b; };`,
    ],
    [
      "a nested block",
      `type Pair = { readonly a: number; readonly b: number };
function first(pair: Pair, use: boolean): number {
  if (use) { const { a, b } = pair; return a + b; }
  return 0;
}`,
    ],
    [
      "a rename shape",
      `type Pair = { readonly a: number };
function first(pair: Pair): number { const { a: renamed } = pair; return renamed; }`,
    ],
    [
      "a default shape",
      `type Pair = { readonly a?: number };
function first(pair: Pair): number { const { a = 0 } = pair; return a; }`,
    ],
    [
      "a rest shape",
      `type Pair = { readonly a: number; readonly b: number };
function first(pair: Pair): number { const { a, ...rest } = pair; return a + rest.b; }`,
    ],
    [
      "a nested shape",
      `type Nested = { readonly a: { readonly b: number } };
function first(pair: Nested): number { const { a: { b } } = pair; return b; }`,
    ],
    [
      "a computed shape",
      `type Pair = { readonly a: number };
function first(pair: Pair, key: "a"): number { const { [key]: a } = pair; return a; }`,
    ],
  ];
  for (const [name, source] of cases) {
    assertEquals((await checkCompiler(source)).ok, true, name);
  }
});

type ObservedPair = {
  readonly 0: string;
  readonly 1: string;
  readonly [Symbol.iterator]: () => Iterator<string>;
};

const observedPair = (events: string[]): ObservedPair => ({
  get 0(): string {
    events.push("slot-0");
    return "slot-0";
  },
  get 1(): string {
    events.push("slot-1");
    return "slot-1";
  },
  [Symbol.iterator](): Iterator<string> {
    events.push("iterator");
    let index = 0;
    return {
      next(): IteratorResult<string> {
        const current = index;
        index += 1;
        events.push(`next-${current}`);
        return { value: `yield-${current}`, done: false };
      },
      return(): IteratorResult<string> {
        events.push("close");
        return { value: "closed", done: true };
      },
    };
  },
});

Deno.test("declaration-forms: positional binding retains iterator closing", () => {
  const iteratorEvents: string[] = [];
  const [first, second] = observedPair(iteratorEvents);
  assertEquals([first, second], ["yield-0", "yield-1"]);
  assertEquals(iteratorEvents, ["iterator", "next-0", "next-1", "close"]);

  const slotEvents: string[] = [];
  const pair = observedPair(slotEvents);
  assertEquals([pair[0], pair[1]], ["slot-0", "slot-1"]);
  assertEquals(slotEvents, ["slot-0", "slot-1"]);
});

const indexedHasHit = (values: readonly string[]): boolean => {
  for (let index = 0; index < values.length; index += 1) {
    if (values[index] === "hit") return true;
  }
  return false;
};

const slicedHasHit = (values: readonly string[]): boolean =>
  values.slice().some((value) => value === "hit");

Deno.test("declaration-forms: indexed early exit does not imply eager reads", () => {
  const values = ["hit", "later"];
  Object.defineProperty(values, "1", {
    get(): string {
      throw new Error("later getter");
    },
  });

  assertEquals(indexedHasHit(values), true);
  assertThrows(() => slicedHasHit(values), Error, "later getter");
});
