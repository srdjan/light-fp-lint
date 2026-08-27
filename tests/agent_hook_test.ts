import { assertEquals, assertStringIncludes } from "@std/assert";
import { delimiter } from "node:path";
import { fromFileUrl, join } from "@std/path";
import {
  configUsesLightFp,
  type LintResult,
  parseStopInput,
  type VerifyCapabilities,
  verifyStop,
} from "../hooks/verify.ts";

const root = fromFileUrl(new URL("..", import.meta.url));
const verifyScript = join(root, "hooks", "verify.ts");
const decoder = new TextDecoder();

const stopInput = (cwd: string, active = false): string =>
  JSON.stringify({
    cwd,
    hook_event_name: "Stop",
    stop_hook_active: active,
  });

const fakeCapabilities = (
  files: Readonly<Record<string, string>>,
  lint: LintResult = { _tag: "LintFinished", code: 0 },
): Readonly<{
  capabilities: VerifyCapabilities;
  lintDirectories: string[];
}> => {
  const lintDirectories: string[] = [];
  return {
    lintDirectories,
    capabilities: {
      fileKind: (path) =>
        Promise.resolve(Object.hasOwn(files, path) ? "File" : "Missing"),
      readTextFile: (path) => Promise.resolve(files[path]),
      runLint: (cwd) => {
        lintDirectories.push(cwd);
        return Promise.resolve(lint);
      },
    },
  };
};

const writeLocalPluginFixture = async (
  directory: string,
  domainSource: string,
): Promise<void> => {
  const src = join(directory, "src");
  await Deno.mkdir(src);
  await Deno.writeTextFile(
    join(directory, "deno.json"),
    '{"name":"@light-fp/deno-lint-plugin","lint":{"plugins":["./src/mod.ts"]}}',
  );
  await Deno.writeTextFile(
    join(src, "mod.ts"),
    'const plugin: Deno.lint.Plugin = { name: "fixture", rules: {} };\nexport default plugin;\n',
  );
  await Deno.writeTextFile(join(directory, "domain.ts"), domainSource);
};

const runVerifyScript = async (
  directory: string,
  options: Readonly<{
    cwd?: string;
    env?: Readonly<Record<string, string>>;
  }> = {},
) => {
  const child = new Deno.Command(Deno.execPath(), {
    args: [
      "run",
      "--quiet",
      "--allow-read",
      "--allow-run=deno",
      verifyScript,
    ],
    cwd: options.cwd,
    env: options.env,
    stdin: "piped",
    stdout: "piped",
    stderr: "piped",
  }).spawn();
  const writer = child.stdin.getWriter();
  await writer.write(new TextEncoder().encode(stopInput(directory)));
  await writer.close();
  return await child.output();
};

Deno.test("agent hook: validates the complete Stop input boundary", () => {
  assertEquals(parseStopInput(stopInput("/repo"))._tag, "ValidInput");
  for (
    const malformed of [
      "not json",
      "{}",
      JSON.stringify({
        cwd: "relative",
        hook_event_name: "Stop",
        stop_hook_active: false,
      }),
      JSON.stringify({
        cwd: "/repo",
        hook_event_name: "Other",
        stop_hook_active: false,
      }),
      JSON.stringify({
        cwd: "/repo",
        hook_event_name: "Stop",
        stop_hook_active: "false",
      }),
    ]
  ) {
    assertEquals(parseStopInput(malformed)._tag, "InvalidInput", malformed);
  }
});

Deno.test("agent hook: malformed selected input fails closed without running lint", async () => {
  const fake = fakeCapabilities({});
  const response = await verifyStop("not json", fake.capabilities);
  assertEquals(response, {
    continue: false,
    stopReason: "Light FP validation received invalid Stop hook input.",
  });
  assertEquals(fake.lintDirectories, []);
});

Deno.test("agent hook: no config and unrelated config are no-ops", async () => {
  const noConfig = fakeCapabilities({});
  assertEquals(
    await verifyStop(stopInput("/work/repo"), noConfig.capabilities),
    {},
  );

  const unrelated = fakeCapabilities({
    "/work/repo/deno.json": JSON.stringify({ lint: { plugins: ["other"] } }),
  });
  assertEquals(
    await verifyStop(stopInput("/work/repo"), unrelated.capabilities),
    {},
  );
  assertEquals(noConfig.lintDirectories, []);
  assertEquals(unrelated.lintDirectories, []);
});

Deno.test("agent hook: recognizes local and versioned Light FP config", () => {
  assertEquals(
    configUsesLightFp(`{
      // Local development config.
      "name": "@light-fp/deno-lint-plugin",
      "lint": { "plugins": ["./src/mod.ts",], },
    }`),
    true,
  );
  assertEquals(
    configUsesLightFp(JSON.stringify({
      lint: { plugins: ["jsr:@light-fp/deno-lint-plugin@^0.5.0"] },
    })),
    true,
  );
  assertEquals(configUsesLightFp("not json"), false);
  assertEquals(
    configUsesLightFp('{"lint":{"plugins":["./src/mod.ts"]}}'),
    false,
  );
  assertEquals(
    configUsesLightFp(
      '{"lint":{"plugins":["prefix@light-fp/deno-lint-plugin"]}}',
    ),
    false,
  );
});

Deno.test("agent hook: nearest configured parent runs lint from its directory", async () => {
  const fake = fakeCapabilities({
    "/work/repo/deno.jsonc": `{
      "name": "@light-fp/deno-lint-plugin",
      "lint": { "plugins": ["./src/mod.ts",], },
    }`,
  });
  const response = await verifyStop(
    stopInput("/work/repo/src/domain"),
    fake.capabilities,
  );
  assertEquals(response, {});
  assertEquals(fake.lintDirectories, ["/work/repo"]);
});

Deno.test("agent hook: first failure blocks with a redacted correction request", async () => {
  const fake = fakeCapabilities(
    {
      "/work/repo/deno.json": JSON.stringify({
        lint: { plugins: ["jsr:@light-fp/deno-lint-plugin@0.5.0"] },
      }),
    },
    { _tag: "LintFinished", code: 1 },
  );
  const response = await verifyStop(stopInput("/work/repo"), fake.capabilities);
  assertEquals("decision" in response ? response.decision : undefined, "block");
  const serialized = JSON.stringify(response);
  assertStringIncludes(serialized, "Run deno lint");
  assertEquals(serialized.includes("secret marker"), false);
  assertEquals(serialized.includes("diagnostic"), true);
});

Deno.test("agent hook: repeated failure stops instead of looping", async () => {
  const fake = fakeCapabilities(
    {
      "/work/repo/deno.json":
        '{"name":"@light-fp/deno-lint-plugin","lint":{"plugins":["./src/mod.ts"]}}',
    },
    { _tag: "LintFinished", code: 1 },
  );
  const response = await verifyStop(
    stopInput("/work/repo", true),
    fake.capabilities,
  );
  assertEquals(response, {
    continue: false,
    stopReason:
      "Light FP validation still fails after one correction attempt. Run deno lint and fix the design before continuing.",
  });
});

Deno.test("agent hook: paths with spaces and process failures stay redacted", async () => {
  const directory = "/work/project with spaces";
  const fake = fakeCapabilities(
    {
      [`${directory}/deno.json`]:
        '{"name":"@light-fp/deno-lint-plugin","lint":{"plugins":["./src/mod.ts"]}}',
    },
    { _tag: "LintProcessFailure" },
  );
  const response = await verifyStop(
    stopInput(`${directory}/src`),
    fake.capabilities,
  );
  assertEquals(response, {
    continue: false,
    stopReason:
      "Light FP validation could not start deno lint. Check that deno is available on PATH and allowed by the hook configuration.",
  });
  assertEquals(JSON.stringify(response).includes(directory), false);
  assertEquals(fake.lintDirectories, [directory]);
});

Deno.test("agent hook: rejected lint capability becomes a process failure", async () => {
  const fake = fakeCapabilities({
    "/work/repo/deno.json":
      '{"name":"@light-fp/deno-lint-plugin","lint":{"plugins":["./src/mod.ts"]}}',
  });
  const response = await verifyStop(stopInput("/work/repo"), {
    ...fake.capabilities,
    runLint: () => Promise.reject(new Error("secret process detail")),
  });
  assertEquals(response, {
    continue: false,
    stopReason:
      "Light FP validation could not start deno lint. Check that deno is available on PATH and allowed by the hook configuration.",
  });
  assertEquals(
    JSON.stringify(response).includes("secret process detail"),
    false,
  );
});

Deno.test("agent hook: invokes the PATH-resolved deno granted by its permissions", async () => {
  const directory = await Deno.makeTempDir({ prefix: "light fp deno shim " });
  try {
    const bin = join(directory, "bin");
    await Deno.mkdir(bin);
    const shim = Deno.build.os === "windows"
      ? join(bin, "deno.cmd")
      : join(bin, "deno");
    await Deno.writeTextFile(
      shim,
      Deno.build.os === "windows" ? "@exit /b 0\r\n" : "#!/bin/sh\nexit 0\n",
      { mode: 0o755 },
    );
    await writeLocalPluginFixture(directory, "export const = 1;\n");

    const output = await runVerifyScript(directory, {
      cwd: directory,
      env: { PATH: `${bin}${delimiter}${Deno.env.get("PATH") ?? ""}` },
    });
    assertEquals(output.code, 0, decoder.decode(output.stderr));
    assertEquals(decoder.decode(output.stdout), "{}");
  } finally {
    await Deno.remove(directory, { recursive: true });
  }
});

Deno.test("agent hook: missing PATH deno reports a process failure", async () => {
  const directory = await Deno.makeTempDir({
    prefix: "light fp missing deno ",
  });
  try {
    const bin = join(directory, "bin");
    await Deno.mkdir(bin);
    await writeLocalPluginFixture(directory, "export const value = 1;\n");

    const output = await runVerifyScript(directory, {
      env: { PATH: bin },
    });
    assertEquals(output.code, 0, decoder.decode(output.stderr));
    assertEquals(
      JSON.parse(decoder.decode(output.stdout)),
      {
        continue: false,
        stopReason:
          "Light FP validation could not start deno lint. Check that deno is available on PATH and allowed by the hook configuration.",
      },
    );
  } finally {
    await Deno.remove(directory, { recursive: true });
  }
});

Deno.test("agent hook: real protocol works with the registered permissions", async () => {
  const directory = await Deno.makeTempDir({ prefix: "light fp agent hook " });
  try {
    await writeLocalPluginFixture(directory, "export const value = 1;\n");

    const output = await runVerifyScript(directory);
    assertEquals(output.code, 0, decoder.decode(output.stderr));
    assertEquals(decoder.decode(output.stdout), "{}");
  } finally {
    await Deno.remove(directory, { recursive: true });
  }
});
