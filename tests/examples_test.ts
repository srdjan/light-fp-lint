import { assertEquals } from "@std/assert";
import { fromFileUrl, join } from "@std/path";
import plugin from "../src/mod.ts";
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

// Exact per-file diagnostic multisets prevent examples from silently losing
// documented violations.

const expectedDiagnostics: Readonly<Record<string, readonly string[]>> = {
  "adapters/auth.ts": [],
  "adapters/http.ts": [],
  "adapters/persistence.ts": [],
  "adapters/side.ts": [],
  "domain/api_orchestration.bad.ts": [
    "light-fp/no-ambient-effects",
    "light-fp/no-ambient-effects",
    "light-fp/no-ambient-effects",
    "light-fp/no-ambient-effects",
    "light-fp/no-discarded-values",
    "light-fp/no-discarded-values",
    "light-fp/no-throw",
    "light-fp/no-throw",
  ],
  "domain/api_orchestration.good.ts": [],
  "domain/auth_flow.bad.ts": [
    "light-fp/layer-boundary",
    "light-fp/no-ambient-effects",
    "light-fp/no-ambient-effects",
    "light-fp/no-ambient-effects",
    "light-fp/no-ambient-effects",
    "light-fp/no-ambient-effects",
    "light-fp/no-ambient-effects",
    "light-fp/no-discarded-values",
    "light-fp/no-discarded-values",
    "light-fp/no-oo",
    "light-fp/no-oo",
    "light-fp/no-oo",
    "light-fp/no-oo",
    "light-fp/no-oo",
    "light-fp/no-oo",
    "light-fp/no-throw",
    "light-fp/no-throw",
    "light-fp/prefer-type-for-data",
    "light-fp/pure-module",
    "light-fp/pure-module",
    "light-fp/pure-module",
    "light-fp/pure-module",
    "light-fp/readonly-data",
    "light-fp/readonly-data",
  ],
  "domain/auth_flow.good.ts": [],
  "domain/bad.ts": [
    "light-fp/layer-boundary",
    "light-fp/no-ambient-effects",
    "light-fp/no-discarded-values",
    "light-fp/no-oo",
    "light-fp/no-throw",
    "light-fp/no-unsafe-cast",
    "light-fp/prefer-type-for-data",
    "light-fp/pure-module",
    "light-fp/pure-module",
    "light-fp/readonly-data",
    "light-fp/readonly-data",
    "light-fp/readonly-data",
  ],
  "domain/effect_composition.bad.ts": [
    "light-fp/no-ambient-effects",
    "light-fp/no-discarded-values",
    "light-fp/no-discarded-values",
    "light-fp/pure-module",
  ],
  "domain/effect_composition.good.ts": [],
  "domain/persistence.bad.ts": [
    "light-fp/layer-boundary",
    "light-fp/no-ambient-effects",
    "light-fp/no-discarded-values",
    "light-fp/no-throw",
    "light-fp/no-throw",
    "light-fp/readonly-data",
    "light-fp/readonly-data",
    "light-fp/readonly-data",
    "light-fp/readonly-data",
  ],
  "domain/persistence.good.ts": [],
  "domain/shared/primitives.ts": [],
  "domain/validation_pipeline.bad.ts": [
    "light-fp/no-ambient-effects",
    "light-fp/no-ambient-effects",
    "light-fp/no-ambient-effects",
    "light-fp/no-discarded-values",
    "light-fp/no-discarded-values",
    "light-fp/no-throw",
    "light-fp/no-unsafe-cast",
    "light-fp/prefer-type-for-data",
    "light-fp/readonly-data",
    "light-fp/readonly-data",
    "light-fp/readonly-data",
    "light-fp/readonly-data",
    "light-fp/readonly-data",
  ],
  "domain/validation_pipeline.good.ts": [],
};

Deno.test("examples: every file has its exact documented diagnostics", () => {
  assertEquals(
    [...corpus.keys()].toSorted(),
    Object.keys(expectedDiagnostics).toSorted(),
    "the example corpus changed without updating its diagnostic record",
  );

  for (const [name, expected] of Object.entries(expectedDiagnostics)) {
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
