// Adoption support: freeze today's violations, forbid new ones.
//
// A lint rule cannot hold state between files, let alone between runs, and
// reading a baseline from inside a plugin would make the same file lint
// differently in the editor and in CI. `Deno.lint.runPlugin` works inside
// `deno test`, where file access is ordinary, so the ratchet lives there.
//
// This module is domain code and passes the gate with no exemption. Counting
// diagnostics means calling `Deno.lint.runPlugin`, which is an ambient effect,
// so it arrives as a capability instead: the caller supplies the counter, and
// this module stays a pure function from measurements to a verdict.

/** Violations per file, keyed by a repository-relative path. */
export type Baseline = Readonly<Record<string, number>>;

/** Counts the diagnostics one file produces. Supplied by the caller. */
export type CountDiagnostics = (path: string, source: string) => number;

/** One file whose violation count moved between two measurements. */
export type FileDelta = Readonly<{
  readonly file: string;
  readonly was: number;
  readonly now: number;
}>;

/**
 * The result of comparing a measurement against a baseline. `Improved` is a
 * failure too, because a baseline that is not tightened lets the ground that
 * was won be lost again silently.
 */
export type Verdict =
  | { readonly _tag: "Unchanged" }
  | { readonly _tag: "NothingMeasured" }
  | { readonly _tag: "Regressed"; readonly files: readonly FileDelta[] }
  | { readonly _tag: "Improved"; readonly files: readonly FileDelta[] };

/**
 * Count the violations in each file and return the result as a baseline.
 *
 * ```ts
 * import { measure } from "@srdjan/light-fp-lint";
 *
 * const baseline = measure(() => 0, [["src/cart.ts", "export const a = 1;"]]);
 * ```
 */
export const measure = (
  count: CountDiagnostics,
  files: readonly (readonly [path: string, source: string])[],
): Baseline =>
  Object.fromEntries(
    files.map(([path, source]) => [path, count(path, source)]),
  );

const deltas = (baseline: Baseline, current: Baseline): readonly FileDelta[] =>
  [...new Set([...Object.keys(baseline), ...Object.keys(current)])]
    .toSorted()
    .map((file) => ({
      file,
      was: baseline[file] ?? 0,
      now: current[file] ?? 0,
    }))
    .filter((d) => d.was !== d.now);

/**
 * Compare a measurement against the committed baseline.
 *
 * A rise is a regression. A fall is also a failure, reported as `Improved`, so
 * the baseline gets tightened and the ground that was won cannot be lost again
 * without anyone noticing.
 */
export const compare = (baseline: Baseline, current: Baseline): Verdict => {
  if (Object.keys(current).length === 0) return { _tag: "NothingMeasured" };
  const changed = deltas(baseline, current);
  if (changed.length === 0) return { _tag: "Unchanged" };
  const worse = changed.filter((d) => d.now > d.was);
  return worse.length > 0
    ? { _tag: "Regressed", files: worse }
    : { _tag: "Improved", files: changed };
};

const listing = (files: readonly FileDelta[]): string =>
  files.map((d) => `  ${d.file}: ${d.was} -> ${d.now}`).join("\n");

/** A message suitable for a failing test. */
export const explain = (verdict: Verdict): string => {
  switch (verdict._tag) {
    case "Unchanged":
      return "";
    case "NothingMeasured":
      return "no files were measured; the ratchet proved nothing";
    case "Regressed":
      return `new violations:\n${listing(verdict.files)}`;
    case "Improved":
      return `violations went down; tighten the baseline:\n${
        listing(verdict.files)
      }`;
  }
};
