import { assertEquals } from "@std/assert";
import { diagnose, DOMAIN } from "./harness.ts";

type FixEdit = ReturnType<Deno.lint.Fixer["replaceTextRange"]>;

const isFixArray = (
  value: FixEdit | readonly FixEdit[],
): value is readonly FixEdit[] => Array.isArray(value);

const FIX_PASS_CAP = 10;

const overlaps = (left: FixEdit, right: FixEdit): boolean =>
  left.range[0] === right.range[0] ||
  (left.range[0] < right.range[1] && right.range[0] < left.range[1]);

const nonOverlappingEdits = (
  edits: readonly FixEdit[],
): readonly FixEdit[] =>
  edits
    .toSorted((left, right) =>
      left.range[0] - right.range[0] || right.range[1] - left.range[1]
    )
    .reduce<readonly FixEdit[]>(
      (selected, edit) =>
        selected.some((existing) => overlaps(existing, edit))
          ? selected
          : [...selected, edit],
      [],
    );

const applyEdits = (source: string, edits: readonly FixEdit[]): string =>
  edits
    .toSorted((left, right) => right.range[0] - left.range[0])
    .reduce(
      (out, edit) =>
        out.slice(0, edit.range[0]) + edit.text + out.slice(edit.range[1]),
      source,
    );

const editsFor = (
  diagnostic: Deno.lint.Diagnostic,
): readonly FixEdit[] => {
  const fix: FixEdit | readonly FixEdit[] | undefined = diagnostic.fix;
  if (!fix) return [];
  return isFixArray(fix) ? fix : [fix];
};

/** Match the CLI: apply a non-overlapping set, lint again, and stop at a cap. */
const applyFixes = (source: string, filename = DOMAIN): string => {
  const applyPass = (current: string, passesRemaining: number): string => {
    const edits = nonOverlappingEdits(
      diagnose(current, filename).flatMap(editsFor),
    );
    if (edits.length === 0) return current;
    if (passesRemaining === 0) {
      throw new Error(`fixes did not converge after ${FIX_PASS_CAP} passes`);
    }
    return applyPass(applyEdits(current, edits), passesRemaining - 1);
  };

  return applyPass(source, FIX_PASS_CAP);
};

/** A fix is only correct if the result also stops reporting. */
const assertFix = (name: string, before: string, after: string) => {
  Deno.test(`fix: ${name}`, () => {
    const fixed = applyFixes(before);
    assertEquals(fixed, after);
    const remaining = diagnose(fixed, DOMAIN).filter((diagnostic) =>
      editsFor(diagnostic).length > 0
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
  "nested mutable arrays gain parenthesized readonly layers",
  `export type B = { readonly a: number[][] };`,
  `export type B = { readonly a: readonly (readonly number[])[] };`,
);

Deno.test("fix: only the outer nested array owns the replacement", () => {
  const source = `export type B = { readonly a: number[][] };`;
  const diagnostics = diagnose(source, DOMAIN).filter((diagnostic) =>
    diagnostic.id === "light-fp/readonly-data" &&
    diagnostic.message === "Arrays in data types are readonly."
  );
  const start = source.indexOf("number");
  assertEquals(diagnostics.length, 2);
  assertEquals(diagnostics.flatMap(editsFor), [
    {
      range: [start, start + "number[][]".length],
      text: "readonly (readonly number[])[]",
    },
  ]);
});

assertFix(
  "Map becomes ReadonlyMap",
  `type A = { readonly m: Map<string, number> };`,
  `type A = { readonly m: ReadonlyMap<string, number> };`,
);

assertFix(
  "Array becomes a readonly array",
  `type A = { readonly xs: Array<string> };`,
  `type A = { readonly xs: readonly string[] };`,
);

assertFix(
  "an Array of a union keeps the union in parentheses",
  `type A = { readonly xs: Array<string | number> };`,
  `type A = { readonly xs: readonly (string | number)[] };`,
);

assertFix(
  "an Array of arrays becomes readonly at both levels",
  `type A = { readonly xs: Array<string[]> };`,
  `type A = { readonly xs: readonly (readonly string[])[] };`,
);

assertFix(
  "an index signature gains readonly",
  `type A = { [k: string]: string };`,
  `type A = { readonly [k: string]: string };`,
);

assertFix(
  "members of a Readonly literal are left alone, and the wrapper is dropped",
  `type A = Readonly<{ a: string; readonly b: number }>;`,
  `type A = { readonly a: string; readonly b: number };`,
);

assertFix(
  "a Readonly literal with an index signature loses its wrapper",
  `type A = Readonly<{ [k: string]: string }>;`,
  `type A = { readonly [k: string]: string };`,
);

assertFix(
  "nested Readonly literals end type-identical",
  `type A = Readonly<{ a: Readonly<{ b: string }> }>;`,
  `type A = { readonly a: { readonly b: string } };`,
);

assertFix(
  "a Readonly literal keeps its wrapper when a method is present",
  `type A = Readonly<{ a: string; load(): void }>;`,
  `type A = Readonly<{ a: string; load(): void }>;`,
);

assertFix(
  "Readonly around a type reference is not rewritten",
  `type A = Readonly<SomeType>;\ntype B = Readonly<Record<string, string>>;`,
  `type A = Readonly<SomeType>;\ntype B = Readonly<Record<string, string>>;`,
);

// The wrapper stays, because its argument is a union, not a literal. The union
// members are ordinary data positions, so they still gain their own `readonly`.
assertFix(
  "Readonly around a union keeps its wrapper and marks the members",
  `type A = Readonly<{ a: string } | { b: string }>;`,
  `type A = Readonly<{ readonly a: string } | { readonly b: string }>;`,
);

Deno.test("fix: a single Readonly fix is valid TypeScript before the next pass", () => {
  const source = `type A = Readonly<{ a: Readonly<{ b: string }> }>;`;
  const edits = nonOverlappingEdits(diagnose(source, DOMAIN).flatMap(editsFor));
  const once = applyEdits(source, edits);
  // `diagnose` throws on a syntax error, so a parse failure fails this test.
  diagnose(once, DOMAIN);
  assertEquals(
    applyFixes(once),
    `type A = { readonly a: { readonly b: string } };`,
  );
});

// The previous rule set emitted `type User { ... };` here, dropping the `=`.
// Deno rejected the edit as a syntax error and silently applied nothing, so the
// documented auto-fix workflow could never have worked.
assertFix(
  "an interface holding data becomes a type alias, with its equals sign",
  `interface User {\n  readonly id: string;\n}`,
  `type User = {\n  readonly id: string;\n};`,
);

assertFix(
  "object constraints survive the interface rewrite",
  `interface Box<T extends { readonly key: string }> {\n  readonly item: T;\n}`,
  `type Box<T extends { readonly key: string }> = {\n  readonly item: T;\n};`,
);

assertFix(
  "declare interfaces stay unchanged",
  `declare interface Ambient { value: string }`,
  `declare interface Ambient { value: string }`,
);

assertFix(
  "interfaces in global augmentations stay unchanged",
  `export {};\ndeclare global { interface Ambient { value: string } }`,
  `export {};\ndeclare global { interface Ambient { value: string } }`,
);

assertFix(
  "computed property keys gain readonly before the member",
  `declare const S: unique symbol;\ntype A = { [S]: string };`,
  `declare const S: unique symbol;\ntype A = { readonly [S]: string };`,
);

Deno.test("fix: real CLI preserves an assignable ambient interface", async () => {
  const directory = await Deno.makeTempDir({ prefix: "light-fp-fix-" });
  const path = `${directory}/x.ts`;
  const config = new URL("../deno.json", import.meta.url).pathname;
  const source = `declare global {
  interface Amb { value: string }
  var amb: Amb;
}
export const bump = (): void => { globalThis.amb.value = "x"; };
`;
  try {
    await Deno.writeTextFile(path, source);
    const lint = await new Deno.Command(Deno.execPath(), {
      args: [
        "lint",
        "--fix",
        "--rules-exclude=light-fp/no-ambient-effects",
        "--config",
        config,
        path,
      ],
      stderr: "piped",
      stdout: "piped",
    }).output();
    const fixed = await Deno.readTextFile(path);
    const check = await new Deno.Command(Deno.execPath(), {
      args: ["check", "--no-lock", "--no-config", path],
      stderr: "piped",
      stdout: "piped",
    }).output();

    assertEquals(
      lint.success,
      true,
      new TextDecoder().decode(lint.stderr),
    );
    assertEquals(fixed, source);
    assertEquals(
      check.success,
      true,
      new TextDecoder().decode(check.stderr),
    );
  } finally {
    await Deno.remove(directory, { recursive: true });
  }
});

Deno.test("fix: real CLI converges on a type-correct nested array", async () => {
  const directory = await Deno.makeTempDir({ prefix: "light-fp-fix-" });
  const path = `${directory}/x.ts`;
  const config = new URL("../deno.json", import.meta.url).pathname;
  try {
    await Deno.writeTextFile(
      path,
      `export type B = { readonly a: number[][] };\n`,
    );
    const lint = await new Deno.Command(Deno.execPath(), {
      args: ["lint", "--fix", "--config", config, path],
      stderr: "piped",
      stdout: "piped",
    }).output();
    const lintError = new TextDecoder().decode(lint.stderr);
    assertEquals(lint.success, true, lintError);
    assertEquals(
      lintError.includes("maximum number of fix iterations"),
      false,
      lintError,
    );
    assertEquals(
      await Deno.readTextFile(path),
      `export type B = { readonly a: readonly (readonly number[])[] };\n`,
    );

    const check = await new Deno.Command(Deno.execPath(), {
      args: ["check", "--no-lock", "--no-config", path],
      stderr: "piped",
      stdout: "piped",
    }).output();
    assertEquals(
      check.success,
      true,
      new TextDecoder().decode(check.stderr),
    );
  } finally {
    await Deno.remove(directory, { recursive: true });
  }
});

Deno.test("fix: every emitted fix typechecks", async () => {
  const sources = [
    `type A = { id: string; xs: string[]; m: Map<string, number> };`,
    `type ADT = { _tag: "A"; v: string } | { _tag: "B" };`,
    `interface User { readonly id: string }`,
    `type Nested = { a: { b: { c: string[] } } };`,
    `export type B = { readonly a: number[][] };`,
    `interface Box<T extends { readonly key: string }> { readonly item: T }`,
    `declare interface Ambient { value: string }`,
    `export {}; declare global { interface Ambient { value: string } }`,
    `declare const S: unique symbol; type A = { [S]: string };`,
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
          `fixed output does not typecheck:\n${fixed}\n${
            new TextDecoder().decode(stderr)
          }`,
        );
      }
    } finally {
      await Deno.remove(path);
    }
  }
});
