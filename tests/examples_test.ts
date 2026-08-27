import { assertEquals } from "@std/assert";
import { fromFileUrl, join } from "@std/path";
import { diagnose } from "./harness.ts";

const root = fromFileUrl(new URL("../examples/src", import.meta.url));

const walk = async function* (dir: string): AsyncGenerator<string> {
  for await (const entry of Deno.readDir(dir)) {
    const path = join(dir, entry.name);
    if (entry.isDirectory) yield* walk(path);
    else if (entry.name.endsWith(".ts")) yield path;
  }
};

const collect = async (): Promise<
  ReadonlyMap<string, readonly Deno.lint.Diagnostic[]>
> => {
  const found = new Map<string, readonly Deno.lint.Diagnostic[]>();
  for await (const path of walk(root)) {
    found.set(
      path.slice(root.length + 1),
      diagnose(await Deno.readTextFile(path), path),
    );
  }
  return found;
};

const corpus = await collect();

// The examples are the documentation. Pinning them here is what stops the docs
// drifting away from what the rules do, which is how the previous rule set came
// to advertise behavior it never had.

Deno.test("examples: every .good.ts file is clean", () => {
  for (const [name, diagnostics] of corpus) {
    if (!name.endsWith(".good.ts")) continue;
    assertEquals(
      diagnostics.map((d) => `${d.id} ${d.message}`),
      [],
      `${name} is presented as correct but the gate rejects it`,
    );
  }
});

Deno.test("examples: adapters and the prelude are clean", () => {
  for (const [name, diagnostics] of corpus) {
    if (!name.startsWith("adapters/") && !name.endsWith("primitives.ts")) {
      continue;
    }
    assertEquals(
      diagnostics.map((d) => `${d.id} ${d.message}`),
      [],
      `${name} should pass at its own layer`,
    );
  }
});

Deno.test("examples: every .bad.ts file is rejected", () => {
  for (const [name, diagnostics] of corpus) {
    if (!name.endsWith(".bad.ts") && name !== "domain/bad.ts") continue;
    if (diagnostics.length > 0) continue;
    throw new Error(
      `${name} is presented as a violation but the gate accepts it`,
    );
  }
});

Deno.test("examples: the corpus exercises every rule", () => {
  const fired = new Set<string>();
  for (const diagnostics of corpus.values()) {
    for (const diagnostic of diagnostics) fired.add(diagnostic.id);
  }
  // require-ignore-reason has nothing to fire on here: the corpus carries no
  // suppressions, which is itself the point.
  const expected = [
    "light-fp/layer-boundary",
    "light-fp/no-ambient-effects",
    "light-fp/no-discarded-values",
    "light-fp/no-oo",
    "light-fp/no-throw",
    "light-fp/no-unsafe-cast",
    "light-fp/prefer-type-for-data",
    "light-fp/pure-module",
    "light-fp/readonly-data",
  ];
  assertEquals(
    expected.filter((id) => !fired.has(id)),
    [],
    "rules with no example to demonstrate them",
  );
});
