// @light-fp adapter -- the file system is the point of this script.

// Every release names its version in four places: deno.json, the README badge,
// the README install commands, and the Codex plugin manifest. Release after
// release bumped deno.json alone and left the rest behind, so the bump is a
// task now. It also repairs that exact half-done state: when deno.json already
// reads the target, the manifest still holds the version the other files use.

import { dirname, fromFileUrl, join } from "@std/path";

const root = dirname(dirname(fromFileUrl(import.meta.url)));

const FILES: readonly string[] = [
  "deno.json",
  "README.md",
  ".codex-plugin/plugin.json",
];

const SEMVER = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;

const fail = (message: string): never => {
  console.error(message);
  Deno.exit(1);
};

const next = Deno.args[0];
if (next === undefined || !SEMVER.test(next)) {
  fail("Usage: deno task bump <version>, for example 0.7.4");
}

const versionIn = async (file: string): Promise<string> => {
  const declared: unknown =
    JSON.parse(await Deno.readTextFile(join(root, file))).version;
  return typeof declared === "string"
    ? declared
    : fail(`${file} declares no version`);
};

const declaredVersion = await versionIn("deno.json");
const current = declaredVersion === next
  ? await versionIn(".codex-plugin/plugin.json")
  : declaredVersion;
if (current === next) fail(`every file already reads ${next}`);

let changed = 0;
for (const file of FILES) {
  const path = join(root, file);
  const before = await Deno.readTextFile(path);
  const after = before.replaceAll(current, next);
  if (after === before) {
    console.warn(`${file}: no reference to ${current}`);
    continue;
  }
  await Deno.writeTextFile(path, after);
  changed += 1;
  console.log(`${file}: ${current} -> ${next}`);
}

if (changed === 0) fail(`no file mentioned ${current}`);
console.log(
  `\nBumped ${changed} files. Run \`deno task ci\` before committing.`,
);
