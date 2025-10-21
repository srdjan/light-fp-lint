import plugin from "../src/mod.ts";
Deno.test("plugin loads", () => {
  if (!plugin || plugin.name !== "light-fp") {
    throw new Error("failed to load plugin");
  }
});
