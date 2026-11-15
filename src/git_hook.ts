export const lightFpHook = {
  name: "light-fp",
  command: "deno lint",
  event: "pre-commit",
  minimumGitVersion: { major: 2, minor: 55, patch: 0 },
} as const;

export type HookCommand =
  | { readonly _tag: "Install" }
  | { readonly _tag: "Status" }
  | { readonly _tag: "Uninstall" }
  | { readonly _tag: "Help" };

export type GitVersion =
  | {
    readonly _tag: "GitVersion";
    readonly major: number;
    readonly minor: number;
    readonly patch: number;
  }
  | { readonly _tag: "InvalidGitVersion"; readonly observed: string };

export type HookState =
  | { readonly _tag: "Absent" }
  | { readonly _tag: "Installed" }
  | { readonly _tag: "PartialInstall" }
  | {
    readonly _tag: "Conflict";
    readonly ownership: "Local" | "NonLocal";
    readonly commandEntries: number;
    readonly eventEntries: number;
    readonly otherEntries: number;
  };

export type HookConfigEntry = {
  readonly scope: string;
  readonly key: string;
  readonly value: string;
};

export type HookDecision =
  | { readonly _tag: "Write" }
  | { readonly _tag: "Repair" }
  | { readonly _tag: "Remove" }
  | {
    readonly _tag: "NoChange";
    readonly command: HookCommand["_tag"];
    readonly state: "Absent" | "Installed";
  }
  | {
    readonly _tag: "InstalledButInactive";
    readonly version: Extract<GitVersion, { readonly _tag: "GitVersion" }>;
  }
  | { readonly _tag: "IncompleteInstall" }
  | { readonly _tag: "UnsupportedGit"; readonly version: GitVersion }
  | {
    readonly _tag: "RefuseConflict";
    readonly ownership: "Local" | "NonLocal";
    readonly commandEntries: number;
    readonly eventEntries: number;
    readonly otherEntries: number;
  };

/** One command-line argument. */
export type CliArgument = string;

/** The text that `git --version` prints. */
export type GitOutput = string;

export function parseHookCommand(
  args: readonly CliArgument[],
): HookCommand | undefined {
  if (args.length !== 1) return undefined;
  const arg = args[0];
  if (arg === "install") return { _tag: "Install" };
  if (arg === "status") return { _tag: "Status" };
  if (arg === "uninstall") return { _tag: "Uninstall" };
  if (arg === "help" || arg === "--help" || arg === "-h") {
    return { _tag: "Help" };
  }
  return undefined;
}

const DIGITS = "0123456789";
const ALPHANUMERIC =
  `${DIGITS}abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ`;
const GIT_VERSION_PREFIX = "git version ";

function isMadeOf(text: string, allowed: string): boolean {
  return [...text].every((character) => allowed.includes(character));
}

// `1.2.3`, then optionally `.build.tag` where the build part starts with a
// letter or digit, then optionally ` (vendor text)` with no CR, LF, or parenthesis.
function versionDigits(output: string): readonly string[] | undefined {
  if (!output.startsWith(GIT_VERSION_PREFIX)) return undefined;
  const text = output.slice(GIT_VERSION_PREFIX.length);
  const vendorAt = text.indexOf(" (");
  const head = vendorAt === -1 ? text : text.slice(0, vendorAt);
  if (vendorAt !== -1) {
    const vendor = text.slice(vendorAt + 2);
    const inner = vendor.slice(0, -1);
    if (!vendor.endsWith(")") || inner === "") return undefined;
    if ([..."\r\n()"].some((character) => inner.includes(character))) {
      return undefined;
    }
  }
  const segments = head.split(".");
  const numbers = segments.slice(0, 3);
  const build = segments.slice(3).join(".");
  if (numbers.length !== 3) return undefined;
  if (!numbers.every((part) => part !== "" && isMadeOf(part, DIGITS))) {
    return undefined;
  }
  if (segments.length === 3) return numbers;
  const buildStart = build.slice(0, 1);
  if (buildStart === "" || !isMadeOf(buildStart, ALPHANUMERIC)) {
    return undefined;
  }
  return isMadeOf(build, `${ALPHANUMERIC}.-`) ? numbers : undefined;
}

export function parseGitVersion(output: GitOutput): GitVersion {
  const digits = versionDigits(output);
  if (digits === undefined) {
    return { _tag: "InvalidGitVersion", observed: output };
  }

  const parts = digits.map(Number);
  const major = parts[0];
  const minor = parts[1];
  const patch = parts[2];
  if (![major, minor, patch].every(Number.isSafeInteger)) {
    return { _tag: "InvalidGitVersion", observed: output };
  }
  return { _tag: "GitVersion", major: major, minor: minor, patch: patch };
}

export function hookState(entries: readonly HookConfigEntry[]): HookState {
  if (entries.length === 0) {
    return { _tag: "Absent" };
  }

  const commandKey = `hook.${lightFpHook.name}.command`;
  const eventKey = `hook.${lightFpHook.name}.event`;
  const commands = entries.filter((entry) => entry.key === commandKey);
  const events = entries.filter((entry) => entry.key === eventKey);
  const observedCommand = commands[0]?.value;
  const observedEvents = events.map((entry) => entry.value);
  const localOnly = entries.every((entry) => entry.scope === "local");
  if (
    entries.length === 2 &&
    localOnly &&
    commands.length === 1 &&
    observedCommand === lightFpHook.command &&
    events.length === 1 &&
    observedEvents[0] === lightFpHook.event
  ) {
    return { _tag: "Installed" };
  }
  if (
    entries.length === 1 && localOnly && commands.length === 1 &&
    observedCommand === lightFpHook.command && events.length === 0
  ) {
    return { _tag: "PartialInstall" };
  }
  return {
    _tag: "Conflict",
    ownership: localOnly ? "Local" : "NonLocal",
    commandEntries: commands.length,
    eventEntries: events.length,
    otherEntries: entries.length - commands.length - events.length,
  };
}

function versionAtLeast(
  version: Extract<GitVersion, { readonly _tag: "GitVersion" }>,
): boolean {
  const actual = [version.major, version.minor, version.patch];
  const minimum = [
    lightFpHook.minimumGitVersion.major,
    lightFpHook.minimumGitVersion.minor,
    lightFpHook.minimumGitVersion.patch,
  ];
  for (const index of actual.keys()) {
    if (actual[index] > minimum[index]) return true;
    if (actual[index] < minimum[index]) return false;
  }
  return true;
}

function conflictDecision(
  state: Extract<HookState, { readonly _tag: "Conflict" }>,
): HookDecision {
  return {
    _tag: "RefuseConflict",
    ownership: state.ownership,
    commandEntries: state.commandEntries,
    eventEntries: state.eventEntries,
    otherEntries: state.otherEntries,
  };
}

function installDecision(state: HookState): HookDecision {
  if (state._tag === "Absent") return { _tag: "Write" };
  if (state._tag === "Installed") {
    return { _tag: "NoChange", command: "Install", state: "Installed" };
  }
  if (state._tag === "PartialInstall") return { _tag: "Repair" };
  return conflictDecision(state);
}

function statusDecision(state: HookState): HookDecision {
  if (state._tag === "Absent") {
    return { _tag: "NoChange", command: "Status", state: "Absent" };
  }
  if (state._tag === "Installed") {
    return { _tag: "NoChange", command: "Status", state: "Installed" };
  }
  if (state._tag === "PartialInstall") return { _tag: "IncompleteInstall" };
  return conflictDecision(state);
}

function uninstallDecision(state: HookState): HookDecision {
  if (state._tag === "Absent") {
    return { _tag: "NoChange", command: "Uninstall", state: "Absent" };
  }
  if (state._tag === "Installed" || state._tag === "PartialInstall") {
    return { _tag: "Remove" };
  }
  return state.ownership === "Local"
    ? { _tag: "Remove" }
    : conflictDecision(state);
}

export function decideHookAction(
  command: HookCommand,
  version: GitVersion,
  state: HookState,
): HookDecision {
  if (
    (command._tag === "Install" || command._tag === "Uninstall") &&
    (version._tag === "InvalidGitVersion" || !versionAtLeast(version))
  ) {
    return { _tag: "UnsupportedGit", version: version };
  }
  if (
    command._tag === "Status" && state._tag === "Installed" &&
    version._tag === "GitVersion" && !versionAtLeast(version)
  ) {
    return { _tag: "InstalledButInactive", version: version };
  }

  if (command._tag === "Install") return installDecision(state);
  if (command._tag === "Status") return statusDecision(state);
  if (command._tag === "Uninstall") return uninstallDecision(state);
  return {
    _tag: "NoChange",
    command: "Help",
    state: state._tag === "Installed" ? "Installed" : "Absent",
  };
}
