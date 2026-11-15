import { assertEquals } from "@std/assert";
import { ADAPTER, check, diagnose, DOMAIN, fires, silent } from "./harness.ts";

check("record-forms", [
  // Shorthand.
  {
    name: "a shorthand property",
    source: `const value = 1; export const a = { value };`,
    expect: fires("record-forms"),
  },
  {
    name: "two shorthand properties report once each",
    source: `const x = 1; const y = 2; export const a = { x, y };`,
    expect: fires("record-forms", 2),
  },
  {
    name: "a shorthand property in a nested literal",
    source: `const x = 1; export const a = { inner: { x } };`,
    expect: fires("record-forms"),
  },
  {
    name: "an explicit field is fine",
    source: `const value = 1; export const a = { value: value };`,
    expect: silent,
  },
  {
    name: "an object pattern is left to declaration-forms",
    source:
      `export function f(r: { a: number }): number { const { a } = r; return a; }`,
    expect: silent,
  },
  // Methods, getters, and setters.
  {
    name: "a method property",
    source: `export const a = { run() { return 1; } };`,
    expect: fires("record-forms"),
  },
  {
    name: "an async method property",
    source: `export const a = { async run() { return 1; } };`,
    expect: fires("record-forms"),
  },
  {
    name: "a field that holds an arrow is fine",
    source: `export const a = { run: (): number => 1 };`,
    expect: silent,
  },
  {
    name: "a getter is left to no-oo",
    source: `export const a = { get x() { return 1; } };`,
    expect: silent,
  },
  {
    name: "a setter is left to no-oo",
    source: `export const a = { set x(v: number) { v; } };`,
    expect: silent,
  },
  // Computed keys.
  {
    name: "a computed key",
    source: `const k = "a"; export const a = { [k]: 1 };`,
    expect: fires("record-forms"),
  },
  {
    name: "a computed method reports once",
    source: `const k = "a"; export const a = { [k]() { return 1; } };`,
    expect: fires("record-forms"),
  },
  {
    name: "a computed string literal key",
    source: `export const a = { ["a"]: 1 };`,
    expect: fires("record-forms"),
  },
  {
    name: "a string literal key is fine",
    source: `export const a = { "a-b": 1, c: 2 };`,
    expect: silent,
  },
  // Numeric keys.
  {
    name: "a numeric key",
    source: `export const a = { 1: "a" };`,
    expect: fires("record-forms"),
  },
  {
    name: "a computed numeric key reports once",
    source: `export const a = { [1]: "a" };`,
    expect: fires("record-forms"),
  },
  // Spreads.
  {
    name: "a single leading spread is fine",
    source:
      `export function f(base: { a: number }): object { return { ...base, x: 1 }; }`,
    expect: silent,
  },
  {
    name: "a lone spread is fine",
    source:
      `export function f(base: { a: number }): object { return { ...base }; }`,
    expect: silent,
  },
  {
    name: "a spread after an explicit key",
    source:
      `export function f(base: { a: number }): object { return { x: 1, ...base }; }`,
    expect: fires("record-forms"),
  },
  {
    name: "a second spread",
    source:
      `export function f(a: { a: number }, b: { b: number }): object { return { ...a, ...b }; }`,
    expect: fires("record-forms"),
  },
  {
    name: "each late spread reports once",
    source:
      `export function f(a: { a: number }, b: { b: number }): object { return { ...a, ...b, ...a }; }`,
    expect: fires("record-forms", 2),
  },
  {
    name: "an array spread is fine",
    source:
      `export function f(a: readonly number[]): readonly number[] { return [1, ...a, ...a]; }`,
    expect: silent,
  },
  {
    name: "a spread in an object pattern is left to declaration-forms",
    source:
      `export function f(r: { a: number }): number { const { ...rest } = r; return rest.a; }`,
    expect: silent,
  },
  // Object statics.
  {
    name: "Object.assign",
    source: `export const a = Object.assign({}, { x: 1 });`,
    expect: fires("record-forms"),
  },
  {
    name: "Object.freeze",
    source: `export const a = Object.freeze({ x: 1 });`,
    expect: fires("record-forms"),
  },
  {
    name: "Object.isFrozen",
    source: `export const a = Object.isFrozen({ x: 1 });`,
    expect: fires("record-forms"),
  },
  {
    name: "Object.assign through a computed string literal",
    source: `export const a = Object["assign"]({}, { x: 1 });`,
    expect: fires("record-forms"),
  },
  {
    name: "an Object.assign read without a call",
    source: `export const a = Object.assign;`,
    expect: fires("record-forms"),
  },
  {
    name: "Object.keys, Object.entries, and Object.fromEntries are fine",
    source:
      `export const a = Object.fromEntries(Object.entries({ x: 1 })); export const b = Object.keys({ x: 1 });`,
    expect: silent,
  },
  {
    name: "a computed non-literal member is fine",
    source: `const k = "assign"; export const a = Object[k];`,
    expect: silent,
  },
  {
    name: "a shadowed Object is fine",
    source:
      `export function f(Object: { assign: (x: number) => number }): number { return Object.assign(1); }`,
    expect: silent,
  },
  {
    name: "an imported Object is fine",
    source:
      `import { Object } from "./other.ts"; export const a = Object.assign({}, {});`,
    expect: silent,
  },
  {
    name: "another object with an assign member is fine",
    source: `export const a = other.assign({}, {});`,
    expect: silent,
  },
  // Layers.
  {
    name: "an adapter file is exempt",
    source:
      `const v = 1; export const a = { v, m() {}, [v]: 1, 2: 1, ...a, ...a }; Object.assign(a, a);`,
    filename: ADAPTER,
    expect: silent,
  },
  {
    name: "a prelude file is exempt",
    source:
      `// @light-fp prelude\nconst v = 1; export const a = { v, m() {}, [v]: 1, 2: 1, ...a, ...a }; Object.assign(a, a);`,
    expect: silent,
  },
]);

const messagesOf = (source: string): readonly string[] =>
  diagnose(source, DOMAIN)
    .filter((d) => d.id === "light-fp/record-forms")
    .map((d) => d.message);

Deno.test("record-forms: a shorthand property gets the field-name message", () => {
  assertEquals(messagesOf(`const v = 1; export const a = { v };`), [
    "A shorthand property hides its field name.",
  ]);
});

Deno.test("record-forms: Object.assign names the member", () => {
  assertEquals(messagesOf(`export const a = Object.assign({}, {});`), [
    "`Object.assign` mutates or freezes a record in place.",
  ]);
});
