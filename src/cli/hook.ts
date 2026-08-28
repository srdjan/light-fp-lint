// @light-fp adapter -- Git and terminal effects stay behind injected capabilities.
import {
  decideHookAction,
  type HookCommand,
  type HookConfigEntry,
  type HookDecision,
  hookState,
  lightFpHook,
  parseGitVersion,
  parseHookCommand,
} from "../git_hook.ts";

export type GitResult = Readonly<{
  code: number;
  stdout: string;
  stderr: string;
}>;

export type RunGit = (args: readonly string[]) => Promise<GitResult>;

export type CliResult = Readonly<{
  exitCode: 0 | 1 | 2 | 3 | 4;
  message: string;
}>;

type ConfigEntry = Readonly<{
  key: string;
  value: string;
  scope?: string;
}>;

type ConfigEntries =
  | Readonly<{ _tag: "Entries"; entries: readonly ConfigEntry[] }>
  | Readonly<{ _tag: "Failure" }>;

const usage = "Usage: light-fp hook <install|status|uninstall|help>";
const namespacePattern = "^hook\\.light-fp\\.";

const lines = (output: string): readonly string[] => {
  const normalized = output.replace(/\r\n/g, "\n");
  const withoutFinalNewline = normalized.endsWith("\n")
    ? normalized.slice(0, -1)
    : normalized;
  return withoutFinalNewline.length === 0
    ? []
    : withoutFinalNewline.split("\n");
};

const namedValue = (raw: string): ConfigEntry | undefined => {
  const separator = raw.indexOf("\n");
  if (separator <= 0) return undefined;
  return { key: raw.slice(0, separator), value: raw.slice(separator + 1) };
};

// Structural, order-independent equality over a config namespace. The two reads
// (--local and --show-scope filtered to local) enumerate the same entries, but
// nothing guarantees git returns them in the same order twice, and a serialized
// string comparison would false-positive the consistency check on a reorder.
const sameConfig = (
  left: readonly ConfigEntry[],
  right: readonly ConfigEntry[],
): boolean => {
  const configKey = (entry: ConfigEntry): string =>
    `${entry.key}\u0000${entry.value}`;
  const a = left.map(configKey).toSorted();
  const b = right.map(configKey).toSorted();
  return a.length === b.length &&
    a.every((key, index) => key === b[index]);
};

const parseLocalEntries = (raw: string): ConfigEntries => {
  if (!raw.endsWith("\0")) return { _tag: "Failure" };
  const entries: ConfigEntry[] = [];
  for (const item of raw.slice(0, -1).split("\0")) {
    const entry = namedValue(item);
    if (entry === undefined) return { _tag: "Failure" };
    entries.push(entry);
  }
  return { _tag: "Entries", entries };
};

const parseScopedEntries = (raw: string): ConfigEntries => {
  if (!raw.endsWith("\0")) return { _tag: "Failure" };
  const fields = raw.slice(0, -1).split("\0");
  if (fields.length % 2 !== 0) return { _tag: "Failure" };
  const entries: ConfigEntry[] = [];
  for (let index = 0; index < fields.length; index += 2) {
    const entry = namedValue(fields[index + 1]);
    if (entry === undefined || fields[index].length === 0) {
      return { _tag: "Failure" };
    }
    entries.push({ ...entry, scope: fields[index] });
  }
  return { _tag: "Entries", entries };
};

const readNamespace = async (
  runGit: RunGit,
  scoped: boolean,
): Promise<ConfigEntries> => {
  const args = scoped
    ? [
      "config",
      "--show-scope",
      "--null",
      "--get-regexp",
      namespacePattern,
    ]
    : [
      "config",
      "--local",
      "--null",
      "--get-regexp",
      namespacePattern,
    ];
  const result = await runGit(args);
  if (result.code === 1 && result.stdout.length === 0) {
    return { _tag: "Entries", entries: [] };
  }
  if (result.code !== 0) return { _tag: "Failure" };
  return scoped
    ? parseScopedEntries(result.stdout)
    : parseLocalEntries(result.stdout);
};

const unsupported = (): CliResult => ({
  exitCode: 3,
  message:
    "unsupported Git: automatic hook management requires Git 2.55 or newer; add deno lint to your existing hook system manually",
});

const conflict = (
  decision: Extract<HookDecision, { readonly _tag: "RefuseConflict" }>,
): CliResult => {
  const localRemoval =
    `git config remove-section --local hook.${lightFpHook.name}`;
  const observed = `command: ${
    decision.observedCommand === null
      ? "missing"
      : JSON.stringify(decision.observedCommand)
  }; events: ${JSON.stringify(decision.observedEvents)}`;
  return {
    exitCode: 4,
    message: decision.ownership === "Local"
      ? `conflict: hook.${lightFpHook.name} is configured differently (${observed}); refusing to modify it; remove the local section with: ${localRemoval}`
      : `conflict: hook.${lightFpHook.name} has non-local configuration (${observed}); refusing to modify it; inspect its effective scope before removal; ${localRemoval} removes only a local section and does not remove non-local entries`,
  };
};

const incompleteInstall = (): CliResult => ({
  exitCode: 4,
  message: `incomplete installation: hook.${lightFpHook.name} has command ${
    JSON.stringify(lightFpHook.command)
  } but events []; run light-fp hook install to repair it, or remove it with: git config remove-section --local hook.${lightFpHook.name}`,
});

const installedButInactive = (
  decision: Extract<HookDecision, {
    readonly _tag: "InstalledButInactive";
  }>,
): CliResult => ({
  exitCode: 0,
  message:
    `installed but inactive: Git ${decision.version.major}.${decision.version.minor}.${decision.version.patch} is older than ${lightFpHook.minimumGitVersion.major}.${lightFpHook.minimumGitVersion.minor}`,
});

const noChangeResult = (
  decision: Extract<HookDecision, { readonly _tag: "NoChange" }>,
): CliResult => {
  switch (decision.command) {
    case "Install":
      return { exitCode: 0, message: "already installed" };
    case "Status":
      return decision.state === "Installed"
        ? { exitCode: 0, message: "installed" }
        : { exitCode: 0, message: "not installed" };
    case "Uninstall":
      return { exitCode: 0, message: "not installed" };
    case "Help":
      return { exitCode: 0, message: usage };
  }
};

const setHookEvent = (runGit: RunGit): Promise<GitResult> =>
  runGit([
    "config",
    "set",
    "--local",
    `hook.${lightFpHook.name}.event`,
    lightFpHook.event,
  ]);

const applyDecision = async (
  decision: HookDecision,
  runGit: RunGit,
): Promise<CliResult> => {
  switch (decision._tag) {
    case "Write": {
      const command = await runGit([
        "config",
        "set",
        "--local",
        `hook.${lightFpHook.name}.command`,
        lightFpHook.command,
      ]);
      if (command.code !== 0) {
        return { exitCode: 1, message: "failed to write hook command" };
      }
      const event = await setHookEvent(runGit);
      if (event.code !== 0) {
        await runGit([
          "config",
          "unset",
          "--local",
          "--fixed-value",
          `--value=${lightFpHook.command}`,
          `hook.${lightFpHook.name}.command`,
        ]);
        return { exitCode: 1, message: "failed to write hook event" };
      }
      return { exitCode: 0, message: "installed" };
    }
    case "Repair": {
      const event = await setHookEvent(runGit);
      return event.code === 0
        ? { exitCode: 0, message: "installed" }
        : { exitCode: 1, message: "failed to write hook event" };
    }
    case "Remove": {
      const removed = await runGit([
        "config",
        "remove-section",
        "--local",
        `hook.${lightFpHook.name}`,
      ]);
      return removed.code === 0
        ? { exitCode: 0, message: "removed" }
        : { exitCode: 1, message: "failed to remove hook configuration" };
    }
    case "NoChange":
      return noChangeResult(decision);
    case "InstalledButInactive":
      return installedButInactive(decision);
    case "IncompleteInstall":
      return incompleteInstall();
    case "UnsupportedGit":
      return unsupported();
    case "RefuseConflict":
      return conflict(decision);
  }
};

const needsSupportedGit = (command: HookCommand): boolean =>
  command._tag === "Install" || command._tag === "Uninstall";

export const runHookCli = async (
  args: readonly string[],
  runGit: RunGit,
): Promise<CliResult> => {
  const command = parseHookCommand(args);
  if (command === undefined) return { exitCode: 2, message: usage };
  if (command._tag === "Help") return { exitCode: 0, message: usage };

  const repository = await runGit(["rev-parse", "--show-toplevel"]);
  if (repository.code !== 0 || lines(repository.stdout).length !== 1) {
    return { exitCode: 1, message: "not inside a Git repository" };
  }

  const rawVersion = await runGit(["--version"]);
  if (rawVersion.code !== 0) {
    return { exitCode: 1, message: "failed to read Git version" };
  }
  const versionLines = lines(rawVersion.stdout);
  if (versionLines.length !== 1) {
    return { exitCode: 1, message: "failed to parse Git version" };
  }
  const version = parseGitVersion(versionLines[0]);
  if (version._tag === "InvalidGitVersion") {
    return { exitCode: 1, message: "failed to parse Git version" };
  }

  if (needsSupportedGit(command)) {
    const versionDecision = decideHookAction(command, version, {
      _tag: "Absent",
    });
    if (versionDecision._tag === "UnsupportedGit") return unsupported();
  }

  const [local, effective] = await Promise.all([
    readNamespace(runGit, false),
    readNamespace(runGit, true),
  ]);
  if (local._tag === "Failure" || effective._tag === "Failure") {
    return { exitCode: 1, message: "failed to read hook configuration" };
  }

  const localFromEffective = effective.entries.filter((entry) =>
    entry.scope === "local"
  );
  if (!sameConfig(localFromEffective, local.entries)) {
    return { exitCode: 1, message: "inconsistent Git configuration response" };
  }
  const state = hookState(effective.entries as readonly HookConfigEntry[]);
  return await applyDecision(decideHookAction(command, version, state), runGit);
};

export const runGitProcess: RunGit = async (args) => {
  const output = await new Deno.Command("git", {
    args: [...args],
    stdin: "null",
    stdout: "piped",
    stderr: "piped",
  }).output();
  const decoder = new TextDecoder();
  return {
    code: output.code,
    stdout: decoder.decode(output.stdout),
    stderr: decoder.decode(output.stderr),
  };
};

const writeTerminal = async (result: CliResult): Promise<void> => {
  const bytes = new TextEncoder().encode(`${result.message}\n`);
  const destination = result.exitCode === 0 ? Deno.stdout : Deno.stderr;
  await destination.write(bytes);
};

if (import.meta.main) {
  const result = await runHookCli(Deno.args, runGitProcess).catch(
    (): CliResult => ({ exitCode: 1, message: "failed to run Git" }),
  );
  await writeTerminal(result);
  Deno.exit(result.exitCode);
}
