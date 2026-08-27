import { assertEquals } from "@std/assert";
import plugin from "../src/mod.ts";

const DOMAIN = "/repo/src/domain/effects_purity.ts";

const diagnostics = (
  source: string,
  filename = DOMAIN,
): readonly Deno.lint.Diagnostic[] =>
  Deno.lint.runPlugin(plugin, filename, source);

const ruleIds = (source: string, filename = DOMAIN): readonly string[] =>
  diagnostics(source, filename).map((diagnostic) => diagnostic.id);

const assertRuleCount = (
  rule: string,
  source: string,
  expected: number,
  filename = DOMAIN,
): void => {
  const actual = ruleIds(source, filename).filter((id) => id === rule);
  assertEquals(actual.length, expected, ruleIds(source, filename).join(", "));
};

const assertClean = (source: string): void => {
  assertEquals(ruleIds(source), []);
};

for (
  const testCase of [
    {
      name: "a destructured parameter is an injected fetch capability",
      source:
        `type Http = { readonly fetch: (u: string) => Promise<string> };\nexport const load = ({ fetch }: Http, u: string) => fetch(u);`,
    },
    {
      name: "a local timer binding is not the ambient timer",
      source:
        `const setTimeout = (run: () => void): void => run();\nexport const schedule = (run: () => void) => setTimeout(run);`,
    },
    {
      name: "an imported fetch binding is not ambient",
      source:
        `import { fetch } from "../ports/http.ts";\nexport const load = (url: string) => fetch(url);`,
    },
    {
      name: "a direct re-export names the source module binding",
      source: `export { fetch } from "./ports/http.ts";`,
    },
    {
      name: "an aliased re-export names the source module binding",
      source: `export { fetch as httpFetch } from "./ports/x.ts";`,
    },
    {
      name: "a sourceless export of a local fetch binding is not ambient",
      source: `const fetch = (u: string) => u; export { fetch };`,
    },
  ] as const
) {
  Deno.test(`no-ambient-effects: ${testCase.name}`, () => {
    assertClean(testCase.source);
  });
}

for (
  const testCase of [
    ["Math.random", `export const value = () => Math["random"]();`],
    ["Date.now", `export const value = () => Date["now"]();`],
    ["performance.now", `export const value = () => performance["now"]();`],
    [
      "crypto.randomUUID",
      `export const value = () => crypto["randomUUID"]();`,
    ],
    [
      "crypto.getRandomValues",
      `export const value = (bytes: Uint8Array) => crypto["getRandomValues"](bytes);`,
    ],
  ] as const
) {
  Deno.test(`no-ambient-effects: computed ${testCase[0]}`, () => {
    assertRuleCount("light-fp/no-ambient-effects", testCase[1], 1);
  });
}

for (
  const testCase of [
    ["declarator alias", `const runtime = Deno;`],
    ["destructured alias", `const { now } = Date;`],
    ["assignment alias", `let runtime;\nruntime = Deno;`],
    ["default export", `export default Deno;`],
    ["free function alias", `const get = fetch;`],
    ["sourceless export alias", `export { Deno };`],
  ] as const
) {
  Deno.test(`no-ambient-effects: ${testCase[0]} is reported`, () => {
    assertRuleCount("light-fp/no-ambient-effects", testCase[1], 1);
  });
}

for (
  const testCase of [
    ["WebSocket", `export const open = () => new WebSocket("ws://local");`],
    ["Worker", `export const open = () => new Worker("./worker.ts");`],
    ["XMLHttpRequest", `export const open = () => new XMLHttpRequest();`],
    ["EventSource", `export const open = () => new EventSource("/events");`],
    [
      "BroadcastChannel",
      `export const open = () => new BroadcastChannel("updates");`,
    ],
  ] as const
) {
  Deno.test(`no-ambient-effects: new ${testCase[0]} is covered`, () => {
    assertRuleCount("light-fp/no-ambient-effects", testCase[1], 1);
  });
}

Deno.test("no-ambient-effects: sessionStorage is covered", () => {
  assertRuleCount(
    "light-fp/no-ambient-effects",
    `export const read = () => sessionStorage.getItem("key");`,
    1,
  );
});

for (
  const testCase of [
    ["exported initializer", `export const x = main();`],
    ["default export", `export default main();`],
    ["destructuring initializer", `const { a } = main();`],
    ["tagged template initializer", "export const x = render`page`;"],
    ["nested initializer calls", `export const x = pipe(main());`],
  ] as const
) {
  Deno.test(`pure-module: ${testCase[0]} runs on import`, () => {
    assertRuleCount("light-fp/pure-module", testCase[1], 1);
  });
}

Deno.test("pure-module: a bare block reports once", () => {
  assertRuleCount(
    "light-fp/pure-module",
    `{ let hits = 0; hits += 1; sendTelemetry(); }`,
    1,
  );
});

for (
  const testCase of [
    ["a bare call", `main();`],
    ["top-level await", `const x = await load();`],
  ] as const
) {
  Deno.test(`pure-module: ${testCase[0]} has no double report`, () => {
    assertRuleCount("light-fp/pure-module", testCase[1], 1);
  });
}

Deno.test("pure-module: export let is covered", () => {
  assertRuleCount("light-fp/pure-module", `export let n = 0;`, 1);
});

for (
  const testCase of [
    [
      "optional call",
      `export const run = (task?: () => number) => { task?.(); return 1; };`,
    ],
    [
      "sequence expression",
      `export const run = () => { (sideA(), sideB()); return 1; };`,
    ],
    [
      "function declaration",
      `export function run(): number { validate(input); return 1; }`,
    ],
    [
      "function expression",
      `export const run = function (): number { validate(input); return 1; };`,
    ],
  ] as const
) {
  Deno.test(`no-discarded-values: ${testCase[0]} is covered`, () => {
    assertRuleCount("light-fp/no-discarded-values", testCase[1], 1);
  });
}

Deno.test("no-discarded-values: super() is required constructor work", () => {
  assertRuleCount(
    "light-fp/no-discarded-values",
    `class Child extends Parent { constructor() { super(); } }`,
    0,
  );
});

for (
  const testCase of [
    ["no-ambient-effects", `export const now = () => Date.now();`],
    ["pure-module", `main();`],
    [
      "no-discarded-values",
      `export const run = () => { validate(input); return 1; };`,
    ],
  ] as const
) {
  Deno.test(`${testCase[0]}: prelude keeps the rule enabled`, () => {
    assertRuleCount(
      `light-fp/${testCase[0]}`,
      `// @light-fp prelude\n${testCase[1]}`,
      1,
    );
  });
}
