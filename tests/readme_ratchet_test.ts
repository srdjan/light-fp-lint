// @light-fp adapter -- this test reads the README and drives the real Deno CLI.
import { assertEquals } from "@std/assert";

const readmeUrl = new URL("../README.md", import.meta.url);
const modUrl = new URL("../src/mod.ts", import.meta.url).href;

const ratchetRecipe = (readme: string): string =>
  readme
    .slice(readme.indexOf("**By ratchet.**"))
    .split("```ts\n")[1]
    .split("\n```")[0]
    .replace(/jsr:@srdjan\/light-fp-lint@\^[0-9.]+/, modUrl);

Deno.test("README: the ratchet recipe typechecks", async () => {
  const directory = await Deno.makeTempDir({ prefix: "light fp ratchet " });
  try {
    const file = `${directory}/ratchet_test.ts`;
    await Deno.writeTextFile(
      file,
      ratchetRecipe(await Deno.readTextFile(readmeUrl)),
    );
    const output = await new Deno.Command(Deno.execPath(), {
      args: ["check", "--no-lock", file],
      stdout: "piped",
      stderr: "piped",
    }).output();
    assertEquals(
      output.code,
      0,
      new TextDecoder().decode(output.stderr),
    );
  } finally {
    await Deno.remove(directory, { recursive: true });
  }
});
