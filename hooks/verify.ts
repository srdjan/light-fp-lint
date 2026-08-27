// @light-fp adapter -- hook protocol, filesystem, and subprocess effects live here.
import { dirname, isAbsolute, join } from "node:path";
import { fileURLToPath } from "node:url";

export type StopInput = Readonly<{
  cwd: string;
  stopHookActive: boolean;
}>;

export type ParsedStopInput =
  | Readonly<{ _tag: "ValidInput"; input: StopInput }>
  | Readonly<{ _tag: "InvalidInput" }>;

export type FileKind = "File" | "Missing" | "Failure";

export type LintResult =
  | Readonly<{ _tag: "LintFinished"; code: number }>
  | Readonly<{ _tag: "LintProcessFailure" }>;

export type PluginDetection =
  | Readonly<{ _tag: "Active" }>
  | Readonly<{ _tag: "Inactive" }>
  | Readonly<{ _tag: "DetectionFailure" }>;

export type VerifyCapabilities = Readonly<{
  fileKind: (path: string) => Promise<FileKind>;
  detectLightFp: (
    cwd: string,
    configPath: string,
  ) => Promise<PluginDetection>;
  runLint: (cwd: string) => Promise<LintResult>;
}>;

export type StopResponse =
  | Readonly<Record<string, never>>
  | Readonly<{ decision: "block"; reason: string }>
  | Readonly<{ continue: false; stopReason: string }>;

type ConfigDiscovery =
  | Readonly<{ _tag: "NoConfig" }>
  | Readonly<{ _tag: "Config"; directory: string; path: string }>
  | Readonly<{ _tag: "DiscoveryFailure" }>;

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export const parseStopInput = (raw: string): ParsedStopInput => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { _tag: "InvalidInput" };
  }
  if (
    !isRecord(parsed) || parsed.hook_event_name !== "Stop" ||
    typeof parsed.cwd !== "string" || parsed.cwd.length === 0 ||
    !isAbsolute(parsed.cwd) || typeof parsed.stop_hook_active !== "boolean"
  ) {
    return { _tag: "InvalidInput" };
  }
  return {
    _tag: "ValidInput",
    input: {
      cwd: parsed.cwd,
      stopHookActive: parsed.stop_hook_active,
    },
  };
};

const discoverConfig = async (
  cwd: string,
  capabilities: VerifyCapabilities,
): Promise<ConfigDiscovery> => {
  let directory = cwd;
  while (true) {
    for (const name of ["deno.json", "deno.jsonc"] as const) {
      const path = join(directory, name);
      const kind = await capabilities.fileKind(path);
      if (kind === "Failure") return { _tag: "DiscoveryFailure" };
      if (kind === "File") {
        return { _tag: "Config", directory, path };
      }
    }
    const parent = dirname(directory);
    if (parent === directory) return { _tag: "NoConfig" };
    directory = parent;
  }
};

const lintFailure = (stopHookActive: boolean): StopResponse =>
  stopHookActive
    ? {
      continue: false,
      stopReason:
        "Light FP validation still fails after one correction attempt. Run deno lint and fix the design before continuing.",
    }
    : {
      decision: "block",
      reason:
        "Light FP validation failed. Run deno lint, inspect the local diagnostics, and fix the design.",
    };

const lintProcessFailure = (): StopResponse => ({
  continue: false,
  stopReason:
    "Light FP validation could not start deno lint. Check that deno is available on PATH and allowed by the hook configuration.",
});

export const verifyStop = async (
  raw: string,
  capabilities: VerifyCapabilities,
): Promise<StopResponse> => {
  const parsed = parseStopInput(raw);
  if (parsed._tag === "InvalidInput") {
    return {
      continue: false,
      stopReason: "Light FP validation received invalid Stop hook input.",
    };
  }

  const config = await discoverConfig(parsed.input.cwd, capabilities);
  if (config._tag === "NoConfig") return {};
  if (config._tag === "DiscoveryFailure") {
    return {
      continue: false,
      stopReason:
        "Light FP validation could not inspect the Deno configuration.",
    };
  }
  let detection: PluginDetection;
  try {
    detection = await capabilities.detectLightFp(
      config.directory,
      config.path,
    );
  } catch {
    detection = { _tag: "DetectionFailure" };
  }
  switch (detection._tag) {
    case "Inactive":
      return {};
    case "DetectionFailure":
      return {
        continue: false,
        stopReason:
          "Light FP validation could not inspect the effective Deno lint configuration.",
      };
    case "Active":
      break;
  }

  let lint: LintResult;
  try {
    lint = await capabilities.runLint(config.directory);
  } catch {
    lint = { _tag: "LintProcessFailure" };
  }
  switch (lint._tag) {
    case "LintFinished":
      return lint.code === 0 ? {} : lintFailure(parsed.input.stopHookActive);
    case "LintProcessFailure":
      return lintProcessFailure();
  }
};

const activationProbe = fileURLToPath(
  new URL("./activation_probe.ts", import.meta.url),
);

const bundledConfigs: readonly string[] = [
  fileURLToPath(new URL("../deno.json", import.meta.url)),
  fileURLToPath(new URL("../deno.jsonc", import.meta.url)),
];

type LintJson = Readonly<{
  diagnostics: readonly unknown[];
  errors: readonly unknown[];
}>;

const parseLintJson = (source: string): LintJson | undefined => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(source);
  } catch {
    return undefined;
  }
  if (
    !isRecord(parsed) || !Array.isArray(parsed.diagnostics) ||
    !Array.isArray(parsed.errors)
  ) return undefined;
  return { diagnostics: parsed.diagnostics, errors: parsed.errors };
};

const diagnosticCode = (diagnostic: unknown): string | undefined =>
  isRecord(diagnostic) && typeof diagnostic.code === "string"
    ? diagnostic.code
    : undefined;

export const productionCapabilities: VerifyCapabilities = {
  fileKind: async (path) => {
    try {
      return (await Deno.stat(path)).isFile ? "File" : "Missing";
    } catch (error: unknown) {
      return error instanceof Deno.errors.NotFound ? "Missing" : "Failure";
    }
  },
  detectLightFp: async (cwd, configPath) => {
    // This checkout excludes the deliberately invalid probe from normal lint.
    // Its package test pins the local plugin configuration, so activation is
    // known without asking Deno to lint an excluded target.
    if (bundledConfigs.includes(configPath)) return { _tag: "Active" };
    try {
      const output = await new Deno.Command("deno", {
        args: [
          "lint",
          "--json",
          `--config=${configPath}`,
          activationProbe,
        ],
        cwd,
        stdin: "null",
        stdout: "piped",
        stderr: "piped",
      }).output();
      const result = parseLintJson(new TextDecoder().decode(output.stdout));
      if (!result || result.errors.length > 0) {
        return { _tag: "DetectionFailure" };
      }
      if (
        result.diagnostics.some((diagnostic) =>
          diagnosticCode(diagnostic)?.startsWith("light-fp/") === true
        )
      ) return { _tag: "Active" };
      return { _tag: "Inactive" };
    } catch {
      return { _tag: "DetectionFailure" };
    }
  },
  runLint: async (cwd) => {
    try {
      const output = await new Deno.Command("deno", {
        args: ["lint"],
        cwd,
        stdin: "null",
        stdout: "piped",
        stderr: "piped",
      }).output();
      return { _tag: "LintFinished", code: output.code };
    } catch {
      return { _tag: "LintProcessFailure" };
    }
  },
};

if (import.meta.main) {
  const raw = await new Response(Deno.stdin.readable).text();
  const response = await verifyStop(raw, productionCapabilities);
  await Deno.stdout.write(new TextEncoder().encode(JSON.stringify(response)));
}
