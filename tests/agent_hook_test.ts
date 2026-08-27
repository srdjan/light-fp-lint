import { assertEquals, assertStringIncludes } from "@std/assert";
import { delimiter } from "node:path";
import { fromFileUrl, join } from "@std/path";
import {
  type LintResult,
  parseStopInput,
  type PluginDetection,
  type VerifyCapabilities,
  verifyStop,
} from "../hooks/verify.ts";
import lightFpPlugin from "../src/mod.ts";

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
  files: readonly string[],
  lint: LintResult = { _tag: "LintFinished", code: 0 },
  detection: PluginDetection = { _tag: "Active" },
): Readonly<{
  capabilities: VerifyCapabilities;
  detectionCalls: Array<Readonly<{ cwd: string; configPath: string }>>;
  lintDirectories: string[];
}> => {
  const discovered = new Set(files);
  const detectionCalls: Array<
    Readonly<{ cwd: string; configPath: string }>
  > = [];
  const lintDirectories: string[] = [];
  return {
    detectionCalls,
    lintDirectories,
    capabilities: {
      fileKind: (path) =>
        Promise.resolve(discovered.has(path) ? "File" : "Missing"),
      detectLightFp: (cwd, configPath) => {
        detectionCalls.push({ cwd, configPath });
        return Promise.resolve(detection);
      },
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
  plugin: "Empty" | "LightFp" = "Empty",
  excludedRules: readonly string[] = [],
): Promise<void> => {
  const pluginSpecifier = plugin === "LightFp"
    ? new URL("../src/mod.ts", import.meta.url).href
    : "./src/mod.ts";
  await Deno.writeTextFile(
    join(directory, "deno.json"),
    JSON.stringify({
      lint: {
        plugins: [pluginSpecifier],
        rules: { exclude: excludedRules },
      },
    }),
  );
  if (plugin === "Empty") {
    const src = join(directory, "src");
    await Deno.mkdir(src);
    await Deno.writeTextFile(
      join(src, "mod.ts"),
      'const plugin: Deno.lint.Plugin = { name: "fixture", rules: {} };\nexport default plugin;\n',
    );
  }
  await Deno.writeTextFile(join(directory, "domain.ts"), domainSource);
};

const runVerifyScript = async (
  directory: string,
  options: Readonly<{
    active?: boolean;
    cwd?: string;
    env?: Readonly<Record<string, string>>;
    script?: string;
  }> = {},
) => {
  const child = new Deno.Command(Deno.execPath(), {
    args: [
      "run",
      "--quiet",
      "--allow-read",
      "--allow-run=deno",
      options.script ?? verifyScript,
    ],
    cwd: options.cwd,
    env: options.env,
    stdin: "piped",
    stdout: "piped",
    stderr: "piped",
  }).spawn();
  const writer = child.stdin.getWriter();
  await writer.write(
    new TextEncoder().encode(stopInput(directory, options.active ?? false)),
  );
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
  const fake = fakeCapabilities([]);
  const response = await verifyStop("not json", fake.capabilities);
  assertEquals(response, {
    continue: false,
    stopReason: "Light FP validation received invalid Stop hook input.",
  });
  assertEquals(fake.lintDirectories, []);
});

Deno.test("agent hook: no config and unrelated config are no-ops", async () => {
  const noConfig = fakeCapabilities([]);
  assertEquals(
    await verifyStop(stopInput("/work/repo"), noConfig.capabilities),
    {},
  );

  const unrelated = fakeCapabilities(
    ["/work/repo/deno.json"],
    undefined,
    { _tag: "Inactive" },
  );
  assertEquals(
    await verifyStop(stopInput("/work/repo"), unrelated.capabilities),
    {},
  );
  assertEquals(noConfig.lintDirectories, []);
  assertEquals(unrelated.lintDirectories, []);
  assertEquals(noConfig.detectionCalls, []);
  assertEquals(unrelated.detectionCalls, [
    { cwd: "/work/repo", configPath: "/work/repo/deno.json" },
  ]);
});

Deno.test("agent hook: nearest configured parent runs lint from its directory", async () => {
  const fake = fakeCapabilities(["/work/repo/deno.jsonc"]);
  const response = await verifyStop(
    stopInput("/work/repo/src/domain"),
    fake.capabilities,
  );
  assertEquals(response, {});
  assertEquals(fake.detectionCalls, [
    { cwd: "/work/repo", configPath: "/work/repo/deno.jsonc" },
  ]);
  assertEquals(fake.lintDirectories, ["/work/repo"]);
});

Deno.test("agent hook: effective configuration detection fails closed", async () => {
  const fake = fakeCapabilities(
    ["/work/repo/deno.json"],
    undefined,
    { _tag: "DetectionFailure" },
  );
  assertEquals(
    await verifyStop(stopInput("/work/repo"), fake.capabilities),
    {
      continue: false,
      stopReason:
        "Light FP validation could not inspect the effective Deno lint configuration.",
    },
  );
  assertEquals(fake.lintDirectories, []);
});

Deno.test("agent hook: rejected detection capability fails closed", async () => {
  const fake = fakeCapabilities(["/work/repo/deno.json"]);
  const response = await verifyStop(stopInput("/work/repo"), {
    ...fake.capabilities,
    detectLightFp: () => Promise.reject(new Error("secret detection detail")),
  });
  assertEquals(response, {
    continue: false,
    stopReason:
      "Light FP validation could not inspect the effective Deno lint configuration.",
  });
  assertEquals(
    JSON.stringify(response).includes("secret detection detail"),
    false,
  );
});

Deno.test("agent hook: first failure blocks with a redacted correction request", async () => {
  const fake = fakeCapabilities(
    ["/work/repo/deno.json"],
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
    ["/work/repo/deno.json"],
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
    [`${directory}/deno.json`],
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
  const fake = fakeCapabilities(["/work/repo/deno.json"]);
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
      Deno.build.os === "windows"
        ? '@echo {"version":1,"diagnostics":[],"errors":[],"checked_files":[]}\r\n@exit /b 0\r\n'
        : '#!/bin/sh\nprintf \'%s\\n\' \'{"version":1,"diagnostics":[],"errors":[],"checked_files":[]}\'\nexit 0\n',
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

Deno.test("agent hook: missing PATH deno fails activation detection", async () => {
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
          "Light FP validation could not inspect the effective Deno lint configuration.",
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

Deno.test("agent hook: this checkout stays active with its probe excluded", async () => {
  const directory = await Deno.makeTempDir({
    dir: root,
    prefix: "light-fp-own-hook-",
  });
  const sourceMarker = "OWN_BUNDLE_PROBE_MARKER_8021";
  try {
    await Deno.writeTextFile(
      join(directory, "domain.ts"),
      `export const run = () => { throw new Error("${sourceMarker}"); };\n`,
    );
    const output = await runVerifyScript(directory, { cwd: directory });
    assertEquals(output.code, 0, decoder.decode(output.stderr));
    assertEquals(decoder.decode(output.stderr), "");
    assertEquals(JSON.parse(decoder.decode(output.stdout)), {
      decision: "block",
      reason:
        "Light FP validation failed. Run deno lint, inspect the local diagnostics, and fix the design.",
    });
    assertEquals(decoder.decode(output.stdout).includes(sourceMarker), false);
  } finally {
    await Deno.remove(directory, { recursive: true });
  }
});

Deno.test("agent hook: effective workspace config activates Light FP", async () => {
  const directory = await Deno.makeTempDir({
    prefix: "light fp workspace hook ",
  });
  try {
    const member = join(directory, "member");
    await Deno.mkdir(member);
    const plugin = new URL("../src/mod.ts", import.meta.url).href;
    await Deno.writeTextFile(
      join(directory, "deno.json"),
      JSON.stringify({
        workspace: ["./member"],
        lint: { plugins: [plugin] },
      }),
    );
    await Deno.writeTextFile(
      join(member, "deno.json"),
      JSON.stringify({ name: "@fixture/member", version: "0.0.0" }),
    );
    await Deno.writeTextFile(
      join(member, "domain.ts"),
      'export const run = () => { throw new Error("workspace violation"); };\n',
    );

    const output = await runVerifyScript(member, { cwd: member });
    assertEquals(output.code, 0, decoder.decode(output.stderr));
    assertEquals(JSON.parse(decoder.decode(output.stdout)), {
      decision: "block",
      reason:
        "Light FP validation failed. Run deno lint, inspect the local diagnostics, and fix the design.",
    });
  } finally {
    await Deno.remove(directory, { recursive: true });
  }
});

Deno.test("agent hook: any enabled Light FP rule proves activation", async () => {
  const directory = await Deno.makeTempDir({
    prefix: "light fp partial rule hook ",
  });
  try {
    const consumer = join(directory, "consumer");
    const copiedHooks = join(directory, "infra", "plugin", "hooks");
    await Deno.mkdir(consumer);
    await Deno.mkdir(copiedHooks, { recursive: true });
    await Deno.copyFile(verifyScript, join(copiedHooks, "verify.ts"));
    await Deno.copyFile(
      join(root, "hooks", "activation_probe.ts"),
      join(copiedHooks, "activation_probe.ts"),
    );
    const probe = await Deno.readTextFile(
      join(root, "hooks", "activation_probe.ts"),
    );
    const rules = Object.keys(lightFpPlugin.rules).map((rule) =>
      `light-fp/${rule}`
    );
    for (const activeRule of rules) {
      await writeLocalPluginFixture(
        consumer,
        probe,
        "LightFp",
        rules.filter((rule) => rule !== activeRule),
      );
      const output = await runVerifyScript(consumer, {
        script: join(copiedHooks, "verify.ts"),
      });
      assertEquals(output.code, 0, activeRule);
      assertEquals(
        JSON.parse(decoder.decode(output.stdout)),
        {
          decision: "block",
          reason:
            "Light FP validation failed. Run deno lint, inspect the local diagnostics, and fix the design.",
        },
        activeRule,
      );
    }
  } finally {
    await Deno.remove(directory, { recursive: true });
  }
});

Deno.test("agent hook: real lint failures and retries stay fully redacted", async () => {
  const directory = await Deno.makeTempDir({
    prefix: "light fp secret path ",
  });
  const sourceMarker = "PRIVATE_SOURCE_MARKER_4179";
  try {
    await writeLocalPluginFixture(
      directory,
      `export const run = () => { throw new Error("${sourceMarker}"); };\n`,
      "LightFp",
    );

    const first = await runVerifyScript(directory);
    assertEquals(first.code, 0, decoder.decode(first.stderr));
    assertEquals(decoder.decode(first.stderr), "");
    assertEquals(JSON.parse(decoder.decode(first.stdout)), {
      decision: "block",
      reason:
        "Light FP validation failed. Run deno lint, inspect the local diagnostics, and fix the design.",
    });

    const retry = await runVerifyScript(directory, { active: true });
    assertEquals(retry.code, 0, decoder.decode(retry.stderr));
    assertEquals(decoder.decode(retry.stderr), "");
    assertEquals(JSON.parse(decoder.decode(retry.stdout)), {
      continue: false,
      stopReason:
        "Light FP validation still fails after one correction attempt. Run deno lint and fix the design before continuing.",
    });

    for (const output of [first, retry]) {
      const protocol = decoder.decode(output.stdout) +
        decoder.decode(output.stderr);
      for (
        const secret of [
          directory,
          sourceMarker,
          "light-fp/no-throw",
          "Domain code reports failure",
        ]
      ) {
        assertEquals(protocol.includes(secret), false, secret);
      }
    }
  } finally {
    await Deno.remove(directory, { recursive: true });
  }
});
