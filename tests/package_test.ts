import { assertEquals } from "@std/assert";
import { fromFileUrl, join } from "@std/path";

const root = fromFileUrl(new URL("..", import.meta.url));
const releaseVersion = "0.6.0";

type PackageConfig = Readonly<{
  name: string;
  version: string;
  exports: Readonly<Record<string, string>>;
  publish: Readonly<{ include: readonly string[] }>;
  lint: Readonly<{
    exclude: readonly string[];
    plugins: readonly string[];
  }>;
}>;

const readPackage = async (): Promise<PackageConfig> =>
  JSON.parse(await Deno.readTextFile(join(root, "deno.json")));

Deno.test("package: deno.json is the single package authority", async () => {
  const config = await readPackage();

  assertEquals(config.name, "@srdjan/light-fp-lint");
  assertEquals(config.version, releaseVersion);
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
  assertEquals(config.lint.plugins, ["./src/mod.ts"]);
  assertEquals(config.lint.exclude.includes("hooks/activation_probe.ts"), true);

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
  const config = await readPackage();
  const manifestPath = join(root, ".codex-plugin", "plugin.json");
  const manifest = JSON.parse(await Deno.readTextFile(manifestPath));
  assertEquals(manifest.name, "light-fp");
  assertEquals(manifest.version, config.version);
  assertEquals(manifest.skills, "./skills/");
  assertEquals(manifest.hooks, "./hooks/hooks.json");
  assertEquals(Object.hasOwn(manifest, "mcpServers"), false);
  assertEquals(Object.hasOwn(manifest, "mcp_servers"), false);

  for (const path of ["skills/light-fp/SKILL.md", "hooks/hooks.json"]) {
    assertEquals((await Deno.stat(join(root, path))).isFile, true, path);
  }
  const skill = await Deno.readTextFile(join(root, "skills/light-fp/SKILL.md"));
  assertEquals(skill.startsWith("---\nname: light-fp\n"), true);
  assertEquals(skill.includes(config.name), true);
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

Deno.test("package: README install commands name this release", async () => {
  const config = await readPackage();
  const readme = await Deno.readTextFile(join(root, "README.md"));
  assertEquals(
    readme.includes(`jsr:${config.name}@^${config.version}`),
    true,
  );
  assertEquals(
    readme.includes(`jsr:${config.name}@${config.version}/hook install`),
    true,
  );

  const registryPlugin = `jsr:${config.name}@^${config.version}`;
  const repositoryDevelopment = "### Repository development";
  const localPlugin = '"plugins": ["./src/mod.ts"]';
  assertEquals(
    readme.indexOf(registryPlugin) < readme.indexOf(repositoryDevelopment),
    true,
  );
  assertEquals(
    readme.indexOf(repositoryDevelopment) < readme.indexOf(localPlugin),
    true,
  );

  const lowerReadme = readme.toLowerCase();
  for (
    const staleClaim of [
      "publication status:",
      "not yet published",
      "after the first publish",
      "until then",
      "do not resolve",
      "delete this note",
      "after the first jsr publish",
    ]
  ) {
    assertEquals(lowerReadme.includes(staleClaim), false, staleClaim);
  }
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
