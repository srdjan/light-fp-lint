import { assertEquals } from "@std/assert";
import plugin from "../src/mod.ts";
import { ADAPTER, DOMAIN } from "./harness.ts";

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
  // Deno 2.2 types `fix` as a single edit and later versions as an edit array,
  // so the assertion reads "no rewrite offered" without depending on either
  // shape. That is the contract, unlike the plain-interface case.
  const { fix } = found[0];
  const offersFix = Array.isArray(fix) ? fix.length > 0 : fix !== undefined;
  assertEquals(offersFix, false);
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

const redundantWrapper = (source: string): number =>
  diagnosticsFor("readonly-data", source).filter((diagnostic) =>
    diagnostic.message.includes("redundant")
  ).length;

Deno.test("readonly-data: members of a Readonly<{}> literal count as readonly", () => {
  const sources = [
    `type A = Readonly<{ a: string; b: number }>;`,
    `type A = Readonly<{ [k: string]: string }>;`,
    `type A = Readonly<{ a: string; load(): void }>;`,
    `interface Box { readonly item: Readonly<{ a: string }> }`,
  ];
  for (const source of sources) {
    const members = diagnosticsFor("readonly-data", source).filter(
      (diagnostic) => !diagnostic.message.includes("redundant"),
    );
    assertEquals(members.length, 0, source);
  }
});

Deno.test("readonly-data: Readonly is shallow, so nested plain literals still report", () => {
  const source = `type A = Readonly<{ a: { b: string } }>;`;
  const members = diagnosticsFor("readonly-data", source).filter(
    (diagnostic) => !diagnostic.message.includes("redundant"),
  );
  assertEquals(members.length, 1);
});

Deno.test("readonly-data: an outer Readonly around a pure data literal is redundant", () => {
  const reported = [
    `type A = Readonly<{ a: string }>;`,
    `type A = Readonly<{ readonly a: string }>;`,
    `type A = Readonly<{ [k: string]: string }>;`,
    `type A = Readonly<{ a: Readonly<{ b: string }> }>;`,
    `interface A { readonly a: Readonly<{ b: string }> }`,
  ];
  for (const source of reported) {
    assertEquals(
      redundantWrapper(source) > 0,
      true,
      source,
    );
  }
});

Deno.test("readonly-data: Readonly stays unreported when the rewrite would change the type", () => {
  const silent = [
    `type A = Readonly<{ a: string; load(): void }>;`,
    `type A = Readonly<{ (x: string): void }>;`,
    `type A = Readonly<{ new (x: string): A }>;`,
    `type A = Readonly<{ get a(): string }>;`,
    `type A = Readonly<SomeType>;`,
    `type A = Readonly<{ a: string } | { b: string }>;`,
    `type A = Readonly<Record<string, string>>;`,
    `type A = Readonly<{ a: string }, string>;`,
  ];
  for (const source of silent) {
    assertEquals(redundantWrapper(source), 0, source);
  }
});

Deno.test("readonly-data: the redundant wrapper respects the layer and callable gates", () => {
  const source = `type A = Readonly<{ a: string }>;`;
  assertEquals(redundantWrapper(`export type A = Readonly<{ a: string }>;`), 1);
  assertEquals(
    diagnosticsFor("readonly-data", source, ADAPTER).length,
    0,
    "adapter files are skipped",
  );
  assertEquals(
    redundantWrapper(
      `export const f = (input: Readonly<{ a: string }>) => input;`,
    ),
    0,
    "parameter annotations are outside the data policy",
  );
  assertEquals(
    redundantWrapper(`type H = (input: Readonly<{ a: string }>) => void;`),
    0,
    "callable types are outside the data policy",
  );
  assertEquals(
    redundantWrapper(`declare interface Amb { a: Readonly<{ b: string }> }`),
    0,
    "ambient declarations are skipped",
  );
});

const mutableCollectionReports = (
  source: string,
  filename = DOMAIN,
): readonly Deno.lint.Diagnostic[] =>
  diagnosticsFor("readonly-data", source, filename)
    .filter((diagnostic) => diagnostic.message.includes("is mutable"));

Deno.test("readonly-data: a module-local object alias named Map is not the built-in", () => {
  const source = `export type Map = {
    readonly kind: "map";
    readonly key: string;
    readonly value: string;
  };
export type Expression = string | Map;`;
  assertEquals(mutableCollectionReports(source).length, 0);
});

Deno.test("readonly-data: the built-in Map in a direct union stays reported", () => {
  assertEquals(
    mutableCollectionReports(
      `export type SnapshotMap = Map<string, number> | null;`,
    ).length,
    1,
  );
});

Deno.test("readonly-data: a built-in Map alias stays reported", () => {
  assertEquals(
    mutableCollectionReports(
      `type SnapshotMap = Map<string, { ok: boolean }>;`,
    ).length,
    1,
  );
});

Deno.test("readonly-data: a self-referential Map alias is not proof of the built-in", () => {
  assertEquals(
    mutableCollectionReports(`export type Map = Map<string, unknown>;`).length,
    1,
  );
});

Deno.test("readonly-data: an import-equals-only script has no module boundary", () => {
  const source = `import Map = Foo.Map;
type Expression = string | Map;`;
  assertEquals(mutableCollectionReports(source).length, 1);
});

Deno.test("readonly-data: a same-name import-equals collides with the alias", () => {
  const source = `export type Map = {
    readonly kind: "map";
    readonly key: string;
    readonly value: string;
  };
export import Map = Foo.Map;
export type Expression = string | Map;`;
  assertEquals(mutableCollectionReports(source).length, 1);
});

Deno.test("readonly-data: a nested-only Map alias does not suppress a module-level use", () => {
  const source = `function f() {
  type Map = { readonly kind: "map" };
}
export type Expression = string | Map;`;
  assertEquals(mutableCollectionReports(source).length, 1);
});

Deno.test("readonly-data: a value-only const Map does not suppress a type use", () => {
  const source = `const Map = { kind: "map" };
export type Expression = string | Map;`;
  assertEquals(mutableCollectionReports(source).length, 1);
});

Deno.test("readonly-data: duplicate root Map aliases stay reported", () => {
  const source = `type Map = { readonly kind: "map" };
type Map = { readonly other: number; };
export type Expression = string | Map;`;
  assertEquals(mutableCollectionReports(source).length, 1);
});

Deno.test("readonly-data: declaration order does not change the alias proof", () => {
  const before = `export type Map = {
    readonly kind: "map";
    readonly key: string;
    readonly value: string;
  };
export type Expression = string | Map;`;
  const after = `export type Expression = string | Map;
export type Map = {
    readonly kind: "map";
    readonly key: string;
    readonly value: string;
  };`;
  assertEquals(mutableCollectionReports(before).length, 0);
  assertEquals(mutableCollectionReports(after).length, 0);
});

Deno.test("readonly-data: mutable fields inside a local alias still report", () => {
  const source = `export type Map = {
    kind: string;
    readonly key: string;
  };
export type Expression = string | Map;`;
  assertEquals(mutableCollectionReports(source).length, 0);
  assertEquals(
    diagnosticsFor("readonly-data", source).filter((diagnostic) =>
      diagnostic.message === "Data properties are readonly."
    ).length,
    1,
  );
});
