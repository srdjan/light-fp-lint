import { assertEquals } from "@std/assert";
import { ADAPTER, check, diagnose, DOMAIN, fires, silent } from "./harness.ts";

// Cases marked B1-B7 are the coverage gaps the audit measured on the old rule
// set. Each one is a regression test now.

check("layer-boundary", [
  {
    name: "plain import of an adapter",
    source: `import { x } from "../adapters/http.ts";`,
    expect: fires("layer-boundary"),
  },
  {
    name: "B2 re-export from an adapter",
    source: `export { x } from "../adapters/auth.ts";`,
    expect: fires("layer-boundary"),
  },
  {
    name: "B2 export-all from an adapter",
    source: `export * from "../adapters/http.ts";`,
    expect: fires("layer-boundary"),
  },
  {
    name: "B2 sibling module with no trailing slash",
    source: `import { x } from "../adapters.ts";`,
    expect: fires("layer-boundary"),
  },
  {
    name: "B2 dynamic import",
    source: `export const f = async () => await import("../ports/x.ts");`,
    expect: fires("layer-boundary"),
  },
  {
    name: "side-effect-only import",
    source: `import "./register.ts";`,
    expect: fires("layer-boundary"),
  },
  {
    name: "a port import is the point of the rule",
    source: `import type { HttpPort } from "../ports/http.ts";`,
    expect: silent,
  },
  {
    name: "an npm specifier is allowed",
    source: `import { z } from "npm:zod";`,
    expect: silent,
  },
  {
    name: "a package named like an adapter is not one",
    source: `import { x } from "npm:my-adapters-helper";`,
    expect: silent,
  },
  {
    name: "external package paths do not become local adapters",
    source:
      `import type { A } from "npm:pkg/infra";\nimport type { B } from "jsr:@scope/pkg/adapter.ts";\nimport type { C } from "https://example.com/adapters/types.ts";`,
    expect: silent,
  },
  {
    name: "adapters may import adapters",
    source: `import { x } from "../adapters/http.ts";`,
    filename: ADAPTER,
    expect: silent,
  },
]);

check("pure-module", [
  {
    name: "module-level let is shared state",
    source: `let count = 0;`,
    expect: fires("pure-module"),
  },
  {
    name: "module-level var is shared state",
    source: `var count = 0;`,
    expect: fires("pure-module"),
  },
  {
    name: "a bare call runs on import",
    source: `main();`,
    expect: fires("pure-module"),
  },
  {
    name: "top-level await runs on import",
    source: `const x = await load();`,
    expect: fires("pure-module"),
  },
  {
    name: "a top-level loop runs on import",
    source: `for (const x of xs) { use(x); }`,
    expect: fires("pure-module"),
  },
  {
    name: "a top-level branch runs on import",
    source: `if (flag) { setup(); }`,
    expect: fires("pure-module"),
  },
  {
    name: "const declarations are the point",
    source: `export const f = () => 1;`,
    expect: silent,
  },
  {
    name: "local let inside a function is fine",
    source: `export const f = () => { let n = 0; return n; };`,
    expect: silent,
  },
  {
    name: "a loop inside a function is fine",
    source:
      `export const f = (xs: readonly number[]) => { for (const x of xs) use(x); };`,
    expect: silent,
  },
  {
    name: "adapters run things on purpose",
    source: `let count = 0;\nmain();`,
    filename: ADAPTER,
    expect: silent,
  },
]);

check("no-ambient-effects", [
  // B1: the old rule tested for a direct Program parent, so none of these fired.
  {
    name: "B1 Date.now in an exported const",
    source: `export const now = Date.now();`,
    expect: fires("no-ambient-effects"),
  },
  {
    name: "B1 Math.random in an exported const",
    source: `export const r = Math.random();`,
    expect: fires("no-ambient-effects"),
  },
  {
    name: "B1 Deno.env at module scope",
    source: `const home = Deno.env.get("HOME");`,
    expect: fires("no-ambient-effects"),
  },
  {
    name: "an effect inside a function still counts",
    source: `export const f = () => Date.now();`,
    expect: fires("no-ambient-effects"),
  },
  {
    name: "fetch anywhere",
    source: `export const f = () => fetch("/x");`,
    expect: fires("no-ambient-effects"),
  },
  {
    name: "console anywhere",
    source: `export const f = () => console.log("x");`,
    expect: fires("no-ambient-effects"),
  },
  {
    name: "new Date() reads the clock",
    source: `export const f = () => new Date();`,
    expect: fires("no-ambient-effects"),
  },
  {
    name: "crypto.randomUUID",
    source: `export const f = () => crypto.randomUUID();`,
    expect: fires("no-ambient-effects"),
  },
  {
    name: "setTimeout",
    source: `export const f = () => setTimeout(g, 1);`,
    expect: fires("no-ambient-effects"),
  },
  {
    name: "new Date(ms) is a pure conversion",
    source: `export const f = (ms: number) => new Date(ms);`,
    expect: silent,
  },
  {
    name: "Math other than random is pure",
    source: `export const f = (n: number) => Math.max(n, 0);`,
    expect: silent,
  },
  {
    name: "pure constructors are not effects",
    source: `export const f = () => new Map();`,
    expect: silent,
  },
  {
    name: "a capability call is the replacement",
    source: `export const f = (c: Clock) => c.now();`,
    expect: silent,
  },
  {
    name: "adapters own the effects",
    source: `export const now = Date.now();`,
    filename: ADAPTER,
    expect: silent,
  },
]);

check("no-throw", [
  {
    name: "throw is banned",
    source: `export const f = () => { throw new Error("x"); };`,
    expect: fires("no-throw"),
  },
  // B6: the old rule reported the same throw twice, once per analysis.
  {
    name: "B6 one throw reports exactly once",
    source: `export function f(): number { throw new Error("x"); }`,
    expect: fires("no-throw"),
  },
  {
    name: "try is banned too",
    source: `export const f = () => { try { g(); } catch { h(); } return 1; };`,
    expect: fires("no-throw"),
  },
  {
    name: "new Error as a value is data",
    source: `export const f = () => err({ cause: new Error("x") });`,
    expect: silent,
  },
  {
    name: "the prelude may catch",
    source:
      `// @light-fp prelude\nexport const f = async () => { try { return 1; } catch { return 2; } };`,
    expect: silent,
  },
  {
    name: "adapters may throw",
    source: `export const f = () => { throw new Error("x"); };`,
    filename: ADAPTER,
    expect: silent,
  },
]);

check("no-discarded-values", [
  {
    name: "a discarded call is dead code or a hidden effect",
    source: `export const f = () => { validate(input); return 1; };`,
    expect: fires("no-discarded-values"),
  },
  {
    name: "a floating await",
    source: `export const f = async () => { await save(x); return 1; };`,
    expect: fires("no-discarded-values"),
  },
  {
    name: "void does not make a discard acceptable",
    source: `export const f = () => { void save(x); return 1; };`,
    expect: fires("no-discarded-values"),
  },
  {
    name: "using the value is the point",
    source: `export const f = () => { const r = validate(input); return r; };`,
    expect: silent,
  },
  {
    name: "returning the value is fine",
    source: `export const f = () => validate(input);`,
    expect: silent,
  },
  {
    name: "local accumulation is tolerated",
    source: `export const f = () => { let n = 0; n += 1; return n; };`,
    expect: silent,
  },
  {
    name: "module scope belongs to pure-module",
    source: `validate(input);`,
    expect: silent,
  },
  {
    name: "adapters discard on purpose",
    source: `export const f = () => { console.log("x"); };`,
    filename: ADAPTER,
    expect: silent,
  },
]);

check("readonly-data", [
  {
    name: "a plain property",
    source: `type A = { id: string };`,
    expect: fires("readonly-data"),
  },
  // B3: the old rule walked down from the alias, so it saw no union member.
  {
    name: "B3 every member of a discriminated union",
    source:
      `type ADT = { readonly _tag: "A"; v: string } | { readonly _tag: "B"; w: number };`,
    expect: fires("readonly-data", 2),
  },
  {
    name: "B3 a nested object property",
    source: `type A = { readonly a: { b: string } };`,
    expect: fires("readonly-data"),
  },
  {
    name: "B3 an index signature",
    source: `type A = { [k: string]: string };`,
    expect: fires("readonly-data"),
  },
  {
    name: "B3 an interface member",
    source: `interface A { id: string }`,
    expect: fires("readonly-data"),
  },
  {
    name: "a mutable array in a data type",
    source: `type A = { readonly xs: string[] };`,
    expect: fires("readonly-data"),
  },
  {
    name: "B3 an array nested in a generic",
    source: `type A = { readonly m: Record<string, string[]> };`,
    expect: fires("readonly-data"),
  },
  {
    name: "Map in a data type",
    source: `type A = { readonly m: Map<string, number> };`,
    expect: fires("readonly-data"),
  },
  {
    name: "readonly properties and arrays pass",
    source: `type A = { readonly id: string; readonly xs: readonly string[] };`,
    expect: silent,
  },
  {
    name: "ReadonlyArray passes",
    source: `type A = { readonly xs: ReadonlyArray<string> };`,
    expect: silent,
  },
  {
    name: "a parameter annotation is the declared budget",
    source: `export const f = (xs: string[]) => xs.length;`,
    expect: silent,
  },
  {
    name: "adapters may hold mutable data",
    source: `type A = { id: string };`,
    filename: ADAPTER,
    expect: silent,
  },
]);

check("no-oo", [
  {
    name: "a class declaration",
    source: `export class A {}`,
    expect: fires("no-oo"),
  },
  // B7: the old rule applied its escape hatch to declarations but not expressions.
  {
    name: "B7 a class expression",
    source: `export const A = class {};`,
    expect: fires("no-oo"),
  },
  {
    name: "this",
    source: `export function f(this: A) { return this; }`,
    expect: fires("no-oo"),
  },
  {
    name: "an enum",
    source: `export enum Color { Red }`,
    expect: fires("no-oo"),
  },
  {
    name: "a namespace",
    source: `export namespace N { export const a = 1; }`,
    expect: fires("no-oo"),
  },
  {
    name: "an object accessor",
    source: `export const o = { get a() { return 1; } };`,
    expect: fires("no-oo"),
  },
  {
    name: "a tagged union is the replacement",
    source: `type S = { readonly _tag: "Open" } | { readonly _tag: "Shut" };`,
    expect: silent,
  },
  {
    name: "adapters may use classes",
    source: `export class A {}`,
    filename: ADAPTER,
    expect: silent,
  },
]);

check("no-unsafe-cast", [
  {
    name: "a cast to a foreign type",
    source: `export const f = (x: unknown) => x as Foreign;`,
    expect: fires("no-unsafe-cast"),
  },
  {
    name: "an angle-bracket cast",
    source: `export const f = (x: unknown) => <Foreign> x;`,
    expect: fires("no-unsafe-cast"),
  },
  {
    name: "a non-null assertion",
    source: `export const f = (x?: string) => x!;`,
    expect: fires("no-unsafe-cast"),
  },
  {
    name: "any in an annotation",
    source: `export const f = (x: any) => x;`,
    expect: fires("no-unsafe-cast"),
  },
  {
    name: "a ts-ignore comment",
    source: `// @ts-ignore\nexport const f = () => 1;`,
    expect: fires("no-unsafe-cast"),
  },
  {
    name: "as const is a narrowing, not an override",
    source: `export const xs = ["a"] as const;`,
    expect: silent,
  },
  {
    name: "a smart constructor casts to its own local type",
    source:
      `type Email = string & { readonly _brand: unique symbol };\nexport const parse = (raw: string) => raw as Email;`,
    expect: silent,
  },
  {
    name: "satisfies is the replacement",
    source: `export const a = { id: "1" } satisfies Shape;`,
    expect: silent,
  },
  {
    name: "the prelude builds the brands",
    source:
      `// @light-fp prelude\nexport const f = (x: unknown) => x as Foreign;`,
    expect: silent,
  },
  {
    name: "adapters parse foreign data",
    source: `export const f = (x: unknown) => x as Foreign;`,
    filename: ADAPTER,
    expect: silent,
  },
]);

check("prefer-type-for-data", [
  {
    name: "an interface holding data",
    source: `interface User { readonly id: string }`,
    expect: fires("prefer-type-for-data"),
  },
  {
    name: "an all-method interface is a port",
    source:
      `interface HttpPort { readonly get: (u: string) => Promise<string> }`,
    expect: silent,
  },
  {
    name: "a method signature port",
    source: `interface HttpPort { get(u: string): Promise<string>; }`,
    expect: silent,
  },
  {
    name: "an empty interface is left alone",
    source: `interface Marker {}`,
    expect: silent,
  },
]);

check("require-ignore-reason", [
  {
    name: "a bare light-fp suppression",
    source: `// deno-lint-ignore light-fp/no-throw\nexport const f = () => 1;`,
    expect: fires("require-ignore-reason"),
  },
  {
    name: "too short a reason does not count",
    source:
      `// deno-lint-ignore light-fp/no-throw -- why\nexport const f = () => 1;`,
    expect: fires("require-ignore-reason"),
  },
  {
    name: "a nine-character reason still fails",
    source:
      `// deno-lint-ignore light-fp/no-throw -- 012345678\nexport const f = () => 1;`,
    expect: fires("require-ignore-reason"),
  },
  {
    name: "a ten-character reason passes",
    source:
      `// deno-lint-ignore light-fp/no-throw -- 0123456789\nexport const f = () => 1;`,
    expect: silent,
  },
  {
    name: "a file-wide light-fp opt-out is refused",
    source:
      `// deno-lint-ignore-file light-fp/no-throw\nexport const f = () => 1;`,
    expect: fires("require-ignore-reason"),
  },
  {
    name: "the rule cannot suppress itself",
    source:
      `// deno-lint-ignore light-fp/require-ignore-reason\nexport const f = () => 1;`,
    expect: fires("require-ignore-reason"),
  },
  {
    name: "a real reason passes",
    source:
      `// deno-lint-ignore light-fp/no-throw -- rethrown to the adapter on purpose\nexport const f = () => 1;`,
    expect: silent,
  },
  {
    name: "suppressions of other plugins are none of its business",
    source: `// deno-lint-ignore no-explicit-any\nexport const f = () => 1;`,
    expect: silent,
  },
]);

Deno.test("no-unsafe-cast: the cast hint names only forms the other rules accept", () => {
  const hints = diagnose(`export const n = (1 as unknown) as number;`, DOMAIN)
    .filter((d) => d.id === "light-fp/no-unsafe-cast")
    .map((d) => d.hint);
  assertEquals(hints, [
    "Annotate the declaration, narrow with a type guard, or move the cast into the smart constructor beside the type it creates.",
    "Annotate the declaration, narrow with a type guard, or move the cast into the smart constructor beside the type it creates.",
  ]);
});
