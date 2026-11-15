import { assertEquals } from "@std/assert";
import plugin from "../src/mod.ts";

const diagnosticIds = (
  filename: string,
  source: string,
): readonly string[] =>
  Deno.lint.runPlugin(plugin, filename, source).map((diagnostic) =>
    diagnostic.id
  ).toSorted();

Deno.test("gate integrity: a bare file ignore is reported", () => {
  assertEquals(
    diagnosticIds(
      "/repo/src/domain/a.ts",
      "// deno-lint-ignore-file\nexport function f(): undefined { return undefined; }\n",
    ),
    ["light-fp/require-ignore-reason"],
  );
});

Deno.test("gate integrity: a reason cannot authorize a bare file ignore", () => {
  assertEquals(
    diagnosticIds(
      "/repo/src/domain/a.ts",
      "// deno-lint-ignore-file -- legacy file\nexport function f(): undefined { return undefined; }\n",
    ),
    ["light-fp/require-ignore-reason"],
  );
});

Deno.test("gate integrity: a foreign named file ignore is allowed", () => {
  assertEquals(
    diagnosticIds(
      "/repo/src/domain/a.ts",
      "// deno-lint-ignore-file no-explicit-any\nexport function f(): undefined { return undefined; }\n",
    ),
    [],
  );
});

Deno.test("gate integrity: infra imports cross the layer boundary", () => {
  assertEquals(
    diagnosticIds(
      "/repo/src/domain/a.ts",
      'import { query } from "../infra/db.ts";\n',
    ),
    ["light-fp/layer-boundary"],
  );
});

Deno.test("gate integrity: every adapter path convention crosses the boundary", () => {
  for (
    const specifier of [
      "../main.ts",
      "../adapter.ts",
      "../adapters/http.ts",
      "../infra.ts?worker",
      "../scripts/task.mts#entry",
      "../bin/tool.cts",
    ]
  ) {
    assertEquals(
      diagnosticIds(
        "/repo/src/domain/a.ts",
        `import { effect } from "${specifier}";\n`,
      ),
      ["light-fp/layer-boundary"],
      specifier,
    );
  }
});

Deno.test("gate integrity: prelude imports cannot cross into adapters", () => {
  assertEquals(
    diagnosticIds(
      "/repo/src/prelude/a.ts",
      '// @light-fp prelude\nimport { query } from "../adapters/db.ts";\n',
    ),
    ["light-fp/layer-boundary"],
  );
});

Deno.test("gate integrity: an invalid pragma stays strict on an adapter path", () => {
  assertEquals(
    diagnosticIds(
      "/repo/src/adapters/a.ts",
      "// @light-fp bogus\nexport const now = Date.now();\nexport class Service {}\n",
    ),
    [
      "light-fp/layer-boundary",
      "light-fp/no-ambient-effects",
      "light-fp/no-oo",
      // The initializer call runs at import; pure-module owns that.
      "light-fp/pure-module",
    ],
  );
});

Deno.test("gate integrity: layer resolution passes its own relative-path gate", async () => {
  const source = await Deno.readTextFile("src/layer.ts");
  assertEquals(diagnosticIds("src/layer.ts", source), [
    "light-fp/ambient-names",
    "light-fp/no-ambient-effects",
    "light-fp/no-throw",
  ]);
});
