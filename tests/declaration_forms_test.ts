import { assertEquals } from "@std/assert";
import { ADAPTER, check, diagnose, DOMAIN, fires, silent } from "./harness.ts";

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
    name: "an array pattern parameter of a function expression",
    source: `run(function ([a]: readonly number[]): number { return a; });`,
    expect: fires("declaration-forms"),
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
    name: "two pattern parameters report twice",
    source:
      `function f({ a }: Pair, [b]: readonly number[]): number { return a + b; }`,
    expect: fires("declaration-forms", 2),
  },
  {
    name: "a pattern parameter next to a plain one reports once",
    source: `function f(x: number, { a }: Pair): number { return a + x; }`,
    expect: fires("declaration-forms"),
  },
  {
    name: "assignment destructuring is out of scope",
    source: `let a = 1; let b = 2; [a, b] = [b, a];`,
    expect: silent,
  },
  {
    name: "an exported arrow const is a function-valued binding",
    source: `export const f = (x: number): number => x;`,
    expect: fires("declaration-forms"),
  },
  {
    name: "an exported function expression const",
    source: `export const f = function (x: number): number { return x; };`,
    expect: fires("declaration-forms"),
  },
  {
    name: "an async arrow const",
    source: `const f = async (x: number): Promise<number> => x;`,
    expect: fires("declaration-forms"),
  },
  {
    name: "a generic arrow const",
    source: `const f = <T>(x: T): T => x;`,
    expect: fires("declaration-forms"),
  },
  {
    name: "a type-annotated arrow const",
    source: `const f: Handler = (x) => x;`,
    expect: fires("declaration-forms"),
  },
  {
    name: "a let arrow binding",
    source: `let f = () => 1;`,
    expect: fires("declaration-forms"),
  },
  {
    name: "an arrow const inside a function body",
    source: `function g(): number { const f = (): number => 1; return f(); }`,
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

Deno.test("declaration-forms: an exported function-valued const names the export", () => {
  assertEquals(messagesOf(`export const f = () => 1;`), [
    "An exported function is declared as a `const` binding.",
  ]);
});

Deno.test("declaration-forms: a local function-valued const names the helper", () => {
  assertEquals(messagesOf(`const f = () => 1;`), [
    "A reusable helper is declared as a `const` binding.",
  ]);
});
