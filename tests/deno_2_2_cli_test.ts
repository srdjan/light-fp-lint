// @light-fp adapter -- this compatibility test drives the real Deno CLI.
import { assertEquals } from "@std/assert";
import { join } from "@std/path";
import lightFpPlugin from "../src/mod.ts";

const decoder = new TextDecoder();

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const pluginCodes = (stdout: Uint8Array): readonly string[] => {
  const parsed: unknown = JSON.parse(decoder.decode(stdout));
  if (!isRecord(parsed) || !Array.isArray(parsed.diagnostics)) {
    throw new Error("deno lint returned an invalid JSON envelope");
  }
  return parsed.diagnostics.flatMap((diagnostic) =>
    isRecord(diagnostic) && typeof diagnostic.code === "string" &&
      diagnostic.code.startsWith("light-fp/")
      ? [diagnostic.code]
      : []
  ).toSorted();
};

const runLint = (directory: string, file: string) =>
  new Deno.Command(Deno.execPath(), {
    args: ["lint", "--json", `--config=${join(directory, "deno.json")}`, file],
    cwd: directory,
    stdin: "null",
    stdout: "piped",
    stderr: "piped",
  }).output();

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
