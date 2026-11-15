import { assertEquals } from "@std/assert";
import { ADAPTER, check, diagnose, DOMAIN, fires, silent } from "./harness.ts";

check("type-forms", [
  // satisfies.
  {
    name: "a satisfies expression",
    source:
      `type T = { readonly a: number }; export const a = { a: 1 } satisfies T;`,
    expect: fires("type-forms"),
  },
  {
    name: "a declaration annotation is fine",
    source: `type T = { readonly a: number }; export const a: T = { a: 1 };`,
    expect: silent,
  },
  // Array spellings.
  {
    name: "Array<T> in a type",
    source: `export type A = Array<string>;`,
    expect: fires("type-forms"),
  },
  {
    name: "ReadonlyArray<T> in a type",
    source: `export type A = ReadonlyArray<string>;`,
    expect: fires("type-forms"),
  },
  {
    name: "Array<T> in a parameter annotation",
    source: `function f(a: Array<string>): number { return a.length; }`,
    expect: fires("type-forms"),
  },
  {
    name: "a nested Array<Array<T>> reports each spelling",
    source: `export type A = Array<Array<string>>;`,
    expect: fires("type-forms", 2),
  },
  {
    name: "T[] and readonly T[] are fine",
    source: `export type A = string[]; export type B = readonly string[];`,
    expect: silent,
  },
  {
    name: "another generic reference is fine",
    source:
      `export type A = Promise<string>; export type B = Map<string, number>;`,
    expect: silent,
  },
  {
    name: "a qualified name ending in Array is fine",
    source: `export type A = ns.Array;`,
    expect: silent,
  },
  // void.
  {
    name: "a void return type",
    source: `function f(): void { return undefined; }`,
    expect: fires("type-forms"),
  },
  {
    name: "a void type inside Promise",
    source:
      `function f(): Promise<void> { return Promise.resolve(undefined); }`,
    expect: fires("type-forms"),
  },
  {
    name: "a void callback parameter type",
    source: `type Callback = (value: number) => void;`,
    expect: fires("type-forms"),
  },
  {
    name: "an undefined return type is fine",
    source: `function f(): undefined { return undefined; }`,
    expect: silent,
  },
  // Raw exported signatures: the keywords.
  {
    name: "an exported function with a raw string parameter",
    source:
      `type Out = { readonly a: number }; export function f(a: string): Out { return { a: a.length }; }`,
    expect: fires("type-forms"),
  },
  {
    name: "a raw number return",
    source: `export function f(): number { return 1; }`,
    expect: fires("type-forms"),
  },
  {
    name: "a raw boolean return",
    source: `export function f(): boolean { return true; }`,
    expect: fires("type-forms"),
  },
  {
    name: "a raw object parameter",
    source: `export function f(a: object): undefined { return undefined; }`,
    expect: fires("type-forms"),
  },
  {
    name: "a raw unknown parameter",
    source: `export function f(a: unknown): undefined { return undefined; }`,
    expect: fires("type-forms"),
  },
  {
    name: "each raw annotation reports once",
    source:
      `export function f(a: string, b: number): boolean { return a.length === b; }`,
    expect: fires("type-forms", 3),
  },
  // Arrays and unions.
  {
    name: "an array of a raw type",
    source: `export function f(a: string[]): undefined { return undefined; }`,
    expect: fires("type-forms"),
  },
  {
    name: "a readonly array of a raw type",
    source:
      `export function f(a: readonly number[]): undefined { return undefined; }`,
    expect: fires("type-forms"),
  },
  {
    name: "a union with a raw member reports once",
    source:
      `export function f(a: string | number | undefined): undefined { return a === undefined ? undefined : undefined; }`,
    expect: fires("type-forms"),
  },
  {
    name: "a union of a reference and a raw type",
    source:
      `type Request = { readonly id: number }; export function f(a: Request | string): undefined { return a === undefined ? undefined : undefined; }`,
    expect: fires("type-forms"),
  },
  {
    name: "a union of references and undefined is fine",
    source:
      `type A = { readonly a: number }; type B = { readonly b: number }; export function f(a: A | B | undefined): undefined { return a === undefined ? undefined : undefined; }`,
    expect: silent,
  },
  // Parameter forms.
  {
    name: "a raw rest parameter annotation",
    source:
      `export function f(...rest: string[]): undefined { return rest.length === 0 ? undefined : undefined; }`,
    expect: fires("type-forms"),
  },
  {
    name: "a raw default parameter annotation",
    source:
      `export function f(a: string = "x"): undefined { return a.length === 0 ? undefined : undefined; }`,
    expect: fires("type-forms"),
  },
  {
    name: "a destructuring parameter with an object type literal",
    source:
      `export function f({ a }: { a: string }): undefined { return a.length === 0 ? undefined : undefined; }`,
    expect: silent,
  },
  {
    name: "a raw annotation on an array pattern parameter",
    source:
      `export function f([a]: string[]): undefined { return a.length === 0 ? undefined : undefined; }`,
    expect: fires("type-forms"),
  },
  // Return annotations.
  {
    name: "Promise of a raw type unwraps one level",
    source:
      `export function f(): Promise<string> { return Promise.resolve("a"); }`,
    expect: fires("type-forms"),
  },
  {
    name: "Promise of a named alias is fine",
    source:
      `type Email = string; export function f(): Promise<Email> { return Promise.resolve("a"); }`,
    expect: silent,
  },
  {
    name: "Promise of a raw union reports once",
    source:
      `export function f(): Promise<string | undefined> { return Promise.resolve(undefined); }`,
    expect: fires("type-forms"),
  },
  {
    name: "a nested Promise unwraps one level only",
    source:
      `export function f(): Promise<Promise<string>> { return Promise.resolve(Promise.resolve("a")); }`,
    expect: silent,
  },
  {
    name: "a Promise parameter is not unwrapped",
    source:
      `export function f(a: Promise<string>): undefined { return a === undefined ? undefined : undefined; }`,
    expect: silent,
  },
  // Allowed annotations.
  {
    name: "literal types, null, undefined, and never are fine",
    source:
      `export function f(a: "x" | "y", b: 1, c: null, d: undefined): never { return f(a, b, c, d); }`,
    expect: silent,
  },
  {
    name: "type references, tuples, and object types are fine",
    source:
      `type Email = string; export function f(a: Email, b: readonly [Email, Email], c: { readonly x: Email }): Email { return a === b[0] ? c.x : a; }`,
    expect: silent,
  },
  {
    name: "a type predicate return is fine",
    source:
      `type Email = string; export function f(a: Email): a is Email { return a.length > 0; }`,
    expect: silent,
  },
  {
    name: "an asserts return is fine",
    source:
      `type Email = string; export function f(a: Email): asserts a is Email { return undefined; }`,
    expect: silent,
  },
  // Which functions count as exported.
  {
    name: "a function that is not exported is fine",
    source: `function f(a: string): number { return a.length; }`,
    expect: silent,
  },
  {
    name: "an exported function-valued const is out of scope",
    source: `export const f = (a: string): number => a.length;`,
    expect: silent,
  },
  {
    name: "a function exported in a list",
    source:
      `function f(a: string): undefined { return a === undefined ? undefined : undefined; } export { f };`,
    expect: fires("type-forms"),
  },
  {
    name: "a function exported under another name",
    source:
      `function f(a: string): undefined { return a === undefined ? undefined : undefined; } export { f as g };`,
    expect: fires("type-forms"),
  },
  {
    name: "a function exported twice reports once",
    source:
      `function f(a: string): undefined { return a === undefined ? undefined : undefined; } export { f }; export { f as g };`,
    expect: fires("type-forms"),
  },
  {
    name: "a listed export of a non-function name is fine",
    source: `export const x = 1; export { x as y };`,
    expect: silent,
  },
  {
    name: "a re-export with a source is fine",
    source: `export { f } from "./other.ts";`,
    expect: silent,
  },
  {
    name: "an exported overload declaration is checked",
    source: `export declare function f(a: string): undefined;`,
    expect: fires("type-forms"),
  },
  {
    name: "an overload list reports each raw annotation",
    source:
      `export function f(a: string): undefined; export function f(a: number): undefined; export function f(a: string | number): undefined { return a === undefined ? undefined : undefined; }`,
    expect: fires("type-forms", 3),
  },
  // Layers.
  {
    name: "an adapter file is exempt",
    source:
      `export function f(a: string): void { return; } export type A = Array<string>; export const b = { a: 1 } satisfies object;`,
    filename: ADAPTER,
    expect: silent,
  },
  {
    name: "a prelude file is exempt",
    source:
      `// @light-fp prelude\nexport function f(a: string): void { return; } export type A = Array<string>; export const b = { a: 1 } satisfies object;`,
    expect: silent,
  },
]);

const messagesOf = (source: string): readonly string[] =>
  diagnose(source, DOMAIN)
    .filter((d) => d.id === "light-fp/type-forms")
    .map((d) => d.message);

Deno.test("type-forms: a raw return gets the exported-signature message", () => {
  assertEquals(messagesOf(`export function f(): number { return 1; }`), [
    "The exported signature exposes a raw built-in type.",
  ]);
});

Deno.test("type-forms: ReadonlyArray gets its own message", () => {
  assertEquals(messagesOf(`export type A = ReadonlyArray<string>;`), [
    "`ReadonlyArray<T>` is a second spelling of the readonly array type.",
  ]);
});
