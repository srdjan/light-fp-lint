import { assertEquals } from "@std/assert";
import { fromFileUrl, join } from "@std/path";

const root = fromFileUrl(new URL("..", import.meta.url));

type PackageConfig = Readonly<{
  name: string;
  version: string;
  exports: Readonly<Record<string, string>>;
  publish: Readonly<{ include: readonly string[] }>;
}>;

const readPackage = async (): Promise<PackageConfig> =>
  JSON.parse(await Deno.readTextFile(join(root, "deno.json")));

Deno.test("package: deno.json is the single package authority", async () => {
  const config = await readPackage();

  assertEquals(config.name, "@light-fp/deno-lint-plugin");
  assertEquals(config.version, "0.5.0");
  assertEquals(config.exports, {
    ".": "./src/mod.ts",
    "./hook": "./src/cli/hook.ts",
  });
  assertEquals(config.publish.include, [
    "src",
    "README.md",
    "LICENSE",
    "deno.json",
  ]);

  const jsrConfig = await Deno.stat(join(root, "jsr.json")).then(
    () => "Present" as const,
    (error: unknown) =>
      error instanceof Deno.errors.NotFound
        ? "Absent" as const
        : Promise.reject(error),
  );
  assertEquals(jsrConfig, "Absent");
});

Deno.test("package: repository-only paths stay outside the publish set", async () => {
  const included = new Set((await readPackage()).publish.include);

  for (
    const repositoryOnly of [
      ".codex-plugin",
      ".agents",
      "skills",
      "hooks",
      "tests",
      ".github",
    ]
  ) {
    assertEquals(included.has(repositoryOnly), false, repositoryOnly);
  }
});

Deno.test("package: Codex plugin manifest references the root bundle", async () => {
  const manifestPath = join(root, ".codex-plugin", "plugin.json");
  const manifest = JSON.parse(await Deno.readTextFile(manifestPath));
  assertEquals(manifest.name, "light-fp");
  assertEquals(manifest.version, "0.5.0");
  assertEquals(manifest.skills, "./skills/");
  assertEquals(manifest.hooks, "./hooks/hooks.json");
  assertEquals(Object.hasOwn(manifest, "mcpServers"), false);
  assertEquals(Object.hasOwn(manifest, "mcp_servers"), false);

  for (const path of ["skills/light-fp/SKILL.md", "hooks/hooks.json"]) {
    assertEquals((await Deno.stat(join(root, path))).isFile, true, path);
  }
  const skill = await Deno.readTextFile(join(root, "skills/light-fp/SKILL.md"));
  assertEquals(skill.startsWith("---\nname: light-fp\n"), true);
  assertEquals(skill.includes("@light-fp/deno-lint-plugin"), true);
  assertEquals(skill.includes("Do not use for repositories"), true);

  const hooks = JSON.parse(
    await Deno.readTextFile(join(root, "hooks/hooks.json")),
  );
  const stop = hooks.hooks.Stop[0].hooks[0];
  assertEquals(stop.type, "command");
  assertEquals(
    stop.command,
    'deno run --quiet --allow-read --allow-run=deno "${PLUGIN_ROOT}/hooks/verify.ts"',
  );
  assertEquals(
    stop.commandWindows,
    'deno run --quiet --allow-read --allow-run=deno "%PLUGIN_ROOT%/hooks/verify.ts"',
  );
});

Deno.test("package: local marketplace installs this checkout", async () => {
  const marketplace = JSON.parse(
    await Deno.readTextFile(join(root, ".agents/plugins/marketplace.json")),
  );
  assertEquals(marketplace.name, "light-fp-local");
  assertEquals(marketplace.plugins, [{
    name: "light-fp",
    source: { source: "local", path: "./" },
    policy: { installation: "AVAILABLE", authentication: "ON_INSTALL" },
    category: "Productivity",
  }]);
});
