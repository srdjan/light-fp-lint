import { assertEquals, assertStringIncludes } from "@std/assert";
import { delimiter, dirname, isAbsolute } from "node:path";
import { fromFileUrl, join, toFileUrl } from "@std/path";
import { parseGitVersion } from "../src/git_hook.ts";
import { type RunGit, runHookCli } from "../src/cli/hook.ts";

const root = fromFileUrl(new URL("..", import.meta.url));
const cli = join(root, "src", "cli", "hook.ts");
const explicitGit = Deno.env.get("LIGHT_FP_TEST_GIT");
const git = explicitGit ?? "git";
const gitDirectory = explicitGit !== undefined && isAbsolute(explicitGit)
  ? dirname(explicitGit)
  : undefined;
const executablePath = gitDirectory === undefined
  ? Deno.env.get("PATH") ?? ""
  : `${gitDirectory}${delimiter}${Deno.env.get("PATH") ?? ""}`;
const decoder = new TextDecoder();

type ProcessResult = Readonly<{
  code: number;
  stdout: string;
  stderr: string;
}>;

const run = async (
  command: string,
  args: readonly string[],
  cwd: string,
): Promise<ProcessResult> => {
  const output = await new Deno.Command(command, {
    args: [...args],
    cwd,
    env: {
      GIT_CONFIG_GLOBAL: join(cwd, "global.gitconfig"),
      PATH: executablePath,
    },
    stdin: "null",
    stdout: "piped",
    stderr: "piped",
  }).output();
  return {
    code: output.code,
    stdout: decoder.decode(output.stdout).replace(/\r\n/g, "\n"),
    stderr: decoder.decode(output.stderr).replace(/\r\n/g, "\n"),
  };
};

const runGit = (cwd: string, args: readonly string[]): Promise<ProcessResult> =>
  run(git, args, cwd);

const runCli = (cwd: string, args: readonly string[]): Promise<ProcessResult> =>
  run(Deno.execPath(), ["run", "-A", cli, ...args], cwd);

const gitProbe = await run(git, ["--version"], root).catch(
  (): ProcessResult => ({
    code: 1,
    stdout: "",
    stderr: "git unavailable",
  }),
);
const parsedGit = parseGitVersion(gitProbe.stdout.trim());
const namedHooksAvailable = parsedGit._tag === "GitVersion" &&
  (parsedGit.major > 2 || parsedGit.major === 2 && parsedGit.minor >= 55);
const namedHooksRequired = Deno.env.get("LIGHT_FP_REQUIRE_NAMED_HOOKS") === "1";

Deno.test("hook CLI: CI requires the real Git 2.55 E2E set", () => {
  if (!namedHooksRequired) return;
  assertEquals(
    namedHooksAvailable,
    true,
    `LIGHT_FP_TEST_GIT must resolve to Git 2.55 or newer; observed ${
      gitProbe.stdout.trim() || gitProbe.stderr
    }`,
  );
});

const namedHookTest = (
  name: string,
  test: () => Promise<void>,
): void => Deno.test({ name, ignore: !namedHooksAvailable, fn: test });

const withRepository = async (
  test: (directory: string) => Promise<void>,
): Promise<void> => {
  const directory = await Deno.makeTempDir({ prefix: "light-fp-hook-" });
  try {
    const initialized = await runGit(directory, ["init", "--quiet"]);
    assertEquals(initialized.code, 0, initialized.stderr);
    await test(directory);
  } finally {
    await Deno.remove(directory, { recursive: true });
  }
};

namedHookTest(
  "hook CLI: install, status, reinstall, and uninstall lifecycle",
  async () => {
    await withRepository(async (directory) => {
      const installed = await runCli(directory, ["install"]);
      assertEquals(installed.code, 0, installed.stderr);
      assertStringIncludes(installed.stdout, "installed");

      const listed = await runGit(directory, [
        "hook",
        "list",
        "--show-scope",
        "pre-commit",
      ]);
      assertEquals(listed.code, 0, listed.stderr);
      assertStringIncludes(listed.stdout, "local\tlight-fp");

      const repeated = await runCli(directory, ["install"]);
      assertEquals(repeated.code, 0, repeated.stderr);
      assertStringIncludes(repeated.stdout, "already installed");

      const status = await runCli(directory, ["status"]);
      assertEquals(status.code, 0, status.stderr);
      assertStringIncludes(status.stdout, "installed");

      const removed = await runCli(directory, ["uninstall"]);
      assertEquals(removed.code, 0, removed.stderr);
      assertStringIncludes(removed.stdout, "removed");

      const after = await runCli(directory, ["status"]);
      assertEquals(after.code, 0, after.stderr);
      assertStringIncludes(after.stdout, "not installed");
    });
  },
);

namedHookTest(
  "hook CLI: preserves an existing traditional pre-commit hook",
  async () => {
    await withRepository(async (directory) => {
      const hookPath = join(directory, ".git", "hooks", "pre-commit");
      const original = new TextEncoder().encode(
        "#!/bin/sh\nprintf traditional\\n\n",
      );
      await Deno.writeFile(hookPath, original, { mode: 0o755 });

      const installed = await runCli(directory, ["install"]);
      assertEquals(installed.code, 0, installed.stderr);
      assertEquals(await Deno.readFile(hookPath), original);

      const listed = await runGit(directory, [
        "hook",
        "list",
        "--show-scope",
        "pre-commit",
      ]);
      assertStringIncludes(listed.stdout, "local\tlight-fp");
      assertStringIncludes(listed.stdout, "hook from hookdir");
    });
  },
);

namedHookTest(
  "hook CLI: real named hook blocks and then accepts domain code",
  async () => {
    await withRepository(async (directory) => {
      const plugin = toFileUrl(join(root, "src", "mod.ts")).href;
      await Deno.writeTextFile(
        join(directory, "deno.json"),
        JSON.stringify({ lint: { plugins: [plugin] } }),
      );
      await Deno.writeTextFile(
        join(directory, "domain.ts"),
        'export const log = (): void => console.log("secret marker");\n',
      );

      assertEquals((await runCli(directory, ["install"])).code, 0);
      const rejected = await runGit(directory, ["hook", "run", "pre-commit"]);
      assertEquals(
        rejected.code === 0,
        false,
        rejected.stdout + rejected.stderr,
      );

      await Deno.writeTextFile(
        join(directory, "domain.ts"),
        "export const observed = (now: number): number => now;\n",
      );
      const accepted = await runGit(directory, ["hook", "run", "pre-commit"]);
      assertEquals(accepted.code, 0, accepted.stdout + accepted.stderr);
    });
  },
);

namedHookTest(
  "hook CLI: conflicting local ownership is never changed",
  async () => {
    await withRepository(async (directory) => {
      for (
        const [key, value] of [
          ["hook.light-fp.command", "deno lint"],
          ["hook.light-fp.event", "pre-commit"],
          ["hook.light-fp.enabled", "false"],
        ]
      ) {
        assertEquals(
          (await runGit(directory, ["config", "set", "--local", key, value]))
            .code,
          0,
        );
      }
      const before = await runGit(directory, [
        "config",
        "get",
        "--local",
        "--show-names",
        "--all",
        "--regexp",
        "^hook\\.light-fp\\.",
      ]);

      for (const action of ["install", "uninstall"]) {
        const refused = await runCli(directory, [action]);
        assertEquals(refused.code, 4);
        assertStringIncludes(refused.stderr, "conflict");
      }

      const after = await runGit(directory, [
        "config",
        "get",
        "--local",
        "--show-names",
        "--all",
        "--regexp",
        "^hook\\.light-fp\\.",
      ]);
      assertEquals(after.stdout, before.stdout);
    });
  },
);

namedHookTest("hook CLI: non-local ownership is never adopted", async () => {
  await withRepository(async (directory) => {
    const globalConfig = join(directory, "global.gitconfig");
    assertEquals(
      (await runGit(directory, [
        "config",
        "set",
        "--file",
        globalConfig,
        "hook.light-fp.command",
        "deno lint",
      ])).code,
      0,
    );
    assertEquals(
      (await runGit(directory, [
        "config",
        "set",
        "--file",
        globalConfig,
        "hook.light-fp.event",
        "pre-commit",
      ])).code,
      0,
    );

    for (const action of ["install", "uninstall"]) {
      const refused = await runCli(directory, [action]);
      assertEquals(refused.code, 4);
      assertStringIncludes(refused.stderr, "conflict");
    }
    const local = await runGit(directory, [
      "config",
      "get",
      "--local",
      "--regexp",
      "^hook\\.light-fp\\.",
    ]);
    assertEquals(local.code, 1);
    assertEquals(local.stdout, "");
  });
});

Deno.test("hook CLI: old Git decision issues no mutation", async () => {
  const calls: string[][] = [];
  const fakeGit: RunGit = (args) => {
    calls.push([...args]);
    if (args[0] === "rev-parse") {
      return Promise.resolve({ code: 0, stdout: "/repo\n", stderr: "" });
    }
    if (args[0] === "--version") {
      return Promise.resolve({
        code: 0,
        stdout: "git version 2.54.0\n",
        stderr: "",
      });
    }
    return Promise.resolve({ code: 99, stdout: "", stderr: "unexpected" });
  };

  const result = await runHookCli(["install"], fakeGit);
  assertEquals(result.exitCode, 3);
  assertStringIncludes(result.message, "unsupported Git");
  assertEquals(calls, [["rev-parse", "--show-toplevel"], ["--version"]]);
});

Deno.test("hook CLI: failed event write rolls back only the owned command", async () => {
  const calls: string[][] = [];
  const entries: { key: string; value: string }[] = [];
  const configOutput = (scoped: boolean): string =>
    entries.map((entry) =>
      scoped
        ? `local\0${entry.key}\n${entry.value}\0`
        : `${entry.key}\n${entry.value}\0`
    ).join("");
  const fakeGit: RunGit = (args) => {
    calls.push([...args]);
    if (args[0] === "rev-parse") {
      return Promise.resolve({ code: 0, stdout: "/repo\n", stderr: "" });
    }
    if (args[0] === "--version") {
      return Promise.resolve({
        code: 0,
        stdout: "git version 2.55.0\n",
        stderr: "",
      });
    }
    if (args[0] === "config" && args[1] === "get") {
      const output = configOutput(args.includes("--show-scope"));
      return Promise.resolve({
        code: output.length === 0 ? 1 : 0,
        stdout: output,
        stderr: "",
      });
    }
    if (
      args[0] === "config" && args[1] === "set" &&
      args.includes("hook.light-fp.command")
    ) {
      entries.push({ key: "hook.light-fp.command", value: "deno lint" });
      return Promise.resolve({ code: 0, stdout: "", stderr: "" });
    }
    if (
      args[0] === "config" && args[1] === "set" &&
      args.includes("hook.light-fp.event")
    ) {
      entries.push({
        key: "hook.light-fp.command",
        value: "deno task concurrent-lint",
      });
      entries.push({ key: "hook.light-fp.enabled", value: "false" });
      return Promise.resolve({ code: 5, stdout: "", stderr: "write failed" });
    }
    if (args[0] === "config" && args[1] === "unset") {
      const command = entries.findIndex((entry) =>
        entry.key === "hook.light-fp.command" && entry.value === "deno lint"
      );
      if (command >= 0) entries.splice(command, 1);
      return Promise.resolve({ code: 0, stdout: "", stderr: "" });
    }
    return Promise.resolve({ code: 99, stdout: "", stderr: "unexpected" });
  };

  const installed = await runHookCli(["install"], fakeGit);
  assertEquals(installed.exitCode, 1);
  assertEquals(calls.at(-1), [
    "config",
    "unset",
    "--local",
    "--fixed-value",
    "--value=deno lint",
    "hook.light-fp.command",
  ]);
  assertEquals(entries, [
    { key: "hook.light-fp.command", value: "deno task concurrent-lint" },
    { key: "hook.light-fp.enabled", value: "false" },
  ]);

  const status = await runHookCli(["status"], fakeGit);
  assertEquals(status.exitCode, 4);
  assertStringIncludes(status.message, "conflict");
});

Deno.test("hook CLI: outside a repository fails without config mutation", async () => {
  const directory = await Deno.makeTempDir({ prefix: "light-fp-outside-" });
  try {
    const result = await runCli(directory, ["install"]);
    assertEquals(result.code, 1);
    assertStringIncludes(result.stderr, "not inside a Git repository");
    const entries = [];
    for await (const entry of Deno.readDir(directory)) entries.push(entry.name);
    assertEquals(entries, []);
  } finally {
    await Deno.remove(directory, { recursive: true });
  }
});
