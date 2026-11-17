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
      name: "a local timer binding is not the ambient timer",
      source:
        `type Run = () => undefined;\nfunction setTimeout(run: Run): undefined { return run(); }\nexport function schedule(run: Run): undefined { return setTimeout(run); }`,
    },
    {
      name: "an imported fetch binding is not ambient",
      source:
        `import { fetch } from "../ports/http.ts";\ntype Url = string;\nexport function load(url: Url): Url { return fetch(url); }`,
    },
    {
      name: "a sourceless export of a local fetch binding is not ambient",
      source:
        `type Url = string;\nfunction fetch(u: Url): Url { return u; }\nexport { fetch };`,
    },
  ] as const
) {
  Deno.test(`no-ambient-effects: ${testCase.name}`, () => {
    assertClean(testCase.source);
  });
}

// The refused form is the point of these two cases, so they count only the
// no-ambient-effects diagnostics: declaration-forms and function-forms refuse a
// destructured parameter and a function expression.
Deno.test("no-ambient-effects: a destructured parameter is an injected fetch capability", () => {
  assertRuleCount(
    "light-fp/no-ambient-effects",
    `type Http = { readonly fetch: (u: string) => Promise<string> };\nexport function load({ fetch }: Http, u: string): Promise<string> { return fetch(u); }`,
    0,
  );
});

Deno.test("no-ambient-effects: a named function expression binds its name inside its body", () => {
  assertRuleCount(
    "light-fp/no-ambient-effects",
    `export const wrap = function fetch(value: string) { return fetch(value); };`,
    0,
  );
});

// A re-export is a module-forms violation, so these cases count only the
// no-ambient-effects diagnostics: the re-exported name is not an ambient read.
Deno.test("no-ambient-effects: a direct re-export names the source module binding", () => {
  assertRuleCount(
    "light-fp/no-ambient-effects",
    `export { fetch } from "./ports/http.ts";`,
    0,
  );
});

Deno.test("no-ambient-effects: an aliased re-export names the source module binding", () => {
  assertRuleCount(
    "light-fp/no-ambient-effects",
    `export { fetch as httpFetch } from "./ports/x.ts";`,
    0,
  );
});

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
    ["constructed initializer", `export const cache = new Map();`],
    ["nested construction", `export const cache = wrap(new Map());`],
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
    [
      "logical expression",
      `export const run = () => { ready && validate(input); return 1; };`,
    ],
    [
      "conditional expression",
      `export const run = () => { ready ? validate(input) : reject(input); return 1; };`,
    ],
    [
      "constructed value",
      `export const run = () => { new ResultBox(input); return 1; };`,
    ],
  ] as const
) {
  Deno.test(`no-discarded-values: ${testCase[0]} is covered`, () => {
    assertRuleCount("light-fp/no-discarded-values", testCase[1], 1);
  });
}

Deno.test("no-discarded-values: admit-capabilities shape retains only native push", () => {
  const source = `type Expr =
  | { kind: "StringLit"; value: string }
  | { kind: "Var"; name: string }
  | { kind: "Get"; field: string; target: Expr }
  | { kind: "Binary"; op: string; left: Expr; right: Expr }
  | { kind: "Unary"; expr: Expr };
function collect(expr: Expr): readonly string[] {
  const caps: string[] = [];
  function walk(e: Expr): undefined {
    if (e.kind === "Binary" && e.op === "in") {
      if (
        e.left.kind === "StringLit" &&
        e.right.kind === "Get" &&
        e.right.field === "capabilities" &&
        e.right.target.kind === "Var" &&
        e.right.target.name === "actor"
      ) {
        caps.push(e.left.value);
      }
    }
    if (e.kind === "Binary") {
      walk(e.left);
      walk(e.right);
    }
    if (e.kind === "Unary") {
      walk(e.expr);
    }
  }
  walk(expr);
  return caps;
}`;
  const found = diagnostics(source).filter((diagnostic) =>
    diagnostic.id === "light-fp/no-discarded-values"
  );
  assertEquals(
    found.map((diagnostic) => ({
      text: source.slice(diagnostic.range[0], diagnostic.range[1]),
      message: diagnostic.message,
    })),
    [{
      text: "caps.push(e.left.value);",
      message: "The value this expression produces is discarded.",
    }],
  );
});

Deno.test("no-discarded-values: nested explicit-undefined helpers have no result to discard", () => {
  for (
    const source of [
      `function outer(): undefined {
  function unit(): undefined { return undefined; }
  unit();
  return undefined;
}`,
      `function outer(): undefined {
  unit();
  function unit(): undefined { return undefined; }
  return undefined;
}`,
    ]
  ) {
    assertRuleCount("light-fp/no-discarded-values", source, 0);
  }
});

Deno.test("no-discarded-values: an undefined contract is not a purity or ownership claim", () => {
  assertRuleCount(
    "light-fp/no-discarded-values",
    `type Borrowed = { value: number };
function outer(input: Borrowed): undefined {
  function mutateBorrowed(): undefined {
    input.value = 1;
    return undefined;
  }
  mutateBorrowed();
  return undefined;
}`,
    0,
  );
});

for (
  const testCase of [
    {
      name: "a module-level undefined helper",
      source: `function unit(): undefined { return undefined; }
function outer(): undefined { unit(); return undefined; }`,
      expected: 1,
    },
    {
      name: "a bodyless declared helper",
      source: `function outer(): undefined {
  declare function unit(): undefined;
  unit();
  return undefined;
}`,
      expected: 1,
    },
    {
      name: "an ambient declared helper with a body",
      source: `function outer(): undefined {
  declare function unit(): undefined { return undefined; }
  unit();
  return undefined;
}`,
      expected: 1,
    },
    {
      name: "an undefined helper in an arbitrary nested block",
      source: `function outer(flag: boolean): undefined {
  if (flag) { function unit(): undefined { return undefined; } unit(); }
  return undefined;
}`,
      expected: 1,
    },
    {
      name: "an inferred undefined return",
      source: `function outer(): undefined {
  function unit() { return undefined; }
  unit();
  return undefined;
}`,
      expected: 1,
    },
    {
      name: "a void return",
      source: `function outer(): undefined {
  function unit(): void { return undefined; }
  unit();
  return undefined;
}`,
      expected: 1,
    },
    {
      name: "an alias of undefined",
      source: `type Unit = undefined;
function outer(): undefined {
  function unit(): Unit { return undefined; }
  unit();
  return undefined;
}`,
      expected: 1,
    },
    {
      name: "an async undefined result",
      source: `async function outer(): Promise<undefined> {
  async function unit(): Promise<undefined> { return undefined; }
  unit();
  return undefined;
}`,
      expected: 1,
    },
    {
      name: "a generator declaration",
      source: `function outer(): undefined {
  function* unit(): undefined { return undefined; }
  unit();
  return undefined;
}`,
      expected: 1,
    },
    {
      name: "a const arrow including its temporal dead zone",
      source: `function outer(): undefined {
  unit();
  const unit = (): undefined => undefined;
  return undefined;
}`,
      expected: 1,
    },
    {
      name: "an imported helper",
      source: `import { unit } from "../ports/unit.ts";
function outer(): undefined { unit(); return undefined; }`,
      expected: 1,
    },
    {
      name: "a member call",
      source: `type Port = { readonly unit: () => undefined };
function outer(port: Port): undefined { port.unit(); return undefined; }`,
      expected: 1,
    },
    {
      name: "an optional call",
      source: `function outer(): undefined {
  function unit(): undefined { return undefined; }
  unit?.();
  return undefined;
}`,
      expected: 1,
    },
    {
      name: "an awaited call",
      source: `async function outer(): Promise<undefined> {
  function unit(): undefined { return undefined; }
  await unit();
  return undefined;
}`,
      expected: 1,
    },
    {
      name: "a void-wrapped call",
      source: `function outer(): undefined {
  function unit(): undefined { return undefined; }
  void unit();
  return undefined;
}`,
      expected: 1,
    },
    {
      name: "a logical wrapper",
      source: `function outer(ready: boolean): undefined {
  function unit(): undefined { return undefined; }
  ready && unit();
  return undefined;
}`,
      expected: 1,
    },
    {
      name: "an aliased helper",
      source: `function outer(): undefined {
  function unit(): undefined { return undefined; }
  const alias = unit;
  unit();
  return undefined;
}`,
      expected: 1,
    },
    {
      name: "a helper passed as a value",
      source: `type Consumer = (run: () => undefined) => undefined;
function outer(consume: Consumer): undefined {
  function unit(): undefined { return undefined; }
  const consumed = consume(unit);
  unit();
  return consumed;
}`,
      expected: 1,
    },
    {
      name: "a parameter with the same name",
      source: `function outer(): undefined {
  function unit(): undefined { return undefined; }
  function sibling(unit: () => undefined): undefined { return undefined; }
  unit();
  return sibling(unit);
}`,
      expected: 1,
    },
    {
      name: "a catch binding with the same name",
      source: `function outer(): undefined {
  function unit(): undefined { return undefined; }
  try {} catch (unit) {}
  unit();
  return undefined;
}`,
      expected: 1,
    },
    {
      name: "a destructured shadow binding",
      source: `type Source = { readonly unit: () => undefined };
function outer(flag: boolean, source: Source): undefined {
  function unit(): undefined { return undefined; }
  if (flag) { const { unit } = source; }
  unit();
  return undefined;
}`,
      expected: 1,
    },
    {
      name: "an overload with the same name",
      source: `function outer(): undefined {
  function unit(): undefined;
  function unit(): undefined { return undefined; }
  unit();
  return undefined;
}`,
      expected: 1,
    },
    {
      name: "a direct rebinding",
      source: `type Run = () => undefined;
function outer(replacement: Run): undefined {
  function unit(): undefined { return undefined; }
  unit = replacement;
  unit();
  return undefined;
}`,
      expected: 1,
    },
    {
      name: "a destructured rebinding",
      source: `type Source = { readonly unit: () => undefined };
function outer(source: Source): undefined {
  function unit(): undefined { return undefined; }
  ({ unit } = source);
  unit();
  return undefined;
}`,
      expected: 1,
    },
    {
      name: "a for-of target rebinding",
      source: `type Run = () => undefined;
function outer(replacements: readonly Run[]): undefined {
  function unit(): undefined { return undefined; }
  for (unit of replacements) {}
  unit();
  return undefined;
}`,
      expected: 1,
    },
    {
      name: "a call outside the declaring function body",
      source: `function first(): undefined {
  function unit(): undefined { return undefined; }
  unit();
  return undefined;
}
function second(): undefined { unit(); return undefined; }`,
      expected: 2,
    },
    {
      name: "a default-parameter call outside the owner block",
      source: `function outer(value = unit()): undefined {
  function unit(): undefined { return undefined; }
  unit();
  return value;
}`,
      expected: 1,
    },
    {
      name: "a JSX value reference",
      source: `function outer(): undefined {
  function Unit(): undefined { return undefined; }
  const view = <Unit />;
  Unit();
  return undefined;
}`,
      expected: 1,
      filename: "/repo/src/domain/effects_purity.tsx",
    },
    {
      name: "a direct eval identifier",
      source: `function outer(): undefined {
  function unit(): undefined { return undefined; }
  const changed = eval("unit = () => 7");
  unit();
  return changed;
}`,
      expected: 1,
    },
    {
      name: "a wrapped eval identifier",
      source: `function outer(): undefined {
  function unit(): undefined { return undefined; }
  const changed = (0, eval)("unit = () => 7");
  unit();
  return changed;
}`,
      expected: 1,
    },
    {
      name: "a with statement",
      source: `function outer(scope: object): undefined {
  function unit(): undefined { return undefined; }
  with (scope) { const value = 1; }
  unit();
  return undefined;
}`,
      expected: 1,
    },
  ] as const
) {
  Deno.test(`no-discarded-values: ${testCase.name} stays diagnosed`, () => {
    assertRuleCount(
      "light-fp/no-discarded-values",
      testCase.source,
      testCase.expected,
      "filename" in testCase ? testCase.filename : DOMAIN,
    );
  });
}

for (
  const testCase of [
    ["number", `function unit(): number { return 1; }`],
    ["unknown", `function unit(): unknown { return undefined; }`],
    [
      "Promise",
      `function unit(): Promise<undefined> { return Promise.resolve(undefined); }`,
    ],
    [
      "Result",
      `type Result = { readonly ok: boolean }; function unit(): Result { return { ok: true }; }`,
    ],
  ] as const
) {
  Deno.test(`no-discarded-values: an ignored ${testCase[0]} remains diagnosed`, () => {
    assertRuleCount(
      "light-fp/no-discarded-values",
      `function outer(): undefined { ${
        testCase[1]
      } unit(); return undefined; }`,
      1,
    );
  });
}

Deno.test("no-discarded-values: native and custom push calls remain diagnosed", () => {
  for (
    const source of [
      `function outer(values: number[]): undefined { values.push(1); return undefined; }`,
      `type Result = { readonly ok: boolean };
type Custom = { readonly push: () => Result };
function outer(target: Custom): undefined { target.push(); return undefined; }`,
    ]
  ) {
    assertRuleCount("light-fp/no-discarded-values", source, 1);
  }
});

Deno.test("no-discarded-values: super() is required constructor work", () => {
  assertRuleCount(
    "light-fp/no-discarded-values",
    `class Child extends Parent { constructor() { super(); } }`,
    0,
  );
});

Deno.test("no-discarded-values: state updates, directives, and yields are used", () => {
  for (
    const source of [
      `export const run = () => { let n = 0; n = 1; n += 1; n++; return n; };`,
      `export const run = () => { "use strict"; return 1; };`,
      `export function* values() { yield 1; }`,
    ]
  ) {
    assertRuleCount("light-fp/no-discarded-values", source, 0);
  }
});

Deno.test("no-discarded-values: a later string literal is a discarded value", () => {
  assertRuleCount(
    "light-fp/no-discarded-values",
    `export const run = () => { const value = 1; "not a directive"; return value; };`,
    1,
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

// The README documents binding analysis as file-wide, not lexical: a local or
// imported binding with an ambient name makes that name local for the whole
// file. The existing cases all declare the binding before the use; these pin
// the two sharp edges of that approximation.

Deno.test("no-ambient-effects: a binding after the use still silences it", () => {
  assertRuleCount(
    "light-fp/no-ambient-effects",
    `const x = fetch("u");\nconst fetch = (u: string) => u;`,
    0,
  );
});

Deno.test("no-ambient-effects: a nested binding silences a top-level use", () => {
  assertRuleCount(
    "light-fp/no-ambient-effects",
    `export const f = () => fetch("u");\nconst g = () => { const fetch = 1; return fetch; };`,
    0,
  );
});
