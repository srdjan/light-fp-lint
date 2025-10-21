// E2E verification: runs deno lint --fix on fixtures and compares to expected after/
import { join } from "https://deno.land/std@0.224.0/path/mod.ts";
import { copy } from "https://deno.land/std@0.224.0/fs/copy.ts";
import { ensureDir } from "https://deno.land/std@0.224.0/fs/ensure_dir.ts";

const root = Deno.cwd();
const tmp = await Deno.makeTempDir({ prefix: "light-fp-" });
const before = join(root, "tests/fixtures/before");
const after = join(root, "tests/fixtures/after");
const work = join(tmp, "work");

await ensureDir(work);
await copy(before, work, { overwrite: true });

// Run deno lint --fix using this plugin from deno.json
const p = new Deno.Command("deno", {
  args: ["lint", "--fix", "--config", "deno.json", work],
  stdout: "inherit",
  stderr: "inherit",
}).spawn();
const { code } = await p.status();
if (code !== 0) {
  console.error("deno lint failed");
  Deno.exit(code);
}

// Compare files
for await (const ent of Deno.readDir(after)) {
  if (!ent.isFile) continue;
  const expected = await Deno.readTextFile(join(after, ent.name));
  const got = await Deno.readTextFile(join(work, ent.name));
  if (expected.trim() !== got.trim()) {
    console.error(`Mismatch in ${ent.name}\n--- expected ---\n${expected}\n--- got ---\n${got}`);
    Deno.exit(1);
  }
}

console.log("E2E OK");
