// @light-fp adapter -- this compatibility test drives the real Deno CLI.
import { assertEquals } from "@std/assert";
import { fromFileUrl, join, relative } from "@std/path";
import lightFpPlugin from "../src/mod.ts";
import { expectedExampleDiagnostics } from "./example_expectations.ts";

const decoder = new TextDecoder();

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

type PluginDiagnostic =
  & Readonly<Record<string, unknown>>
  & Readonly<{ code: string }>;

const isPluginDiagnostic = (
  diagnostic: Readonly<Record<string, unknown>>,
): diagnostic is PluginDiagnostic =>
  typeof diagnostic.code === "string" &&
  diagnostic.code.startsWith("light-fp/");

const pluginDiagnostics = (stdout: Uint8Array): readonly PluginDiagnostic[] => {
  const parsed: unknown = JSON.parse(decoder.decode(stdout));
  if (!isRecord(parsed) || !Array.isArray(parsed.diagnostics)) {
    throw new Error("deno lint returned an invalid JSON envelope");
  }
  const diagnostics = parsed.diagnostics.map((diagnostic) => {
    if (!isRecord(diagnostic)) {
      throw new Error("deno lint returned an invalid diagnostic");
    }
    return diagnostic;
  });
  return diagnostics.filter(isPluginDiagnostic);
};

const pluginCodes = (stdout: Uint8Array): readonly string[] =>
  pluginDiagnostics(stdout).map((diagnostic) => diagnostic.code).toSorted();

const runLint = (directory: string, file: string) =>
  new Deno.Command(Deno.execPath(), {
    args: ["lint", "--json", `--config=${join(directory, "deno.json")}`, file],
    cwd: directory,
    stdin: "null",
    stdout: "piped",
    stderr: "piped",
  }).output();

const exampleDiagnostics = (
  stdout: Uint8Array,
  sourceRoot: string,
): Readonly<Record<string, readonly string[]>> => {
  const found = new Map<string, string[]>(
    Object.keys(expectedExampleDiagnostics).map((name): [string, string[]] => [
      name,
      [],
    ]),
  );
  for (const diagnostic of pluginDiagnostics(stdout)) {
    if (typeof diagnostic.filename !== "string") {
      throw new Error("deno lint returned a diagnostic without a filename");
    }
    const path = diagnostic.filename.startsWith("file:")
      ? fromFileUrl(diagnostic.filename)
      : diagnostic.filename;
    const name = relative(sourceRoot, path).replaceAll("\\", "/");
    const codes = found.get(name);
    if (!codes) throw new Error(`unexpected example diagnostic file: ${name}`);
    codes.push(diagnostic.code);
  }
  return Object.fromEntries(
    [...found].map(([name, codes]) => [name, codes.toSorted()]),
  );
};

Deno.test({
  name: "Deno floor: runPlugin survives unavailable source text",
  ignore: Deno.version.deno !== "2.2.0",
  fn() {
    assertEquals(
      Deno.lint.runPlugin(
        lightFpPlugin,
        "/repo/src/domain/floor.ts",
        "let n = 0;",
      ).map((diagnostic) => diagnostic.id),
      ["light-fp/pure-module"],
    );
  },
});

Deno.test("Deno floor: the real CLI loads every rule and honors comments", async () => {
  const directory = await Deno.makeTempDir({ prefix: "light fp floor " });
  try {
    const plugin = new URL("../src/mod.ts", import.meta.url).href;
    await Deno.writeTextFile(
      join(directory, "deno.json"),
      JSON.stringify({ lint: { plugins: [plugin] } }),
    );
    const domain = join(directory, "domain.ts");
    await Deno.writeTextFile(
      domain,
      await Deno.readTextFile(
        new URL("../hooks/activation_probe.ts", import.meta.url),
      ),
    );

    const output = await runLint(directory, domain);
    assertEquals(output.code, 1, decoder.decode(output.stderr));
    assertEquals(
      pluginCodes(output.stdout),
      Object.keys(lightFpPlugin.rules).map((rule) => `light-fp/${rule}`)
        .toSorted(),
    );

    const adapter = join(directory, "adapter.ts");
    await Deno.writeTextFile(
      adapter,
      [
        "// @light-fp adapter",
        "const shared = 0;",
        "export class Service {}",
        "export const fail = (): never => { throw new Error(String(shared)); };",
      ].join("\n"),
    );
    const adapterOutput = await runLint(directory, adapter);
    assertEquals(adapterOutput.code, 0, decoder.decode(adapterOutput.stderr));
    assertEquals(pluginCodes(adapterOutput.stdout), []);

    const edgeCases = join(directory, "edge_cases.ts");
    await Deno.writeTextFile(
      edgeCases,
      [
        'import type { Missing } from "./infra.ts?worker";',
        "export const cache = new Map<string, string>();",
        "export type Port = { readonly load: (input: { id: string }) => { value: Missing } };",
        "export const discard = (ready: boolean): number => {",
        "  ready && accept();",
        "  ready ? accept() : reject();",
        "  new Box();",
        "  return 1;",
        "};",
      ].join("\n"),
    );
    const edgeOutput = await runLint(directory, edgeCases);
    assertEquals(pluginCodes(edgeOutput.stdout), [
      "light-fp/layer-boundary",
      "light-fp/no-discarded-values",
      "light-fp/no-discarded-values",
      "light-fp/no-discarded-values",
      "light-fp/pure-module",
    ]);
  } finally {
    await Deno.remove(directory, { recursive: true });
  }
});

Deno.test("Deno floor: the real CLI matches the exact example corpus", async () => {
  const examplesRoot = fromFileUrl(new URL("../examples", import.meta.url));
  const output = await runLint(examplesRoot, "src");

  assertEquals(output.code, 1, decoder.decode(output.stderr));
  assertEquals(
    exampleDiagnostics(output.stdout, join(examplesRoot, "src")),
    expectedExampleDiagnostics,
  );
});
