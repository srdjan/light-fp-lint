// @light-fp adapter -- hook protocol, filesystem, and subprocess effects live here.
import { dirname, isAbsolute, join } from "node:path";

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

export type VerifyCapabilities = Readonly<{
  fileKind: (path: string) => Promise<FileKind>;
  readTextFile: (path: string) => Promise<string>;
  runLint: (cwd: string) => Promise<LintResult>;
}>;

export type StopResponse =
  | Readonly<Record<string, never>>
  | Readonly<{ decision: "block"; reason: string }>
  | Readonly<{ continue: false; stopReason: string }>;

type ConfigDiscovery =
  | Readonly<{ _tag: "NoConfig" }>
  | Readonly<{ _tag: "Config"; directory: string; source: string }>
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
        try {
          return {
            _tag: "Config",
            directory,
            source: await capabilities.readTextFile(path),
          };
        } catch {
          return { _tag: "DiscoveryFailure" };
        }
      }
    }
    const parent = dirname(directory);
    if (parent === directory) return { _tag: "NoConfig" };
    directory = parent;
  }
};

const stripJsonComments = (source: string): string => {
  let result = "";
  let inString = false;
  let escaped = false;
  let lineComment = false;
  let blockComment = false;

  for (let index = 0; index < source.length; index += 1) {
    const current = source[index];
    const next = source[index + 1];
    if (lineComment) {
      if (current === "\n") {
        lineComment = false;
        result += current;
      } else {
        result += " ";
      }
      continue;
    }
    if (blockComment) {
      if (current === "*" && next === "/") {
        blockComment = false;
        result += "  ";
        index += 1;
      } else {
        result += current === "\n" ? "\n" : " ";
      }
      continue;
    }
    if (!inString && current === "/" && next === "/") {
      lineComment = true;
      result += "  ";
      index += 1;
      continue;
    }
    if (!inString && current === "/" && next === "*") {
      blockComment = true;
      result += "  ";
      index += 1;
      continue;
    }
    result += current;
    if (inString && current === "\\" && !escaped) {
      escaped = true;
      continue;
    }
    if (current === '"' && !escaped) inString = !inString;
    escaped = false;
  }
  return result;
};

const stripTrailingCommas = (source: string): string => {
  let result = "";
  let inString = false;
  let escaped = false;
  for (let index = 0; index < source.length; index += 1) {
    const current = source[index];
    if (!inString && current === ",") {
      let next = index + 1;
      while (/\s/.test(source[next] ?? "")) next += 1;
      if (source[next] === "}" || source[next] === "]") continue;
    }
    result += current;
    if (inString && current === "\\" && !escaped) {
      escaped = true;
      continue;
    }
    if (current === '"' && !escaped) inString = !inString;
    escaped = false;
  }
  return result;
};

export const configUsesLightFp = (source: string): boolean => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stripTrailingCommas(stripJsonComments(source)));
  } catch {
    return false;
  }
  if (!isRecord(parsed) || !isRecord(parsed.lint)) return false;
  const plugins = parsed.lint.plugins;
  if (!Array.isArray(plugins)) return false;
  return plugins.some((plugin) =>
    typeof plugin === "string" &&
    (plugin === "./src/mod.ts"
      ? parsed.name === "@light-fp/deno-lint-plugin"
      : /^jsr:@light-fp\/deno-lint-plugin(?:@[^/]+)?$/.test(plugin))
  );
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
  if (!configUsesLightFp(config.source)) return {};

  let lint: LintResult;
  try {
    lint = await capabilities.runLint(config.directory);
  } catch {
    lint = { _tag: "LintProcessFailure" };
  }
  return lint._tag === "LintFinished" && lint.code === 0
    ? {}
    : lintFailure(parsed.input.stopHookActive);
};

export const productionCapabilities: VerifyCapabilities = {
  fileKind: async (path) => {
    try {
      return (await Deno.stat(path)).isFile ? "File" : "Missing";
    } catch (error: unknown) {
      return error instanceof Deno.errors.NotFound ? "Missing" : "Failure";
    }
  },
  readTextFile: Deno.readTextFile,
  runLint: async (cwd) => {
    try {
      const output = await new Deno.Command(Deno.execPath(), {
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
