import { assertEquals } from "@std/assert";
import { isAdapterPath, layerOf, pathWithinRoot } from "../src/layer.ts";
import plugin from "../src/mod.ts";

// layerOf needs a SourceCode, and the only way to get a real one is from inside a
// running rule. This probe plugin captures the layer decision for one source.
const probe = (source: string, filename: string): string => {
  let seen = "unset";
  const capture: Deno.lint.Plugin = {
    name: "probe",
    rules: {
      layer: {
        create(context) {
          seen = layerOf(context.filename, context.sourceCode);
          return {};
        },
      },
    },
  };
  Deno.lint.runPlugin(capture, filename, source);
  return seen;
};

Deno.test("layer: path convention marks adapters", () => {
  assertEquals(probe("", "/repo/src/adapters/http.ts"), "adapter");
  assertEquals(probe("", "/repo/src/adapter/http.ts"), "adapter");
  assertEquals(probe("", "/repo/src/infra/db.ts"), "adapter");
  assertEquals(probe("", "/repo/scripts/build.ts"), "adapter");
  assertEquals(probe("", "/repo/bin/cli.ts"), "adapter");
  assertEquals(probe("", "/repo/src/main.ts"), "adapter");
});

Deno.test("layer: test files are adapters", () => {
  assertEquals(probe("", "/repo/tests/thing_test.ts"), "adapter");
  assertEquals(probe("", "/repo/tests/thing.test.ts"), "adapter");
  assertEquals(probe("", "/repo/tests/thing_bench.ts"), "adapter");
});

Deno.test("layer: test suffixes cover every lintable extension", () => {
  const extensions = ["ts", "tsx", "mts", "cts", "js", "jsx", "mjs", "cjs"];
  const markers = ["_test", ".test", "_bench", ".bench"];

  for (const extension of extensions) {
    for (const marker of markers) {
      assertEquals(
        probe("", `/repo/tests/thing${marker}.${extension}`),
        "adapter",
      );
    }
  }
});

Deno.test("layer: paths inside cwd ignore adapter-named cwd ancestors", () => {
  const root = Deno.cwd().replaceAll("\\", "/");
  assertEquals(probe("", `${root}/src/domain/order.ts`), "domain");
  assertEquals(probe("", `${root}/src/infra/db.ts`), "adapter");
});

Deno.test("layer: root stripping removes adapter-named checkout ancestors", () => {
  const root = "/tmp/adapters/worktree";
  assertEquals(
    pathWithinRoot(`${root}/src/domain/order.ts`, root),
    "src/domain/order.ts",
  );
});

Deno.test("layer: paths outside cwd retain whole-path fallback", () => {
  assertEquals(probe("", "/repo/scripts/app/src/domain/order.ts"), "adapter");
});

Deno.test("layer: an unrecognised path fails closed to domain", () => {
  assertEquals(probe("", "/repo/src/core/login.ts"), "domain");
  assertEquals(probe("", "/repo/anywhere/at/all.ts"), "domain");
  assertEquals(probe("", "/x.ts"), "domain");
});

Deno.test("layer: a segment is matched whole, not as a substring", () => {
  // `my-adapters-helper` is not an adapter directory.
  assertEquals(probe("", "/repo/src/my-adapters-helper/x.ts"), "domain");
});

Deno.test("layer: the pragma overrides the path in both directions", () => {
  assertEquals(
    probe("// @light-fp adapter\n", "/repo/src/core/x.ts"),
    "adapter",
  );
  assertEquals(
    probe("// @light-fp domain\n", "/repo/src/adapters/x.ts"),
    "domain",
  );
  assertEquals(
    probe("// @light-fp prelude\n", "/repo/src/core/x.ts"),
    "prelude",
  );
  assertEquals(
    probe("/* @light-fp adapter */\n", "/repo/src/core/x.ts"),
    "adapter",
  );
});

Deno.test("layer: a pragma after the first statement does not count", () => {
  assertEquals(
    probe("const a = 1;\n// @light-fp adapter\n", "/repo/src/core/x.ts"),
    "domain",
  );
});

Deno.test("layer: prose mentions are not pragmas", () => {
  assertEquals(
    probe(
      "// TODO: move this behind an @light-fp adapter pragma\n",
      "/repo/src/core/x.ts",
    ),
    "domain",
  );
  assertEquals(
    probe(
      "/** Adapters use the @light-fp adapter pragma. */\n",
      "/repo/src/core/x.ts",
    ),
    "domain",
  );
  assertEquals(
    probe(
      "/**\n * Use @light-fp adapter for an adapter file.\n */\n",
      "/repo/src/core/x.ts",
    ),
    "domain",
  );
});

Deno.test("layer: an unknown pragma token leaves the file in the strict layer", () => {
  assertEquals(
    probe("// @light-fp whatever\n", "/repo/src/core/x.ts"),
    "domain",
  );
});

Deno.test("layer: an unknown pragma token is itself reported", () => {
  const found = Deno.lint
    .runPlugin(plugin, "/repo/src/core/x.ts", "// @light-fp whatever\n")
    .filter((d) => d.id === "light-fp/layer-boundary");
  assertEquals(found.length, 1);
});

Deno.test("layer: a miscased pragma token is invalid", () => {
  const found = Deno.lint
    .runPlugin(plugin, "/repo/src/core/x.ts", "// @light-fp Adapter\n")
    .filter((d) => d.id === "light-fp/layer-boundary");
  assertEquals(found.length, 1);
});

Deno.test("layer: the pragma tolerates any whitespace between its parts", () => {
  const adapterSources: readonly string[] = [
    "//   @light-fp   adapter\n",
    "//@light-fp adapter\n",
    "// @light-fp\tadapter\n",
    "// @light-fp\u00A0adapter\n",
    "// @light-fp adapter extra words\n",
    "/*\n @light-fp adapter\n*/\n",
    "/* @light-fp\nadapter */\n",
  ];
  for (const source of adapterSources) {
    assertEquals(probe(source, "/repo/src/core/x.ts"), "adapter", source);
  }
});

Deno.test("layer: the pragma needs whitespace, then a token, after its name", () => {
  const domainSources: readonly string[] = [
    "// @light-fpadapter\n",
    "// @light-fp\n",
    "// @light-fp   \n",
    "// x @light-fp adapter\n",
    "// @light-fp-adapter\n",
  ];
  for (const source of domainSources) {
    assertEquals(probe(source, "/repo/src/core/x.ts"), "domain", source);
  }
});

Deno.test("layer: a pragma token ends at the next whitespace", () => {
  const found = Deno.lint
    .runPlugin(plugin, "/repo/src/core/x.ts", "// @light-fp adaptér more\n")
    .filter((d) => d.id === "light-fp/layer-boundary");
  assertEquals(found.length, 1);
  assertEquals(
    probe("// @light-fp prelude\u2003and more\n", "/repo/src/core/x.ts"),
    "prelude",
  );
});

Deno.test("layer: a query or fragment never makes a path an adapter path", () => {
  assertEquals(
    isAdapterPath("/repo/src/core/x.ts?v=1#adapters/y", undefined),
    false,
  );
  assertEquals(
    isAdapterPath("/repo/src/core/x.ts#a?b/adapters/c", undefined),
    false,
  );
  assertEquals(isAdapterPath("/repo/src/adapters/x.ts#frag", undefined), true);
  assertEquals(isAdapterPath("/repo/src/adapters/x.ts?v=1", undefined), true);
  assertEquals(isAdapterPath("/repo/src/core/main.ts?x", undefined), true);
});
