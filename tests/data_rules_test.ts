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

Deno.test("no-oo: ambient classes stay silent", () => {
  assertEquals(
    diagnosticsFor("no-oo", `declare class External { value: string }`).map(
      (diagnostic) => diagnostic.message,
    ),
    [],
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
