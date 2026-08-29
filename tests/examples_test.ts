import { assertEquals } from "@std/assert";
import { fromFileUrl, join } from "@std/path";
import plugin from "../src/mod.ts";
import { expectedExampleDiagnostics } from "./example_expectations.ts";
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

Deno.test("examples: every file has its exact documented diagnostics", () => {
  assertEquals(
    [...corpus.keys()].toSorted(),
    Object.keys(expectedExampleDiagnostics).toSorted(),
    "the example corpus changed without updating its diagnostic record",
  );

  for (const [name, expected] of Object.entries(expectedExampleDiagnostics)) {
    const actual = corpus.get(name);
    if (!actual) throw new Error(`${name} is missing from the example corpus`);
    assertEquals(
      actual.map((diagnostic) => diagnostic.id).toSorted(),
      expected,
      `${name} no longer produces its documented diagnostic list`,
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
  const expected = Object.keys(plugin.rules)
    .filter((id) => id !== "require-ignore-reason")
    .map((id) => `light-fp/${id}`)
    .toSorted();
  assertEquals(
    expected.filter((id) => !fired.has(id)),
    [],
    "rules with no example to demonstrate them",
  );
});
