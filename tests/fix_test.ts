import { assertEquals } from "@std/assert";
import { diagnose, DOMAIN } from "./harness.ts";

/**
 * Apply every fix a file's diagnostics carry, back to front so earlier ranges
 * stay valid. Measured against Deno 2.9.5: runPlugin diagnostics expose their
 * fix edits, so a fix can be asserted as text without shelling out to the CLI.
 */
const applyFixes = (source: string, filename = DOMAIN): string => {
  const edits = diagnose(source, filename)
    .flatMap((d) => d.fix ?? [])
    .toSorted((a, b) => b.range[0] - a.range[0]);
  let out = source;
  for (const edit of edits) {
    out = out.slice(0, edit.range[0]) + edit.text + out.slice(edit.range[1]);
  }
  return out;
};

/** A fix is only correct if the result also stops reporting. */
const assertFix = (name: string, before: string, after: string) => {
  Deno.test(`fix: ${name}`, () => {
    const fixed = applyFixes(before);
    assertEquals(fixed, after);
    const remaining = diagnose(fixed, DOMAIN).filter((d) =>
      d.fix && d.fix.length > 0
    );
    assertEquals(
      remaining.map((d) => d.id),
      [],
      "the fixed output still reports a fixable problem",
    );
  });
};

assertFix(
  "a plain property gains readonly",
  `type A = { id: string };`,
  `type A = { readonly id: string };`,
);

assertFix(
  "every member of a union is fixed at once",
  `type ADT = { _tag: "A"; v: string } | { _tag: "B"; w: number };`,
  `type ADT = { readonly _tag: "A"; readonly v: string } | { readonly _tag: "B"; readonly w: number };`,
);

assertFix(
  "a nested property is fixed at depth",
  `type A = { a: { b: string } };`,
  `type A = { readonly a: { readonly b: string } };`,
);

assertFix(
  "a mutable array gains readonly",
  `type A = { readonly xs: string[] };`,
  `type A = { readonly xs: readonly string[] };`,
);

assertFix(
  "Map becomes ReadonlyMap",
  `type A = { readonly m: Map<string, number> };`,
  `type A = { readonly m: ReadonlyMap<string, number> };`,
);

assertFix(
  "an index signature gains readonly",
  `type A = { [k: string]: string };`,
  `type A = { readonly [k: string]: string };`,
);

// The previous rule set emitted `type User { ... };` here, dropping the `=`.
// Deno rejected the edit as a syntax error and silently applied nothing, so the
// documented auto-fix workflow could never have worked.
assertFix(
  "an interface holding data becomes a type alias, with its equals sign",
  `interface User {\n  readonly id: string;\n}`,
  `type User = {\n  readonly id: string;\n};`,
);

Deno.test("fix: generic parameters survive the interface rewrite", () => {
  assertEquals(
    applyFixes(`interface Box<T> {\n  readonly item: T;\n}`),
    `type Box<T> = {\n  readonly item: T;\n};`,
  );
});

Deno.test("fix: every emitted fix parses", async () => {
  const sources = [
    `type A = { id: string; xs: string[]; m: Map<string, number> };`,
    `type ADT = { _tag: "A"; v: string } | { _tag: "B" };`,
    `interface User { readonly id: string }`,
    `type Nested = { a: { b: { c: string[] } } };`,
  ];
  for (const source of sources) {
    const fixed = applyFixes(source);
    const path = await Deno.makeTempFile({ suffix: ".ts" });
    try {
      await Deno.writeTextFile(path, fixed);
      const { success, stderr } = await new Deno.Command(Deno.execPath(), {
        args: ["check", "--no-lock", "--no-config", path],
        stderr: "piped",
        stdout: "null",
      }).output();
      if (!success) {
        throw new Error(
          `fixed output does not parse:\n${fixed}\n${
            new TextDecoder().decode(stderr)
          }`,
        );
      }
    } finally {
      await Deno.remove(path);
    }
  }
});
