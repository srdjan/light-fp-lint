import { assertEquals } from "@std/assert";
import { ADAPTER, check, diagnose, DOMAIN, fires, silent } from "./harness.ts";

check("ambient-names", [
  // Refused names.
  {
    name: "console",
    source: `export const a = console;`,
    expect: fires("ambient-names"),
  },
  {
    name: "Deno",
    source: `export const a = Deno;`,
    expect: fires("ambient-names"),
  },
  {
    name: "globalThis",
    source: `export const a = globalThis;`,
    expect: fires("ambient-names"),
  },
  {
    name: "Symbol",
    source: `export const a = Symbol;`,
    expect: fires("ambient-names"),
  },
  {
    name: "Map",
    source: `export const a = Map;`,
    expect: fires("ambient-names"),
  },
  {
    name: "Set",
    source: `export const a = Set;`,
    expect: fires("ambient-names"),
  },
  {
    name: "Error",
    source: `export const a = Error;`,
    expect: fires("ambient-names"),
  },
  {
    name: "RegExp",
    source: `export const a = RegExp;`,
    expect: fires("ambient-names"),
  },
  {
    name: "URL",
    source: `export const a = URL;`,
    expect: fires("ambient-names"),
  },
  {
    name: "crypto",
    source: `export const a = crypto;`,
    expect: fires("ambient-names"),
  },
  {
    name: "fetch",
    source: `export const a = fetch;`,
    expect: fires("ambient-names"),
  },
  {
    name: "structuredClone",
    source: `export const a = structuredClone;`,
    expect: fires("ambient-names"),
  },
  {
    name: "eval",
    source: `export const a = eval;`,
    expect: fires("ambient-names"),
  },
  {
    name: "Proxy",
    source: `export const a = Proxy;`,
    expect: fires("ambient-names"),
  },
  {
    name: "Reflect",
    source: `export const a = Reflect;`,
    expect: fires("ambient-names"),
  },
  {
    name: "Function",
    source: `export const a = Function;`,
    expect: fires("ambient-names"),
  },
  {
    name: "arguments",
    source: `export function f(): number { return arguments.length; }`,
    expect: fires("ambient-names"),
  },
  {
    name: "an undeclared helper",
    source: `export const a = helper(1);`,
    expect: fires("ambient-names"),
  },
  {
    name: "each occurrence reports",
    source: `export const a = [Symbol, Symbol, Symbol];`,
    expect: fires("ambient-names", 3),
  },
  {
    name: "a call argument",
    source: `export const a = parseInt(helper);`,
    expect: fires("ambient-names"),
  },
  {
    name: "an operand of a binary expression",
    source: `export const a = helper + 1;`,
    expect: fires("ambient-names"),
  },
  {
    name: "an object member read through an unbound name",
    source: `export const a = Symbol.iterator;`,
    expect: fires("ambient-names"),
  },
  {
    name: "a computed member property",
    source: `export const a = { x: 1 }[helper];`,
    expect: fires("ambient-names"),
  },
  {
    name: "an object literal value",
    source: `export const a = { x: helper };`,
    expect: fires("ambient-names"),
  },
  {
    name: "an object literal shorthand reports once",
    source: `export const a = { Symbol };`,
    expect: fires("ambient-names"),
  },
  {
    name: "a computed object key",
    source: `export const a = { [helper]: 1 };`,
    expect: fires("ambient-names"),
  },
  {
    name: "a class that extends an unbound name",
    source: `export class A extends Base {}`,
    expect: fires("ambient-names"),
  },
  {
    name: "a default parameter value",
    source: `export function f(x: number = helper): number { return x; }`,
    expect: fires("ambient-names"),
  },
  {
    name: "an unbound name under a type assertion",
    source: `export const a = helper as number;`,
    expect: fires("ambient-names"),
  },
  {
    name: "an unbound name under a satisfies expression",
    source: `export const a = helper satisfies number;`,
    expect: fires("ambient-names"),
  },
  {
    name: "an unbound name under a non-null assertion",
    source: `export const a = helper!;`,
    expect: fires("ambient-names"),
  },
  {
    name: "an enum member initializer",
    source: `export enum E { A = helper }`,
    expect: fires("ambient-names"),
  },
  {
    name: "a local of a source-less export specifier",
    source: `export { helper };`,
    expect: fires("ambient-names"),
  },
  {
    name: "a default export of an unbound name",
    source: `export default helper;`,
    expect: fires("ambient-names"),
  },
  {
    name: "an unbound name assigned in a loop head",
    source:
      `export function f(xs: number[]): number { for (item of xs) { return 1; } return 0; }`,
    expect: fires("ambient-names"),
  },
  // Allowed names.
  {
    name: "the closed allowlist",
    source:
      `export const a = [Array, Boolean, Date, JSON, Math, Number, Object, String, parseFloat, parseInt, undefined, NaN, Infinity, Promise];`,
    expect: silent,
  },
  {
    name: "an allowed member call",
    source: `export const a = Math.max(1, 2);`,
    expect: silent,
  },
  // Bound names.
  {
    name: "an imported name",
    source: `import { helper } from "./other.ts"; export const a = helper(1);`,
    expect: silent,
  },
  {
    name: "a parameter that shadows a global",
    source: `export function f(Symbol: number): number { return Symbol; }`,
    expect: silent,
  },
  {
    name: "a declared variable that shadows a global",
    source: `const Map = 1; export const a = Map;`,
    expect: silent,
  },
  {
    name: "a declared function",
    source:
      `export function helper(): number { return 1; } export const a = helper();`,
    expect: silent,
  },
  {
    name: "a catch parameter",
    source:
      `export function f(): number { try { return 1; } catch (error) { return error; } }`,
    expect: silent,
  },
  {
    name: "a declared class",
    source: `export class A {} export const a = A;`,
    expect: silent,
  },
  {
    name: "a class that extends a declared class",
    source: `class A {} export class B extends A {}`,
    expect: silent,
  },
  {
    name: "a declared enum",
    source: `export enum E { A, B } export const a = E.A;`,
    expect: silent,
  },
  {
    name: "a declared namespace",
    source: `export namespace N { export const x = 1; } export const a = N.x;`,
    expect: silent,
  },
  {
    name: "a destructured parameter",
    source:
      `export function f({ Symbol }: { Symbol: number }): number { return Symbol; }`,
    expect: silent,
  },
  {
    name: "a shorthand pattern in a declaration",
    source:
      `export const a = (r: { Symbol: number }): number => { const { Symbol } = r; return Symbol; };`,
    expect: silent,
  },
  {
    name: "an arrow parameter",
    source: `export const a = (Map: number): number => Map;`,
    expect: silent,
  },
  // Positions that are not value references.
  {
    name: "a non-computed member property",
    source: `export const a = Math.Symbol;`,
    expect: silent,
  },
  {
    name: "a non-computed key in an object literal",
    source: `export const a = { Symbol: 1, console: 2 };`,
    expect: silent,
  },
  {
    name: "a non-computed key in an object pattern",
    source:
      `export const a = (r: { Symbol: number }): number => { const { Symbol: s } = r; return s; };`,
    expect: silent,
  },
  {
    name: "the imported name of an import specifier",
    source: `import { Symbol as sym } from "./other.ts"; export const a = sym;`,
    expect: silent,
  },
  {
    name: "a default import name",
    source: `import Symbol from "./other.ts"; export const a = Symbol;`,
    expect: silent,
  },
  {
    name: "a namespace import name",
    source: `import * as Symbol from "./other.ts"; export const a = Symbol;`,
    expect: silent,
  },
  {
    name: "the exported name of an export specifier",
    source: `const a = 1; export { a as Symbol };`,
    expect: silent,
  },
  {
    name: "a re-export specifier with a source",
    source: `export { Symbol } from "./other.ts";`,
    expect: silent,
  },
  {
    name: "a label",
    source:
      `export function f(): number { Symbol: for (const x of [1]) { break Symbol; } return 1; }`,
    expect: silent,
  },
  {
    name: "a continue label",
    source:
      `export function f(): number { Symbol: for (const x of [1]) { continue Symbol; } return 1; }`,
    expect: silent,
  },
  {
    name: "a class member key",
    source:
      `export class A { Symbol = 1; Map() { return 1; } static Set = 2; }`,
    expect: silent,
  },
  {
    name: "import.meta",
    source: `export const a = import.meta;`,
    expect: silent,
  },
  {
    name: "new.target",
    source: `export function f(): number { return new.target ? 1 : 0; }`,
    expect: silent,
  },
  {
    name: "a type reference",
    source: `export type A = Symbol; export type B = Map<string, Set<number>>;`,
    expect: silent,
  },
  {
    name: "a qualified type name",
    source: `export type A = Deno.lint.Rule;`,
    expect: silent,
  },
  {
    name: "a typeof type query",
    source: `export type A = typeof console;`,
    expect: silent,
  },
  {
    name: "an interface, its heritage, and a signature key",
    source:
      `export interface A extends Base { readonly Symbol: number; Map(x: number): number; }`,
    expect: silent,
  },
  {
    name: "a type alias with a type parameter",
    source: `export type A<Symbol> = { readonly value: Symbol };`,
    expect: silent,
  },
  {
    name: "a type parameter on a function",
    source: `export function f<Symbol>(x: Symbol): Symbol { return x; }`,
    expect: silent,
  },
  {
    name: "a class implements clause",
    source: `export class A implements Base {}`,
    expect: silent,
  },
  {
    name: "a function type parameter name",
    source: `export type F = (Symbol: number) => number;`,
    expect: silent,
  },
  {
    name: "a type predicate parameter name",
    source: `export function f(x: number): x is number { return true; }`,
    expect: silent,
  },
  {
    name: "an enum name and member name",
    source: `export enum Symbol { Map, Set }`,
    expect: silent,
  },
  {
    name: "a namespace name",
    source: `export namespace Symbol { export const x = 1; }`,
    expect: silent,
  },
  // JSON.parse.
  {
    name: "JSON.parse reports once",
    source: `export const a = JSON.parse("1");`,
    expect: fires("ambient-names"),
  },
  {
    name: "JSON.parse with a computed string key",
    source: `export const a = JSON["parse"]("1");`,
    expect: fires("ambient-names"),
  },
  {
    name: "JSON.parse read without a call",
    source: `export const a = JSON.parse;`,
    expect: fires("ambient-names"),
  },
  {
    name: "JSON.stringify is fine",
    source: `export const a = JSON.stringify({ x: 1 });`,
    expect: silent,
  },
  {
    name: "a shadowed JSON is fine",
    source:
      `export function f(JSON: { parse: (x: string) => number }): number { return JSON.parse("1"); }`,
    expect: silent,
  },
  {
    name: "another object with a parse member is fine",
    source:
      `import { parser } from "./other.ts"; export const a = parser.parse("1");`,
    expect: silent,
  },
  // Layers.
  {
    name: "an adapter file is exempt",
    source: `export const a = [console, Symbol, helper, JSON.parse("1")];`,
    filename: ADAPTER,
    expect: silent,
  },
  {
    name: "a prelude file is exempt",
    source:
      `// @light-fp prelude\nexport const a = [console, Symbol, helper, JSON.parse("1")];`,
    expect: silent,
  },
]);

const messagesOf = (source: string): readonly string[] =>
  diagnose(source, DOMAIN)
    .filter((d) => d.id === "light-fp/ambient-names")
    .map((d) => d.message);

Deno.test("ambient-names: an unbound name gets the closed-set message", () => {
  assertEquals(messagesOf(`export const a = Symbol;`), [
    "`Symbol` is outside the closed set of global names that domain code may read.",
  ]);
});

Deno.test("ambient-names: JSON.parse gets the any message", () => {
  assertEquals(messagesOf(`export const a = JSON.parse("1");`), [
    "`JSON.parse` returns `any`, which erases the type of the parsed value.",
  ]);
});
