import { assertEquals } from "@std/assert";
import { delimiter } from "node:path";
import { fromFileUrl, join } from "@std/path";

const hookSource = fromFileUrl(
  new URL("../.githooks/pre-commit", import.meta.url),
);

const fakeDeno = `#!/bin/sh
test "$(cat state.txt)" = fixed
`;

const git = async (
  tmp: string,
  args: readonly string[],
): Promise<number> => {
  const output = await new Deno.Command("git", {
    args: [...args],
    cwd: tmp,
    clearEnv: true,
    env: {
      PATH: `${join(tmp, "bin")}${delimiter}${Deno.env.get("PATH") ?? ""}`,
      HOME: tmp,
      GIT_CONFIG_NOSYSTEM: "1",
      GIT_CONFIG_GLOBAL: join(tmp, "global.gitconfig"),
    },
    stdin: "null",
    stdout: "null",
    stderr: "null",
  }).output();
  return output.code;
};

const setupRepository = async (tmp: string): Promise<void> => {
  await Deno.mkdir(join(tmp, ".githooks"));
  await Deno.mkdir(join(tmp, "bin"));
  await Deno.copyFile(hookSource, join(tmp, ".githooks", "pre-commit"));
  await Deno.chmod(join(tmp, ".githooks", "pre-commit"), 0o755);
  await Deno.writeTextFile(join(tmp, "bin", "deno"), fakeDeno);
  await Deno.chmod(join(tmp, "bin", "deno"), 0o755);
  await git(tmp, ["init", "--quiet"]);
  await git(tmp, ["config", "user.name", "Probe"]);
  await git(tmp, ["config", "user.email", "probe@example.com"]);
  await git(tmp, ["config", "core.hooksPath", ".githooks"]);
};

const commitWithStagedAndWorkingState = async (
  staged: string,
  working: string,
): Promise<Readonly<{ commit: number; head: number }>> => {
  const tmp = await Deno.makeTempDir();
  try {
    await setupRepository(tmp);
    await Deno.writeTextFile(join(tmp, "state.txt"), staged);
    await git(tmp, ["add", "state.txt"]);
    await Deno.writeTextFile(join(tmp, "state.txt"), working);
    const commit = await git(tmp, ["commit", "-m", "probe"]);
    const head = await git(tmp, ["rev-parse", "--verify", "--quiet", "HEAD"]);
    return { commit, head };
  } finally {
    await Deno.remove(tmp, { recursive: true });
  }
};

Deno.test("pre-commit: unstaged edits cannot make a broken commit pass", async () => {
  const result = await commitWithStagedAndWorkingState("broken", "fixed");
  assertEquals(result, { commit: 1, head: 1 });
});

Deno.test("pre-commit: unstaged edits cannot make a good commit fail", async () => {
  const result = await commitWithStagedAndWorkingState("fixed", "broken");
  assertEquals(result, { commit: 0, head: 0 });
});
