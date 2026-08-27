// Rule-level tests driven by Deno.lint.runPlugin.
import plugin from "../src/mod.ts";

const DOMAIN = "/repo/src/domain/sample.ts";

const idsFor = (source: string, filename = DOMAIN): readonly string[] =>
  Deno.lint.runPlugin(plugin, filename, source).map((d) => d.id).sort();

const countOf = (rule: string, source: string, filename = DOMAIN): number =>
  idsFor(source, filename).filter((id) => id === `light-fp/${rule}`).length;

const assertReports = (rule: string, source: string, filename = DOMAIN) => {
  const found = countOf(rule, source, filename);
  if (found === 0) {
    throw new Error(
      `expected light-fp/${rule} to report on:\n${source}\ngot: ${idsFor(source, filename).join(", ") || "(none)"}`,
    );
  }
};

const assertSilent = (rule: string, source: string, filename = DOMAIN) => {
  const found = countOf(rule, source, filename);
  if (found !== 0) {
    throw new Error(`expected light-fp/${rule} to stay silent on:\n${source}\ngot ${found} report(s)`);
  }
};

// --- no-top-level-effects -------------------------------------------------
// A top-level effect is always nested inside a declaration, so the rule has to
// look for an enclosing function rather than a direct `Program` parent.

Deno.test("no-top-level-effects: flags effects in top-level declarations", () => {
  assertReports("no-top-level-effects", `export const now = Date.now();`);
  assertReports("no-top-level-effects", `export const roll = Math.random();`);
  assertReports("no-top-level-effects", `const home = Deno.env.get("HOME");`);
  assertReports("no-top-level-effects", `const res = await fetch("https://example.com");`);
  assertReports("no-top-level-effects", `const copy = structuredClone({ a: 1 });`);
});

Deno.test("no-top-level-effects: allows effects deferred inside a function", () => {
  assertSilent("no-top-level-effects", `export const readNow = () => Date.now();`);
  assertSilent("no-top-level-effects", `export function load() { return fetch("https://example.com"); }`);
  assertSilent("no-top-level-effects", `export const plan = brand("IO", () => Deno.readTextFile("a"));`);
});

Deno.test("no-top-level-effects: reports each top-level effect once", () => {
  if (countOf("no-top-level-effects", `export const now = Date.now();`) !== 1) {
    throw new Error("expected exactly one report for a single top-level effect");
  }
});

Deno.test("no-top-level-effects: stays out of adapters", () => {
  assertSilent("no-top-level-effects", `export const now = Date.now();`, "/repo/src/adapters/clock.ts");
});

// --- effect-brand-origin --------------------------------------------------
// The documented style carries the brand as a string literal type argument,
// as in `Effect<"IO", A>`, not as a type reference named `IO`.

Deno.test("effect-brand-origin: flags a hand-rolled branded plan", () => {
  assertReports(
    "effect-brand-origin",
    `const plan: Effect<"IO", number> = { effect: "IO", run: async () => 1 };`,
  );
  assertReports(
    "effect-brand-origin",
    `const plan: WithCapability<"Console", Cap, void> = { effect: "Console", capability: c, run: async () => {} };`,
  );
  assertReports("effect-brand-origin", `const plan: IO<number> = makeItUp();`);
});

Deno.test("effect-brand-origin: accepts approved brand helpers", () => {
  assertSilent("effect-brand-origin", `const plan: Effect<"IO", number> = brand("IO", async () => 1);`);
  assertSilent(
    "effect-brand-origin",
    `const plan: WithCapability<"Console", Cap, void> = brandWithCapability("Console", c, async () => {});`,
  );
  assertSilent("effect-brand-origin", `const plan: Effect<"IO", number> = withCapability(c, async () => 1);`);
});

Deno.test("effect-brand-origin: ignores a container that merely holds a plan", () => {
  assertSilent("effect-brand-origin", `const wrapped: Result<E, Effect<"IO", number>> = ok(plan);`);
  assertSilent("effect-brand-origin", `const many: readonly Effect<"IO", number>[] = [];`);
});

Deno.test("effect-brand-origin: flags a raw branded return value", () => {
  assertReports(
    "effect-brand-origin",
    `const make = (): Effect<"IO", number> => ({ effect: "IO", run: async () => 1 });`,
  );
  assertSilent("effect-brand-origin", `const make = (): Effect<"IO", number> => brand("IO", async () => 1);`);
});

// --- no-direct-effect-assertion -------------------------------------------

Deno.test("no-direct-effect-assertion: flags a forged brand", () => {
  assertReports("no-direct-effect-assertion", `const plan = fetch("x") as Effect<"IO", Response>;`);
  assertReports("no-direct-effect-assertion", `const plan = raw as WithCapability<"FS", Cap, string>;`);
  assertReports("no-direct-effect-assertion", `const plan = <IO<number>> raw;`);
});

Deno.test("no-direct-effect-assertion: leaves ordinary assertions alone", () => {
  assertSilent("no-direct-effect-assertion", `const shape = payload as Record<string, unknown>;`);
  assertSilent("no-direct-effect-assertion", `const tags = ["a", "b"] as const;`);
});

Deno.test("no-direct-effect-assertion: honours the escape-hatch path", () => {
  assertSilent(
    "no-direct-effect-assertion",
    `const plan = raw as Effect<"IO", number>;`,
    "/repo/src/effect-brands.ts",
  );
});
