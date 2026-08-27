import { assertThrows } from "@std/assert";
import plugin from "../src/mod.ts";
import { check } from "./harness.ts";

type Fixture = Readonly<{
  readonly name: string;
  readonly source: string;
}>;

const fixtures: readonly Fixture[] = [
  {
    name: "decorators, accessors, and generators",
    source: `
function sealed<T extends Function>(value: T): T { return value; }

@sealed
class Decorated {
  accessor value = 1;
  get doubled(): number { return this.value * 2; }
  set doubled(value: number) { this.value = value / 2; }
  *entries(): Generator<number> { yield this.value; }
}

export const decorated = Decorated;
`,
  },
  {
    name: "using declarations and explicit resource management",
    source: `
type Resource = { readonly [Symbol.dispose]: () => void };
declare const acquire: () => Resource;

export const useResource = (): Resource => {
  using resource = acquire();
  return resource;
};
`,
  },
  {
    name: "ambient declarations",
    source: `
export {};

declare global {
  interface Window { readonly injected: string }
  var externalName: string;
}

declare module "external-package" {
  export interface Port { run(): void }
}

declare namespace ExternalNamespace {
  const value: string;
}

declare class ExternalClass { readonly value: string }
`,
  },
  {
    name: "odd TypeScript type nodes",
    source: `
type Box<T> = { readonly value: T };
type Unboxed<T> = T extends Box<infer U> ? U : never;
type Accessors<T> = {
  readonly [K in keyof T as \`get\${Capitalize<string & K>}\`]-?: () => T[K];
};

const tuple = [1, "x"] as const satisfies readonly [number, string];
export const identity = <const T>(value: T): T => value;
export const first = <T,>(values: readonly T[]): T | undefined => values[0];
export type Example = Accessors<{ readonly name: string }> &
  Box<Unboxed<Box<number>>>;
export { tuple };
`,
  },
  {
    name: "async generators and labeled control flow",
    source: `
export async function* stream(
  values: readonly number[],
): AsyncGenerator<number> {
  outer: for (const value of values) {
    if (value < 0) continue outer;
    yield await Promise.resolve(value);
  }
}
`,
  },
];

const layers = [
  {
    name: "domain",
    filename: "/repo/src/domain/robustness.ts",
    pragma: "",
  },
  {
    name: "adapter",
    filename: "/repo/src/domain/robustness.ts",
    pragma: "// @light-fp adapter\n",
  },
  {
    name: "prelude",
    filename: "/repo/src/domain/robustness.ts",
    pragma: "// @light-fp prelude\n",
  },
] as const;

Deno.test("harness: rejects unknown and mismatched ids before registering", () => {
  assertThrows(
    () => check("no-thrwo", []),
    Error,
    "Unknown light-fp rule id",
  );

  assertThrows(
    () =>
      check("no-throw", [{
        name: "mismatched expectation",
        source: "export const value = 1;",
        expect: ["pure-module"],
      }]),
    Error,
    "belongs to light-fp/no-throw but expects light-fp/pure-module",
  );
});

for (const [ruleId, rule] of Object.entries(plugin.rules)) {
  const singleRulePlugin: Deno.lint.Plugin = {
    name: `light-fp-robustness-${ruleId}`,
    rules: { [ruleId]: rule },
  };

  for (const layer of layers) {
    Deno.test(
      `robustness: ${ruleId} does not throw on unusual ${layer.name} syntax`,
      () => {
        for (const fixture of fixtures) {
          try {
            Deno.lint.runPlugin(
              singleRulePlugin,
              layer.filename,
              `${layer.pragma}${fixture.source}`,
            );
          } catch (cause) {
            throw new Error(
              `${ruleId} threw on ${fixture.name} in the ${layer.name} layer`,
              { cause },
            );
          }
        }
      },
    );
  }
}
