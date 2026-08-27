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
    readonly observedCommand: string | null;
    readonly observedEvents: readonly string[];
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
    readonly observedCommand: string | null;
    readonly observedEvents: readonly string[];
  };

export const parseHookCommand = (
  args: readonly string[],
): HookCommand | undefined => {
  if (args.length !== 1) return undefined;
  switch (args[0]) {
    case "install":
      return { _tag: "Install" };
    case "status":
      return { _tag: "Status" };
    case "uninstall":
      return { _tag: "Uninstall" };
    case "help":
    case "--help":
    case "-h":
      return { _tag: "Help" };
    default:
      return undefined;
  }
};

export const parseGitVersion = (output: string): GitVersion => {
  const match =
    /^git version (\d+)\.(\d+)\.(\d+)(?:\.[A-Za-z0-9][A-Za-z0-9.-]*)?(?: \([^\r\n()]+\))?$/
      .exec(output);
  if (match === null) return { _tag: "InvalidGitVersion", observed: output };

  const [major, minor, patch] = match.slice(1).map(Number);
  if (![major, minor, patch].every(Number.isSafeInteger)) {
    return { _tag: "InvalidGitVersion", observed: output };
  }
  return { _tag: "GitVersion", major, minor, patch };
};

export const hookState = (entries: readonly HookConfigEntry[]): HookState => {
  if (entries.length === 0) {
    return { _tag: "Absent" };
  }

  const commandKey = `hook.${lightFpHook.name}.command`;
  const eventKey = `hook.${lightFpHook.name}.event`;
  const commands = entries.filter((entry) => entry.key === commandKey);
  const events = entries.filter((entry) => entry.key === eventKey);
  const observedCommand = commands.length === 0
    ? undefined
    : commands.map((entry) => entry.value).join("\n");
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
    observedCommand: observedCommand ?? null,
    observedEvents: [...observedEvents],
  };
};

const versionAtLeast = (
  version: Extract<GitVersion, { readonly _tag: "GitVersion" }>,
): boolean => {
  const actual = [version.major, version.minor, version.patch];
  const minimum = [
    lightFpHook.minimumGitVersion.major,
    lightFpHook.minimumGitVersion.minor,
    lightFpHook.minimumGitVersion.patch,
  ];
  for (let index = 0; index < actual.length; index += 1) {
    if (actual[index] > minimum[index]) return true;
    if (actual[index] < minimum[index]) return false;
  }
  return true;
};

const conflictDecision = (
  state: Extract<HookState, { readonly _tag: "Conflict" }>,
): HookDecision => ({
  _tag: "RefuseConflict",
  ownership: state.ownership,
  observedCommand: state.observedCommand,
  observedEvents: state.observedEvents,
});

const installDecision = (state: HookState): HookDecision => {
  switch (state._tag) {
    case "Absent":
      return { _tag: "Write" };
    case "Installed":
      return { _tag: "NoChange", command: "Install", state: "Installed" };
    case "PartialInstall":
      return { _tag: "Repair" };
    case "Conflict":
      return conflictDecision(state);
  }
};

const statusDecision = (state: HookState): HookDecision => {
  switch (state._tag) {
    case "Absent":
      return { _tag: "NoChange", command: "Status", state: "Absent" };
    case "Installed":
      return { _tag: "NoChange", command: "Status", state: "Installed" };
    case "PartialInstall":
      return { _tag: "IncompleteInstall" };
    case "Conflict":
      return conflictDecision(state);
  }
};

const uninstallDecision = (state: HookState): HookDecision => {
  switch (state._tag) {
    case "Absent":
      return { _tag: "NoChange", command: "Uninstall", state: "Absent" };
    case "Installed":
      return { _tag: "Remove" };
    case "PartialInstall":
      return { _tag: "Remove" };
    case "Conflict":
      return state.ownership === "Local"
        ? { _tag: "Remove" }
        : conflictDecision(state);
  }
};

export const decideHookAction = (
  command: HookCommand,
  version: GitVersion,
  state: HookState,
): HookDecision => {
  if (
    (command._tag === "Install" || command._tag === "Uninstall") &&
    (version._tag === "InvalidGitVersion" || !versionAtLeast(version))
  ) {
    return { _tag: "UnsupportedGit", version };
  }
  if (
    command._tag === "Status" && state._tag === "Installed" &&
    version._tag === "GitVersion" && !versionAtLeast(version)
  ) {
    return { _tag: "InstalledButInactive", version };
  }

  switch (command._tag) {
    case "Install":
      return installDecision(state);
    case "Status":
      return statusDecision(state);
    case "Uninstall":
      return uninstallDecision(state);
    case "Help":
      return {
        _tag: "NoChange",
        command: "Help",
        state: state._tag === "Installed" ? "Installed" : "Absent",
      };
  }
};
