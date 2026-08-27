import { assertEquals } from "@std/assert";
import { fromFileUrl, join, relative } from "@std/path";
import { type Baseline, compare, explain, measure } from "../src/ratchet.ts";
import plugin from "../src/mod.ts";

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

Deno.test("ratchet: this repository holds at zero", async () => {
  const current = measure(count, await read("src"));
  const offenders = Object.entries(current).filter(([, count]) => count > 0);
  assertEquals(offenders, [], "the plugin no longer passes its own gate");
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

Deno.test("ratchet: a rise anywhere outweighs a fall elsewhere", () => {
  // Otherwise one cleaned file would pay for a regression in another.
  const verdict = compare({ "a.ts": 3, "b.ts": 1 }, { "a.ts": 1, "b.ts": 4 });
  assertEquals(verdict._tag, "Regressed");
});

Deno.test("ratchet: measure counts real diagnostics", () => {
  const counted = measure(count, [
    ["src/domain/a.ts", `export const now = Date.now();`],
    ["src/domain/b.ts", `export const f = () => 1;`],
    ["src/adapters/c.ts", `export const now = Date.now();`],
  ]);
  assertEquals(counted["src/domain/a.ts"], 1);
  assertEquals(counted["src/domain/b.ts"], 0);
  assertEquals(counted["src/adapters/c.ts"], 0);
});
