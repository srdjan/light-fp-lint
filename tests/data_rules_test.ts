import { assertEquals } from "@std/assert";
import plugin from "../src/mod.ts";
import { DOMAIN } from "./harness.ts";

const diagnosticsFor = (
  rule: string,
  source: string,
  filename = DOMAIN,
): readonly Deno.lint.Diagnostic[] =>
  Deno.lint
    .runPlugin(plugin, filename, source)
    .filter((diagnostic) => diagnostic.id === `light-fp/${rule}`);

Deno.test("readonly-data: inline annotations are outside the data policy", () => {
  const source = `export const inspect = (input: {
    xs: string[];
    map: Map<string, string>;
    [key: string]: unknown;
  }) => input;`;
  assertEquals(diagnosticsFor("readonly-data", source).length, 0);
});

Deno.test("readonly-data: callable annotations stay outside the data policy", () => {
  const declarations = [
    `interface Port {
      load(input: { id: string }): { value: string };
    }`,
    `interface Port {
      load: (input: { id: string }) => { value: string };
    }`,
    `type Handler = (input: { id: string }) => { value: string };`,
    `type Factory = new (input: { id: string }) => { value: string };`,
    `interface Callable {
      (input: { id: string }): { value: string };
    }`,
    `interface Factory {
      new (input: { id: string }): { value: string };
    }`,
  ];

  for (const source of declarations) {
    assertEquals(diagnosticsFor("readonly-data", source).length, 0, source);
  }
});

Deno.test("readonly-data: declarations apply the policy at every data node", () => {
  const source = `type Data = {
    xs: string[];
    map: Map<string, string>;
    [key: string]: unknown;
  };`;
  assertEquals(diagnosticsFor("readonly-data", source).length, 5);
});

Deno.test("readonly-data: Array is a mutable collection", () => {
  const source = `type Data = { readonly xs: Array<string> };`;
  assertEquals(diagnosticsFor("readonly-data", source).length, 1);
});

Deno.test("data rules: ambient interfaces stay silent", () => {
  const declarations = [
    `declare interface Ambient {
      value: string[];
      [key: string]: Array<string>;
    }`,
    `export {}; declare global {
      interface Ambient {
        value: string[];
        [key: string]: Array<string>;
      }
    }`,
    `declare module "pkg" {
      interface Ambient {
        value: string[];
        [key: string]: Array<string>;
      }
    }`,
  ];
  for (const source of declarations) {
    assertEquals(diagnosticsFor("prefer-type-for-data", source).length, 0);
    assertEquals(diagnosticsFor("readonly-data", source).length, 0);
  }
});

Deno.test("prefer-type-for-data: construct signatures describe ports", () => {
  const source = `interface Factory { new (value: string): Factory }`;
  assertEquals(diagnosticsFor("prefer-type-for-data", source).length, 0);
});

Deno.test("prefer-type-for-data: an extending interface reports without a fix", () => {
  // `extends` has no type-alias equivalent that preserves declaration merging,
  // so the rule must not offer a rewrite it cannot perform correctly.
  const found = diagnosticsFor(
    "prefer-type-for-data",
    `interface Base { load(): Promise<string> }\ninterface User extends Base { readonly name: string }`,
  );
  assertEquals(found.length, 1);
  // The API represents an absent fix as an empty edit array; the contract is
  // that no rewrite is offered, unlike the plain-interface case.
  assertEquals(found[0].fix, []);
});

Deno.test("no-oo: ambient classes stay silent", () => {
  const declarations = [
    `declare class External { value: string }`,
    `declare module "pkg" { class External { value: string } }`,
    `export {}; declare global { class External { value: string } }`,
  ];

  for (const source of declarations) {
    assertEquals(diagnosticsFor("no-oo", source), [], source);
  }

  assertEquals(
    diagnosticsFor("no-oo", `namespace Internal { class Service {} }`).length,
    2,
  );
});

Deno.test("data rules: the prelude keeps structural data rules", () => {
  const source = `// @light-fp prelude
interface Data { value: string }
class Service {}`;
  assertEquals(diagnosticsFor("readonly-data", source).length, 1);
  assertEquals(diagnosticsFor("prefer-type-for-data", source).length, 1);
  assertEquals(diagnosticsFor("no-oo", source).length, 1);
});

Deno.test("no-unsafe-cast: the prelude keeps its cast exemption", () => {
  const source = `// @light-fp prelude
export const coerce = (value: unknown) => value as Foreign;`;
  assertEquals(diagnosticsFor("no-unsafe-cast", source).length, 0);
});

Deno.test("no-unsafe-cast: suppression syntax must start the comment", () => {
  const prose = `// Never write @ts-expect-error here
export const value = 1;`;
  const suppression = `// @ts-expect-error reason
export const value = 1;`;
  assertEquals(diagnosticsFor("no-unsafe-cast", prose).length, 0);
  assertEquals(diagnosticsFor("no-unsafe-cast", suppression).length, 1);
});
