import { assert, assertEquals } from "@std/assert";
import { fromFileUrl, join, relative } from "@std/path";
import { type Baseline, compare, explain, measure } from "../src/ratchet.ts";
import plugin, { type FileDelta } from "../src/mod.ts";

// The capability the ratchet asks for: this is the adapter half.
const count = (path: string, source: string): number =>
  Deno.lint.runPlugin(plugin, path, source).length;

const root = fromFileUrl(new URL("..", import.meta.url));

const walk = async function* (dir: string): AsyncGenerator<string> {
  for await (const entry of Deno.readDir(dir)) {
    const path = join(dir, entry.name);
    if (entry.isDirectory) yield* walk(path);
    else if (entry.name.endsWith(".ts")) yield path;
  }
};

const read = async (
  dir: string,
): Promise<readonly (readonly [string, string])[]> => {
  const out: (readonly [string, string])[] = [];
  for await (const path of walk(join(root, dir))) {
    out.push([relative(root, path), await Deno.readTextFile(path)]);
  }
  return out.toSorted((a, b) => a[0].localeCompare(b[0]));
};

// The plugin's own baseline. runPlugin ignores deno-lint-ignore, so a signed
// suppression still counts here: a suppression is debt, and debt must not pay
// itself down. src/layer.ts carries three: the one cwd read the gate cannot avoid
// draws two diagnostics, and the surrounding try draws one. The honest baseline
// is that triple rather than zero.
const SRC_BASELINE: Readonly<Record<string, number>> = { "src/layer.ts": 3 };

Deno.test("ratchet: this repository holds at its committed baseline", async () => {
  const current = measure(count, await read("src"));
  const entries = Object.entries(current);
  assert(entries.length > 0, "the walk found no files; nothing was measured");

  const offenders = Object.fromEntries(entries.filter(([, n]) => n > 0));
  assertEquals(
    offenders,
    SRC_BASELINE,
    "src/ diverged from its baseline: a new violation, or debt paid down without tightening SRC_BASELINE",
  );
});

// The comparison itself is pure, so it is tested as data rather than by
// arranging a repository that regresses.

Deno.test("ratchet: an unchanged count passes", () => {
  const baseline: Baseline = { "a.ts": 3, "b.ts": 0 };
  assertEquals(compare(baseline, { "a.ts": 3, "b.ts": 0 })._tag, "Unchanged");
});

Deno.test("ratchet: a new violation fails", () => {
  const verdict = compare({ "a.ts": 3 }, { "a.ts": 4 });
  assertEquals(verdict._tag, "Regressed");
  assertEquals(explain(verdict).includes("a.ts: 3 -> 4"), true);
});

Deno.test("ratchet: a new file with violations fails", () => {
  const verdict = compare({}, { "new.ts": 2 });
  assertEquals(verdict._tag, "Regressed");
});

Deno.test("ratchet: progress fails too, asking for a tighter baseline", () => {
  const verdict = compare({ "a.ts": 3 }, { "a.ts": 1 });
  assertEquals(verdict._tag, "Improved");
  assertEquals(explain(verdict).includes("tighten the baseline"), true);
});

Deno.test("ratchet: an empty measurement proves nothing", () => {
  const baselines: readonly Baseline[] = [
    { "a.ts": 3 },
    { "a.ts": 0, "b.ts": 0 },
    {},
  ];

  for (const baseline of baselines) {
    const verdict = compare(baseline, {});
    assertEquals(verdict._tag, "NothingMeasured");
    assertEquals(
      explain(verdict),
      "no files were measured; the ratchet proved nothing",
    );
  }
});

Deno.test("ratchet: a missing file remains an improvement", () => {
  const missing: FileDelta = { file: "a.ts", was: 3, now: 0 };
  assertEquals(
    compare({ "a.ts": 3 }, { "measured.ts": 0 }),
    { _tag: "Improved", files: [missing] },
  );
});

Deno.test("ratchet: a rise anywhere outweighs a fall elsewhere", () => {
  // Otherwise one cleaned file would pay for a regression in another.
  const verdict = compare({ "a.ts": 3, "b.ts": 1 }, { "a.ts": 1, "b.ts": 4 });
  assertEquals(verdict._tag, "Regressed");
});

Deno.test("ratchet: measure counts real diagnostics", () => {
  const counted = measure(count, [
    ["src/domain/a.ts", `export const now = Date.now();`],
    [
      "src/domain/b.ts",
      `type Count = number; export function f(): Count { return 1; }`,
    ],
    ["src/adapters/c.ts", `export const now = Date.now();`],
  ]);
  // Two: pure-module for the call in a module-scope initializer, and
  // no-ambient-effects for the clock read.
  assertEquals(counted["src/domain/a.ts"], 2);
  assertEquals(counted["src/domain/b.ts"], 0);
  assertEquals(counted["src/adapters/c.ts"], 0);
});

Deno.test("ratchet: each verdict explains itself with an exact message", () => {
  assertEquals(explain({ _tag: "Unchanged" }), "");
  assertEquals(
    explain({
      _tag: "Regressed",
      files: [{ file: "a.ts", was: 3, now: 4 }],
    }),
    "new violations:\n  a.ts: 3 -> 4",
  );
  assertEquals(
    explain({
      _tag: "Improved",
      files: [{ file: "a.ts", was: 3, now: 1 }],
    }),
    "violations went down; tighten the baseline:\n  a.ts: 3 -> 1",
  );
});

Deno.test("ratchet: the compared files are the sorted union of both sides", () => {
  assertEquals(
    compare({ "b.ts": 1, "a.ts": 2 }, { "a.ts": 1, "c.ts": 0 }),
    {
      _tag: "Improved",
      files: [
        { file: "a.ts", was: 2, now: 1 },
        { file: "b.ts", was: 1, now: 0 },
      ],
    },
  );
});
