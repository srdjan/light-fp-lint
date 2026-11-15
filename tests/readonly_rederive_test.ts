import { assertEquals } from "@std/assert";
import { readonlyData as rederived } from "../src/rules/readonly_data.ts";
// Frozen original implementation (plans/readonly_original_reference.ts). The
// rederived rule must keep producing identical diagnostics and fixes, or this
// test fails: a rederive that changes behavior is a regression, not a rewrite.
// `Array<T>` is not in the corpus. Its fix changed on purpose to `readonly T[]`,
// and tests/fix_test.ts pins that output.
import { readonlyData as original } from "../plans/readonly_original_reference.ts";

const makePlugin = (rule: Deno.lint.Rule): Deno.lint.Plugin => ({
  name: "probe",
  rules: { "readonly-data": rule },
});

const run = (
  plugin: Deno.lint.Plugin,
  source: string,
  filename: string,
): readonly string[] =>
  Deno.lint.runPlugin(plugin, filename, source)
    .map((d) =>
      `${d.id}|${d.message}|${d.range[0]}-${d.range[1]}|${d.fix !== undefined}`
    )
    .toSorted();

const corpus: Readonly<Record<string, readonly [string, string]>> = {
  "plain property": ["type A = { id: string };", "domain"],
  "readonly property": ["type A = { readonly id: string };", "domain"],
  "discriminated union members": [
    `type ADT = { readonly _tag: "A"; v: string } | { readonly _tag: "B"; w: number };`,
    "domain",
  ],
  "nested object": ["type A = { readonly a: { b: string } };", "domain"],
  "index signature": ["type A = { [k: string]: string };", "domain"],
  "interface member": ["interface A { id: string }", "domain"],
  "declare interface": ["declare interface A { id: string }", "domain"],
  "declare global interface": [
    `export {}; declare global { interface Ambient { value: string[] } }`,
    "domain",
  ],
  "declare module": [
    `declare module "pkg" { interface Ambient { value: string[] } }`,
    "domain",
  ],
  "mutable array": ["type A = { readonly xs: string[] };", "domain"],
  "nested mutable array": ["type A = { readonly xs: string[][] };", "domain"],
  "generic nested array": [
    "type A = { readonly m: Record<string, string[]> };",
    "domain",
  ],
  "Map and Set": [
    "type A = { readonly m: Map<string, number>; readonly s: Set<number> };",
    "domain",
  ],
  "ReadonlyArray passes": [
    "type A = { readonly xs: ReadonlyArray<string> };",
    "domain",
  ],
  "readonly operator": [
    "type A = { readonly xs: readonly string[] };",
    "domain",
  ],
  "nested readonly operator": [
    "type A = { readonly xs: readonly (readonly string[])[] };",
    "domain",
  ],
  "parameter annotation outside policy": [
    "export const f = (input: { xs: string[]; map: Map<string, string>; [key: string]: unknown }) => input;",
    "domain",
  ],
  "return annotation outside policy": [
    "export const f = (): { xs: string[] } => ({ xs: [] });",
    "domain",
  ],
  "callable annotation outside policy (method sig)": [
    `interface Port { load(input: { id: string }): { value: string }; }`,
    "domain",
  ],
  "callable annotation outside policy (fn prop)": [
    `interface Port { load: (input: { id: string }) => { value: string }; }`,
    "domain",
  ],
  "type alias function type": [
    `type Handler = (input: { id: string }) => { value: string };`,
    "domain",
  ],
  "constructor type": [
    `type Factory = new (input: { id: string }) => { value: string };`,
    "domain",
  ],
  "callable interface": [
    `interface Callable { (input: { id: string }): { value: string }; }`,
    "domain",
  ],
  "factory interface": [
    `interface Factory { new (input: { id: string }): { value: string }; }`,
    "domain",
  ],
  "nested callable inside data": [
    `type A = { f: (x: { v: string[] }) => void; keep: { v: string[] } };`,
    "domain",
  ],
  "mixed policy at every data node": [
    `type Data = { xs: string[]; map: Map<string, string>; [key: string]: unknown };`,
    "domain",
  ],
  "alias inside function": [
    `export const f = () => { type A = { id: string }; return 1; };`,
    "domain",
  ],
  "module-scope alias": [
    `declare module "m" { type A = { v: string } }`,
    "domain",
  ],
  "namespace without declare": [
    `namespace N { type A = { v: string } }`,
    "domain",
  ],
  "conditional and mapped types": [
    `type Unboxed<T> = T extends Box<infer U> ? { v: U } : never;`,
    "domain",
  ],
  "computed property key": [
    `declare const S: unique symbol; type A = { [S]: string };`,
    "domain",
  ],
  "adapter is silent": ["type A = { id: string };", "adapter"],
  "prelude keeps structural rules": [
    `// @light-fp prelude\ninterface Data { value: string }`,
    "domain",
  ],
  "tuple type": ["type A = { readonly pair: [string, number] };", "domain"],
  "union of arrays": [
    `type A = { readonly xs: string[] | number[] };`,
    "domain",
  ],
};

Deno.test("readonly-data rederive: identical diagnostics over the corpus", () => {
  const originalPlugin = makePlugin(original);
  const rederivedPlugin = makePlugin(rederived);
  for (const [name, [source, layer]] of Object.entries(corpus)) {
    const filename = layer === "adapter"
      ? "/repo/src/adapters/x.ts"
      : "/repo/src/domain/x.ts";
    const before = run(originalPlugin, source, filename);
    const after = run(rederivedPlugin, source, filename);
    assertEquals(after, before, name);
  }
});

const applyFixes = (
  plugin: Deno.lint.Plugin,
  source: string,
  filename: string,
  passes = 10,
): string => {
  const diagnostics = Deno.lint.runPlugin(plugin, filename, source);
  const edits = diagnostics.flatMap((d) => {
    const fix = d.fix;
    if (!fix) return [];
    return Array.isArray(fix) ? fix : [fix];
  }).filter((edit, index, all) =>
    // Non-overlapping, matching the CLI behavior.
    !all.some((other, otherIndex) =>
      otherIndex < index &&
      !(edit.range[1] <= other.range[0] || other.range[1] <= edit.range[0])
    )
  ).toSorted((a, b) => b.range[0] - a.range[0]);
  if (edits.length === 0 || passes === 0) return source;
  const next = edits.reduce(
    (out, edit) =>
      out.slice(0, edit.range[0]) + edit.text + out.slice(edit.range[1]),
    source,
  );
  return applyFixes(plugin, next, filename, passes - 1);
};

Deno.test("readonly-data rederive: fixes converge to the same text", () => {
  const sources = [
    `type A = { id: string };`,
    `type ADT = { _tag: "A"; v: string } | { _tag: "B"; w: number };`,
    `type A = { a: { b: string } };`,
    `type A = { readonly xs: string[] };`,
    `export type B = { readonly a: number[][] };`,
    `type A = { readonly m: Map<string, number> };`,
    `type A = { [k: string]: string };`,
    `type Data = { xs: string[]; map: Map<string, string>; [key: string]: unknown };`,
  ];
  for (const source of sources) {
    const filename = "/repo/src/domain/x.ts";
    const before = applyFixes(makePlugin(original), source, filename);
    const after = applyFixes(makePlugin(rederived), source, filename);
    assertEquals(after, before, source);
  }
});

Deno.test("readonly-data rederive: no throw on odd type nodes", () => {
  const sources = [
    `type Box<T> = { readonly value: T };\ntype Unboxed<T> = T extends Box<infer U> ? { v: U } : never;\ntype Accessors<T> = { readonly [K in keyof T as \`get\${Capitalize<string & K>}\`]-?: () => T[K]; };`,
    `declare global {\n  interface Window { readonly injected: string }\n  var externalName: string;\n}\ndeclare module "external-package" {\n  export interface Port { run(): void }\n}\ndeclare namespace ExternalNamespace {\n  const value: string;\n}`,
    `type R = { readonly [K in keyof T]?: T[K] };`,
    `type C = A & B | { readonly x: string[] };`,
    `export const first = <T,>(values: readonly T[]): T | undefined => values[0];`,
  ];
  for (const source of sources) {
    Deno.lint.runPlugin(makePlugin(rederived), "/repo/src/domain/x.ts", source);
  }
});
