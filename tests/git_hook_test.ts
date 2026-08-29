import { assertEquals } from "@std/assert";
import {
  decideHookAction,
  type GitVersion,
  type HookCommand,
  type HookState,
  hookState,
  parseGitVersion,
  parseHookCommand,
} from "../src/git_hook.ts";

Deno.test("git hook: accepts only the documented argument grammar", () => {
  const cases: readonly (readonly [readonly string[], string | undefined])[] = [
    [["install"], "Install"],
    [["status"], "Status"],
    [["uninstall"], "Uninstall"],
    [["help"], "Help"],
    [["--help"], "Help"],
    [["-h"], "Help"],
    [[], undefined],
    [["Install"], undefined],
    [["install", "extra"], undefined],
    [["--version"], undefined],
  ];

  for (const [args, expected] of cases) {
    assertEquals(parseHookCommand(args)?._tag, expected, args.join(" "));
  }
});

Deno.test("git hook: parses complete Git versions without partial matches", () => {
  const valid: readonly (readonly [string, readonly number[]])[] = [
    ["git version 2.55.0", [2, 55, 0]],
    ["git version 3.1.12", [3, 1, 12]],
    ["git version 2.50.1 (Apple Git-155)", [2, 50, 1]],
    ["git version 2.55.0.windows.1", [2, 55, 0]],
  ];
  for (const [raw, expected] of valid) {
    const parsed = parseGitVersion(raw);
    assertEquals(parsed._tag, "GitVersion", raw);
    if (parsed._tag === "GitVersion") {
      assertEquals([parsed.major, parsed.minor, parsed.patch], expected);
    }
  }

  for (
    const raw of [
      "2.55.0",
      "git version 2.55",
      "git version 2.55.0 trailing",
      "git version 2.55.0\nmore",
      "git version 2.55.x",
      " git version 2.55.0",
    ]
  ) {
    assertEquals(parseGitVersion(raw)._tag, "InvalidGitVersion", raw);
  }
});

Deno.test("git hook: classifies only the exact owned configuration as installed", () => {
  const cases: readonly (readonly [
    readonly Readonly<{ scope: string; key: string; value: string }>[],
    HookState["_tag"],
  ])[] = [
    [[], "Absent"],
    [[
      { scope: "local", key: "hook.light-fp.command", value: "deno lint" },
      { scope: "local", key: "hook.light-fp.event", value: "pre-commit" },
    ], "Installed"],
    [[
      { scope: "local", key: "hook.light-fp.command", value: "deno lint" },
    ], "PartialInstall"],
    [[
      { scope: "local", key: "hook.light-fp.command", value: "deno task lint" },
      { scope: "local", key: "hook.light-fp.event", value: "pre-commit" },
    ], "Conflict"],
    [[
      { scope: "local", key: "hook.light-fp.command", value: "deno lint" },
      { scope: "local", key: "hook.light-fp.event", value: "commit-msg" },
    ], "Conflict"],
    [[
      { scope: "local", key: "hook.light-fp.command", value: "deno lint" },
      { scope: "local", key: "hook.light-fp.event", value: "pre-commit" },
      { scope: "local", key: "hook.light-fp.event", value: "pre-push" },
    ], "Conflict"],
    [[
      { scope: "global", key: "hook.light-fp.command", value: "deno lint" },
      { scope: "global", key: "hook.light-fp.event", value: "pre-commit" },
    ], "Conflict"],
    [[
      { scope: "local", key: "hook.light-fp.command", value: "deno lint" },
      { scope: "local", key: "hook.light-fp.event", value: "pre-commit" },
      { scope: "local", key: "hook.light-fp.enabled", value: "false" },
    ], "Conflict"],
  ];

  for (const [entries, expected] of cases) {
    assertEquals(hookState(entries)._tag, expected);
  }
});

const version = (
  minor: number,
): Extract<GitVersion, { readonly _tag: "GitVersion" }> => ({
  _tag: "GitVersion",
  major: 2,
  minor,
  patch: 0,
});

const command = (tag: HookCommand["_tag"]): HookCommand => ({ _tag: tag });

Deno.test("git hook: install decisions are versioned, idempotent, and safe", () => {
  assertEquals(
    decideHookAction(command("Install"), version(54), { _tag: "Absent" })._tag,
    "UnsupportedGit",
  );
  assertEquals(
    decideHookAction(command("Install"), version(55), { _tag: "Absent" })._tag,
    "Write",
  );
  assertEquals(
    decideHookAction(command("Install"), version(55), {
      _tag: "Installed",
    })._tag,
    "NoChange",
  );
  assertEquals(
    decideHookAction(command("Install"), version(55), {
      _tag: "Conflict",
      ownership: "Local",
      commandEntries: 1,
      eventEntries: 1,
      otherEntries: 0,
    })._tag,
    "RefuseConflict",
  );
  assertEquals(
    decideHookAction(
      command("Install"),
      version(55),
      hookState([{
        scope: "local",
        key: "hook.light-fp.command",
        value: "deno lint",
      }]),
    )._tag,
    "Repair",
  );
  assertEquals(
    decideHookAction(
      command("Install"),
      version(55),
      hookState([
        {
          scope: "local",
          key: "hook.light-fp.command",
          value: "deno lint",
        },
        {
          scope: "local",
          key: "hook.light-fp.enabled",
          value: "false",
        },
      ]),
    )._tag,
    "RefuseConflict",
  );
});

Deno.test("git hook: uninstall removes locally owned namespace states", () => {
  assertEquals(
    decideHookAction(command("Uninstall"), version(55), {
      _tag: "Installed",
    })._tag,
    "Remove",
  );
  assertEquals(
    decideHookAction(command("Uninstall"), version(55), { _tag: "Absent" })
      ._tag,
    "NoChange",
  );
  assertEquals(
    decideHookAction(
      command("Uninstall"),
      version(55),
      hookState([{
        scope: "local",
        key: "hook.light-fp.command",
        value: "deno lint",
      }]),
    )._tag,
    "Remove",
  );
  assertEquals(
    decideHookAction(
      command("Uninstall"),
      version(55),
      hookState([
        {
          scope: "local",
          key: "hook.light-fp.command",
          value: "deno lint",
        },
        {
          scope: "local",
          key: "hook.light-fp.event",
          value: "pre-push",
        },
      ]),
    )._tag,
    "Remove",
  );
  assertEquals(
    decideHookAction(
      command("Uninstall"),
      version(55),
      hookState([{
        scope: "global",
        key: "hook.light-fp.command",
        value: "deno lint",
      }]),
    )._tag,
    "RefuseConflict",
  );
});

Deno.test("git hook: status reports installed hooks inactive on old Git", () => {
  assertEquals(
    decideHookAction(command("Status"), version(55), { _tag: "Installed" }),
    { _tag: "NoChange", command: "Status", state: "Installed" },
  );
  assertEquals(
    decideHookAction(
      command("Status"),
      version(55),
      hookState([{
        scope: "local",
        key: "hook.light-fp.command",
        value: "deno lint",
      }]),
    ),
    { _tag: "IncompleteInstall" },
  );
  assertEquals(
    decideHookAction(
      command("Status"),
      version(54),
      { _tag: "Installed" },
    ),
    { _tag: "InstalledButInactive", version: version(54) },
  );
});
