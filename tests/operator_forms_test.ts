import { assertEquals } from "@std/assert";
import { ADAPTER, check, diagnose, DOMAIN, fires, silent } from "./harness.ts";

check("operator-forms", [
  // Loose equality.
  {
    name: "loose equality",
    source: `export const a = (x: number, y: number): boolean => x == y;`,
    expect: fires("operator-forms"),
  },
  {
    name: "loose inequality",
    source: `export const a = (x: number, y: number): boolean => x != y;`,
    expect: fires("operator-forms"),
  },
  {
    name: "strict equality is fine",
    source:
      `export const a = (x: number, y: number): boolean => x === y || x !== y;`,
    expect: silent,
  },
  // Update expressions.
  {
    name: "a postfix increment",
    source: `function f(): void { let i = 0; i++; }`,
    expect: fires("operator-forms"),
  },
  {
    name: "a prefix decrement",
    source: `function f(): void { let i = 0; --i; }`,
    expect: fires("operator-forms"),
  },
  {
    name: "an increment inside an expression reports once",
    source: `function f(): number { let i = 0; const j = i++; return j; }`,
    expect: fires("operator-forms"),
  },
  // Compound and logical assignment.
  {
    name: "a compound assignment",
    source: `function f(): void { let i = 0; i += 1; }`,
    expect: fires("operator-forms"),
  },
  {
    name: "an exponent assignment",
    source: `function f(): void { let i = 2; i **= 2; }`,
    expect: fires("operator-forms"),
  },
  {
    name: "an unsigned shift assignment",
    source: `function f(): void { let i = 2; i >>>= 1; }`,
    expect: fires("operator-forms"),
  },
  {
    name: "a logical and assignment",
    source: `function f(a: boolean): void { let i = a; i &&= a; }`,
    expect: fires("operator-forms"),
  },
  {
    name: "a logical or assignment",
    source: `function f(a: boolean): void { let i = a; i ||= a; }`,
    expect: fires("operator-forms"),
  },
  {
    name: "a nullish assignment",
    source: `function f(a: number | undefined): void { let i = a; i ??= 1; }`,
    expect: fires("operator-forms"),
  },
  {
    name:
      "a compound assignment in expression position reports the operator and the position",
    source: `function f(): void { let n = 1; const m = (n += 2); run(m); }`,
    expect: fires("operator-forms", 2),
  },
  {
    name: "a plain assignment statement is fine",
    source: `function f(): void { let i = 0; i = 1; }`,
    expect: silent,
  },
  // Assignment in expression position.
  {
    name: "an assignment as an initializer",
    source: `function f(): void { let n = 1; const m = (n = 2); run(m); }`,
    expect: fires("operator-forms"),
  },
  {
    name: "an assignment as an argument",
    source: `function f(): void { let x = 0; run(x = 1); }`,
    expect: fires("operator-forms"),
  },
  {
    name: "the inner assignment of a chain",
    source:
      `function f(c: number): void { let a = 0; let b = 0; a = b = c; run(a); }`,
    expect: fires("operator-forms"),
  },
  {
    name: "an assignment as an arrow body",
    source: `function f(): void { let x = 0; run(() => (x = 1)); }`,
    expect: fires("operator-forms"),
  },
  {
    name: "an assignment in a for loop belongs to statement-forms",
    source:
      `function f(): void { let i = 0; for (i = 0; i < 3; i = i + 1) { run(i); } }`,
    expect: silent,
  },
  {
    name: "assignments in a sequence belong to the sequence check",
    source: `function f(): void { let a = 0; let b = 0; a = 1, b = 2; }`,
    expect: fires("operator-forms"),
  },
  // Impure assignment targets.
  {
    name: "a call in a computed key",
    source: `function f(xs: number[]): void { xs[next()] = 1; }`,
    expect: fires("operator-forms"),
  },
  {
    name: "a call as the object of a target",
    source: `function f(): void { get().x = 1; }`,
    expect: fires("operator-forms"),
  },
  {
    name: "an increment in a computed key reports the update and the target",
    source: `function f(xs: number[]): void { let i = 0; xs[i++] = 1; }`,
    expect: fires("operator-forms", 2),
  },
  {
    name: "a call in an update target reports the update and the target",
    source: `function f(xs: number[]): void { xs[next()]++; }`,
    expect: fires("operator-forms", 2),
  },
  {
    name: "an await in a computed key",
    source:
      `async function f(xs: number[]): Promise<void> { xs[await key()] = 1; }`,
    expect: fires("operator-forms"),
  },
  {
    name: "a tagged template in a target reports the template and the target",
    source: "function f(): void { tag`x`.y = 1; }",
    expect: fires("operator-forms", 2),
  },
  {
    name: "a new expression in a target reports the new and the target",
    source: `function f(): void { new Box().x = 1; }`,
    expect: fires("operator-forms", 2),
  },
  {
    name: "a pure target is fine",
    source:
      `function f(xs: number[], i: number): void { xs[i + 1] = 1; xs.a.b = 2; }`,
    expect: silent,
  },
  {
    name: "a call in the assigned value is fine",
    source: `function f(xs: number[]): void { xs[0] = next(); }`,
    expect: silent,
  },
  // instanceof and in.
  {
    name: "instanceof",
    source: `export const a = (x: unknown): boolean => x instanceof Foo;`,
    expect: fires("operator-forms"),
  },
  {
    name: "a literal field query in a concise arrow body",
    source: `export const a = (o: object): boolean => "k" in o;`,
    expect: silent,
  },
  {
    name: "a literal field query returned from a function body",
    source:
      `export function hasKind(o: object): boolean { return "kind" in o; }`,
    expect: silent,
  },
  {
    name: "a negated literal field query in a function body",
    source:
      `export function lacksKind(o: object): boolean { return !("kind" in o); }`,
    expect: silent,
  },
  {
    name: "a stored literal field query in a function body",
    source:
      `export function hasKind(o: object): boolean { const present = "kind" in o; return present; }`,
    expect: silent,
  },
  {
    name: "a literal field query in a function expression body",
    source:
      `const hasKind = function (o: object): boolean { return "kind" in o; };`,
    expect: silent,
  },
  {
    name: "the seven fixed shape queries after an object narrowing",
    source: `export function hasRequiredFields(input: unknown): boolean {
  if (typeof input !== "object" || input === null) return false;
  return "element" in input && "key" in input && "value" in input &&
    "inner" in input && "inner" in input && "base" in input &&
    "predicate" in input;
}`,
    expect: silent,
  },
  {
    name: "a literal field query at module scope",
    source: `const present = "kind" in input;`,
    expect: fires("operator-forms"),
  },
  {
    name: "a literal field query in a parameter default",
    source:
      `function f(input: object, present = "kind" in input): boolean { return present; }`,
    expect: fires("operator-forms"),
  },
  {
    name: "a nested function default inside an outer body",
    source: `function outer(input: object): boolean {
  function inner(present = "kind" in input): boolean { return present; }
  return inner();
}`,
    expect: fires("operator-forms"),
  },
  {
    name: "a literal field query in a static block",
    source: `function outer(input: object): undefined {
  class C { static { const present = "kind" in input; use(present); } }
  return undefined;
}`,
    expect: fires("operator-forms"),
  },
  {
    name: "a literal field query in a class field initializer",
    source: `function outer(input: object): undefined {
  class C { present = "kind" in input; }
  return undefined;
}`,
    expect: fires("operator-forms"),
  },
  {
    name: "a literal field query in a function nested in a static block",
    source: `class C { static {
  function hasKind(input: object): boolean { return "kind" in input; }
  use(hasKind);
} }`,
    expect: silent,
  },
  {
    name: "a dynamic identifier key",
    source:
      `function has(input: object, key: string): boolean { return key in input; }`,
    expect: fires("operator-forms"),
  },
  {
    name: "a computed member key",
    source:
      `function has(input: object, keys: readonly string[]): boolean { return keys[0] in input; }`,
    expect: fires("operator-forms"),
  },
  {
    name: "a template key",
    source: "function has(input: object): boolean { return `kind` in input; }",
    expect: fires("operator-forms"),
  },
  {
    name: "a numeric key",
    source: `function has(input: object): boolean { return 0 in input; }`,
    expect: fires("operator-forms"),
  },
  {
    name: "a symbol key",
    source:
      `function has(input: object): boolean { return Symbol.iterator in input; }`,
    expect: fires("operator-forms"),
  },
  // Unary operators.
  {
    name: "unary plus",
    source: `export const a = (x: string): number => +x;`,
    expect: fires("operator-forms"),
  },
  {
    name: "void",
    source: `export const a = (x: number): undefined => void x;`,
    expect: fires("operator-forms"),
  },
  {
    name: "delete",
    source: `function f(o: { a?: number }): void { delete o.a; }`,
    expect: fires("operator-forms"),
  },
  {
    name: "negation, not, bitwise not, and typeof are fine",
    source: `export const a = (x: number): unknown => [-x, !x, ~x, typeof x];`,
    expect: silent,
  },
  // new and regex.
  {
    name: "a new expression",
    source: `export const a = (): unknown => new Foo();`,
    expect: fires("operator-forms"),
  },
  {
    name: "a new expression with type arguments",
    source: `export const a = (): unknown => new Map<string, string>();`,
    expect: fires("operator-forms"),
  },
  {
    name: "a regex literal",
    source: `export const a = (s: string): boolean => /a+/g.test(s);`,
    expect: fires("operator-forms"),
  },
  {
    name: "new RegExp reports the new only",
    source: `export const a = (): unknown => new RegExp("a+");`,
    expect: fires("operator-forms"),
  },
  {
    name: "the RegExp name without new belongs to ambient-names",
    source: `export const a = (): unknown => RegExp("a+");`,
    expect: silent,
  },
  {
    name: "a string and a number literal are fine",
    source: `export const a = (): unknown => ["/a/", 1, true, null];`,
    expect: silent,
  },
  // Sequence and tagged templates.
  {
    name: "a sequence expression",
    source: `function f(): void { (a(), b()); }`,
    expect: fires("operator-forms"),
  },
  {
    name: "a sequence in a for loop belongs to statement-forms",
    source:
      `function f(): void { let i = 0; let j = 0; for (i = 0, j = 1; i < 3; i = i + 1, j = j + 1) { run(i); } }`,
    expect: silent,
  },
  {
    name: "a tagged template",
    source: "export const a = (): unknown => tag`x`;",
    expect: fires("operator-forms"),
  },
  {
    name: "an untagged template is fine",
    source: "export const a = (): string => `x`;",
    expect: silent,
  },
  // Optional forms.
  {
    name: "an optional call",
    source: `function f(g: (() => void) | undefined): void { g?.(); }`,
    expect: fires("operator-forms"),
  },
  {
    name: "an optional call of a member",
    source: `function f(a: { b?: () => void }): void { a.b?.(); }`,
    expect: fires("operator-forms"),
  },
  {
    name: "an optional member and a plain call is fine",
    source: `function f(a: { b: () => void } | undefined): void { a?.b(); }`,
    expect: silent,
  },
  {
    name: "an optional computed access",
    source: `export const a = (xs: number[] | undefined): unknown => xs?.[0];`,
    expect: fires("operator-forms"),
  },
  {
    name: "a plain call after an optional chain is fine",
    source:
      `function f(a: { b: { c: () => void } } | undefined): void { a?.b.c(); }`,
    expect: silent,
  },
  {
    name: "a call of a parenthesized optional member is fine",
    source: `function f(a: { b: () => void } | undefined): void { (a?.b)(); }`,
    expect: silent,
  },
  {
    name: "an optional call after an optional member reports once",
    source: `function f(a: { b?: () => void } | undefined): void { a?.b?.(); }`,
    expect: fires("operator-forms"),
  },
  {
    name: "a plain computed access after an optional member is fine",
    source:
      `export const a = (x: { b: number[] } | undefined): unknown => x?.b[0];`,
    expect: silent,
  },
  {
    name: "a computed access after an optional computed access reports once",
    source:
      `export const a = (xs: number[][] | undefined): unknown => xs?.[0][1];`,
    expect: fires("operator-forms"),
  },
  {
    name: "an optional member read is fine",
    source: `export const a = (x: { b: number } | undefined): unknown => x?.b;`,
    expect: silent,
  },
  // Nested conditionals.
  {
    name: "a conditional in the alternate arm",
    source:
      `export const a = (x: number): number => x === 1 ? 1 : x === 2 ? 2 : 3;`,
    expect: fires("operator-forms"),
  },
  {
    name: "a conditional in the consequent arm",
    source:
      `export const a = (x: number): number => x === 1 ? (x === 2 ? 1 : 2) : 3;`,
    expect: fires("operator-forms"),
  },
  {
    name: "a conditional in both arms reports twice",
    source:
      `export const a = (x: number): number => x === 1 ? (x === 2 ? 1 : 2) : x === 3 ? 3 : 4;`,
    expect: fires("operator-forms", 2),
  },
  {
    name: "a conditional in the test position is fine",
    source:
      `export const a = (x: number): number => (x === 1 ? true : false) ? 1 : 2;`,
    expect: silent,
  },
  {
    name: "a single conditional is fine",
    source: `export const a = (x: number): number => x === 1 ? 1 : 2;`,
    expect: silent,
  },
  // Comparison with a boolean literal.
  {
    name: "strict equality with true",
    source: `export const a = (x: boolean): boolean => x === true;`,
    expect: fires("operator-forms"),
  },
  {
    name: "strict inequality with false on the left",
    source: `export const a = (x: boolean): boolean => false !== x;`,
    expect: fires("operator-forms"),
  },
  {
    name: "loose equality with true reports the operator and the literal",
    source: `export const a = (x: boolean): boolean => x == true;`,
    expect: fires("operator-forms", 2),
  },
  {
    name: "a comparison with a number is fine",
    source: `export const a = (x: number): boolean => x === 1;`,
    expect: silent,
  },
  // Layers.
  {
    name: "an adapter file is exempt",
    source:
      `x == 1; x++; x += 1; f(x = 1); +x; new X(); /a/; (a, b); tag\`x\`; f?.(); xs?.[0];`,
    filename: ADAPTER,
    expect: silent,
  },
  {
    name: "a prelude file is exempt",
    source:
      `// @light-fp prelude\nx == 1; x++; x += 1; f(x = 1); +x; new X(); /a/; (a, b); tag\`x\`; f?.(); xs?.[0];`,
    expect: silent,
  },
]);

const messagesOf = (source: string): readonly string[] =>
  diagnose(source, DOMAIN)
    .filter((d) => d.id === "light-fp/operator-forms")
    .map((d) => d.message);

Deno.test("operator-forms: loose equality gets the coercion message", () => {
  assertEquals(
    messagesOf(`export const a = (x: number, y: number): boolean => x == y;`),
    ["Loose equality coerces its operands."],
  );
});

Deno.test("operator-forms: a refused in query gets the boundary message", () => {
  assertEquals(messagesOf(`const present = "kind" in input;`), [
    "`in` is allowed only for a string-literal field query inside a function body.",
  ]);
});

Deno.test("operator-forms: an increment gets the update message", () => {
  assertEquals(messagesOf(`function f(): void { let i = 0; i++; }`), [
    "`++` and `--` change a binding inside an expression.",
  ]);
});

const ruleCount = (rule: string, source: string): number =>
  diagnose(source, DOMAIN).filter((diagnostic) =>
    diagnostic.id === `light-fp/${rule}`
  ).length;

Deno.test("operator-forms: independent safeguards remain active", () => {
  const ambient =
    `export function hasHome(): boolean { return "HOME" in Deno.env; }`;
  assertEquals([
    ruleCount("operator-forms", ambient),
    ruleCount("no-ambient-effects", ambient),
    ruleCount("ambient-names", ambient),
  ], [0, 1, 1]);

  const unsafeAny =
    `export function hasKind(input: any): boolean { return "kind" in input; }`;
  assertEquals([
    ruleCount("operator-forms", unsafeAny),
    ruleCount("no-unsafe-cast", unsafeAny),
  ], [0, 1]);

  const unsafeCast =
    `export function hasKind(input: unknown): boolean { return "kind" in (input as object); }`;
  assertEquals([
    ruleCount("operator-forms", unsafeCast),
    ruleCount("no-unsafe-cast", unsafeCast),
  ], [0, 1]);

  const mutableData =
    `type Input = { value: string }; export function hasValue(input: Input): boolean { return "value" in input; }`;
  assertEquals([
    ruleCount("operator-forms", mutableData),
    ruleCount("readonly-data", mutableData),
  ], [0, 1]);

  const discarded =
    `export function probe(input: object): undefined { "kind" in input; return undefined; }`;
  assertEquals([
    ruleCount("operator-forms", discarded),
    ruleCount("no-discarded-values", discarded),
  ], [0, 1]);

  const forIn = `export function firstKey(input: object): string | undefined {
  for (const key in input) { return key; }
  return undefined;
}`;
  assertEquals([
    ruleCount("operator-forms", forIn),
    ruleCount("statement-forms", forIn),
  ], [0, 1]);
});

Deno.test("operator-forms: TypeScript retains the in right-hand boundary", async () => {
  const directory = await Deno.makeTempDir({ prefix: "light-fp-in-" });
  const acceptedPath = `${directory}/accepted.ts`;
  const refusedPath = `${directory}/refused.ts`;
  try {
    await Deno.writeTextFile(
      acceptedPath,
      `export function hasKind(input: unknown): boolean {
  if (typeof input !== "object" || input === null) return false;
  return "kind" in input;
}
`,
    );
    await Deno.writeTextFile(
      refusedPath,
      `declare const unknownValue: unknown;
declare const nullValue: null;
declare const primitiveValue: string;
"kind" in unknownValue;
"kind" in nullValue;
"kind" in primitiveValue;
`,
    );
    const check = async (path: string): Promise<Deno.CommandOutput> =>
      await new Deno.Command(Deno.execPath(), {
        args: [
          "check",
          "--cached-only",
          "--frozen",
          "--no-config",
          "--no-lock",
          path,
        ],
        stdout: "null",
        stderr: "piped",
      }).output();
    const accepted = await check(acceptedPath);
    assertEquals(accepted.success, true);

    const refused = await check(refusedPath);
    const errors = new TextDecoder().decode(refused.stderr);
    assertEquals(refused.success, false);
    assertEquals(errors.includes("TS18046"), true);
    assertEquals(errors.includes("TS18047"), true);
    assertEquals(errors.includes("TS2322"), true);
  } finally {
    await Deno.remove(directory, { recursive: true });
  }
});

Deno.test("operator-forms: literal in retains HasProperty semantics", () => {
  const ownPresent = { field: 1 };
  const absent = {};
  const inheritedPresent = Object.create({ field: 1 });
  const nullPrototype = Object.create(null);
  Object.defineProperty(nullPrototype, "field", { value: 1 });

  assertEquals([
    "field" in ownPresent,
    "field" in absent,
    "field" in inheritedPresent,
    "field" in nullPrototype,
  ], [true, false, true, true]);
});

Deno.test("operator-forms: in does not read a getter and uses the Proxy has trap", () => {
  const getterEvents: string[] = [];
  const prototype = Object.defineProperty({}, "field", {
    get(): number {
      getterEvents.push("get:field");
      return 1;
    },
  });
  const inheritedGetter = Object.create(prototype);
  assertEquals("field" in inheritedGetter, true);
  assertEquals(getterEvents, []);

  const proxyEvents: string[] = [];
  const proxy = new Proxy({}, {
    has(_target, key): boolean {
      proxyEvents.push(`has:${String(key)}`);
      return true;
    },
    getOwnPropertyDescriptor(_target, key): PropertyDescriptor | undefined {
      proxyEvents.push(`own:${String(key)}`);
      return undefined;
    },
  });
  assertEquals("field" in proxy, true);
  assertEquals(proxyEvents, ["has:field"]);

  proxyEvents.length = 0;
  assertEquals(Object.hasOwn(proxy, "field"), false);
  assertEquals(proxyEvents, ["own:field"]);
});
