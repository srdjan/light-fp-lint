import { assertEquals } from "@std/assert";
import plugin from "../src/mod.ts";

Deno.test("plugin: exposes the documented rule set", () => {
  assertEquals(plugin.name, "light-fp");
  assertEquals(Object.keys(plugin.rules).toSorted(), [
    "declaration-forms",
    "function-forms",
    "layer-boundary",
    "lexical-forms",
    "module-forms",
    "no-ambient-effects",
    "no-discarded-values",
    "no-oo",
    "no-throw",
    "no-unsafe-cast",
    "operator-forms",
    "prefer-type-for-data",
    "pure-module",
    "readonly-data",
    "require-ignore-reason",
    "statement-forms",
  ]);
});

Deno.test("plugin: every rule reports with a hint", () => {
  // A hint is how the gate teaches instead of only blocking, so an empty one is
  // a defect rather than a style preference.
  const sources: Readonly<Record<string, string>> = {
    "layer-boundary": `import { x } from "../adapters/http.ts";`,
    "module-forms": `export default 1;`,
    "lexical-forms": `export const a = "a\\qb";`,
    "declaration-forms": `export const f = () => 1;`,
    "function-forms": `export function f(a = 1): number { return a; }`,
    "statement-forms":
      `export function f(x: boolean): void { while (x) { return; } }`,
    "operator-forms": `export const a = (x: number): boolean => x == 1;`,
    "pure-module": `let n = 0;`,
    "no-ambient-effects": `export const now = Date.now();`,
    "no-throw": `export const f = () => { throw new Error("x"); };`,
    "no-discarded-values": `export const f = () => { g(); return 1; };`,
    "readonly-data": `type A = { id: string };`,
    "no-oo": `export class A {}`,
    "no-unsafe-cast": `export const f = (x: unknown) => x as Foreign;`,
    "prefer-type-for-data": `interface User { readonly id: string }`,
    "require-ignore-reason":
      `// deno-lint-ignore light-fp/no-throw\nexport const f = () => 1;`,
  };
  for (const [rule, source] of Object.entries(sources)) {
    const found = Deno.lint
      .runPlugin(plugin, "/repo/src/domain/a.ts", source)
      .filter((d) => d.id === `light-fp/${rule}`);
    assertEquals(
      found.length > 0,
      true,
      `${rule} produced no diagnostic for its own sample`,
    );
    for (const diagnostic of found) {
      assertEquals(
        typeof diagnostic.hint === "string" && diagnostic.hint.length > 0,
        true,
        `${rule} reported without a hint`,
      );
    }
  }
});
