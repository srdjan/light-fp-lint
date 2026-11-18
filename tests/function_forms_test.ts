import { assertEquals } from "@std/assert";
import { ADAPTER, check, diagnose, DOMAIN, fires, silent } from "./harness.ts";

check("function-forms", [
  // Function expressions.
  {
    name: "an anonymous function expression as an argument",
    source: `run(function (x: number): number { return x; });`,
    expect: fires("function-forms"),
  },
  {
    name: "a named function expression as an argument",
    source: `run(function step(x: number): number { return x; });`,
    expect: fires("function-forms"),
  },
  {
    name: "a function expression in an object field",
    source: `const o = { run: function (x: number): number { return x; } };`,
    expect: fires("function-forms"),
  },
  {
    name: "a function expression bound to a const belongs to declaration-forms",
    source: `const f = function (x: number): number { return x; };`,
    expect: silent,
  },
  {
    name: "an object method belongs to record-forms",
    source: `const o = { run(x: number): number { return x; } };`,
    expect: silent,
  },
  {
    name: "an object getter belongs to no-oo",
    source: `const o = { get value(): number { return 1; } };`,
    expect: silent,
  },
  {
    name: "a class method belongs to no-oo",
    source: `class C { run(x: number): number { return x; } }`,
    expect: silent,
  },
  {
    name: "an arrow as a callback is fine",
    source: `run((x: number): number => x);`,
    expect: silent,
  },
  // Generators.
  {
    name: "a generator declaration reports once, not for each yield",
    source: `function* g(): number { yield 1; yield 2; }`,
    expect: fires("function-forms"),
  },
  {
    name: "a generator function expression reports once",
    source: `run(function* (): number { yield 1; });`,
    expect: fires("function-forms"),
  },
  {
    name: "a generator function expression bound to a const reports once",
    source: `const g = function* (): number { yield 1; };`,
    expect: fires("function-forms"),
  },
  // Default parameters.
  {
    name: "a default parameter of a declaration",
    source: `function f(a: number = 1): number { return a; }`,
    expect: fires("function-forms"),
  },
  {
    name: "a default parameter of an arrow",
    source: `run((a: number = 1): number => a);`,
    expect: fires("function-forms"),
  },
  {
    name: "two default parameters report twice",
    source:
      `function f(a: number = 1, b: number = 2): number { return a + b; }`,
    expect: fires("function-forms", 2),
  },
  {
    name: "a union with undefined and a body fallback is fine",
    source:
      `function f(a: number | undefined): number { const resolved = a ?? 1; return resolved; }`,
    expect: silent,
  },
  // Optional parameters.
  {
    name: "an optional parameter of a declaration",
    source: `function f(a?: number): number { return a ?? 1; }`,
    expect: fires("function-forms"),
  },
  {
    name: "an optional parameter of an arrow",
    source: `run((a?: number): number => a ?? 1);`,
    expect: fires("function-forms"),
  },
  {
    name: "an optional parameter of a declared function",
    source: `declare function f(a?: number): number;`,
    expect: fires("function-forms"),
  },
  {
    name: "an optional parameter of a function type",
    source: `type F = (a?: number) => number;`,
    expect: fires("function-forms"),
  },
  {
    name: "an optional parameter of a method signature",
    source: `type P = { run(a?: number): number };`,
    expect: fires("function-forms"),
  },
  {
    name: "an optional parameter of a call signature",
    source: `type P = { (a?: number): number };`,
    expect: fires("function-forms"),
  },
  {
    name: "an optional parameter of a construct signature",
    source: `type P = { new (a?: number): P };`,
    expect: fires("function-forms"),
  },
  {
    name: "an optional positional pattern parameter of a declared function",
    source: `declare function f([a]?: readonly [number]): number;`,
    expect: fires("function-forms"),
  },
  {
    name: "an optional object pattern parameter of a declared function",
    source: `declare function f({ a }?: { a: number }): number;`,
    expect: fires("function-forms"),
  },
  {
    name: "an optional object property is fine",
    source: `type P = { readonly a?: string };`,
    expect: silent,
  },
  // Rest parameters.
  {
    name: "a rest parameter of a declaration",
    source:
      `function f(...rest: readonly number[]): number { return rest.length; }`,
    expect: fires("function-forms"),
  },
  {
    name: "a rest parameter of an arrow",
    source: `run((...rest: readonly number[]): number => rest.length);`,
    expect: fires("function-forms"),
  },
  {
    name: "a rest parameter of a declared function",
    source: `declare function f(...rest: readonly number[]): number;`,
    expect: fires("function-forms"),
  },
  {
    name: "a rest parameter of a function type",
    source: `type F = (...rest: readonly number[]) => number;`,
    expect: fires("function-forms"),
  },
  {
    name: "a rest parameter of a method signature",
    source: `type P = { run(...rest: readonly number[]): number };`,
    expect: fires("function-forms"),
  },
  {
    name: "an explicit array parameter is fine",
    source:
      `function f(rest: readonly number[]): number { return rest.length; }`,
    expect: silent,
  },
  // Call-site spread.
  {
    name: "a spread argument of a call",
    source: `f(...xs);`,
    expect: fires("function-forms"),
  },
  {
    name: "a spread argument of a new expression",
    source: `new F(...xs);`,
    expect: fires("function-forms"),
  },
  {
    name: "a spread among positional arguments",
    source: `f(a, ...xs, b);`,
    expect: fires("function-forms"),
  },
  {
    name: "an array literal spread is fine",
    source: `const ys = [...xs, 1];`,
    expect: silent,
  },
  {
    name: "an object literal spread is fine",
    source: `const o = { ...base, a: 1 };`,
    expect: silent,
  },
  // Signature annotations.
  {
    name: "a declaration with an unannotated parameter",
    source: `function f(a): number { return 1; }`,
    expect: fires("function-forms"),
  },
  {
    name: "a declaration without a return type",
    source: `function f(a: number) { return a; }`,
    expect: fires("function-forms"),
  },
  {
    name: "an exported declaration without any annotation",
    source: `export function f(a, b) { return a; }`,
    expect: fires("function-forms"),
  },
  {
    name: "a nested declaration without a return type",
    source:
      `function g(): number { function f(a: number) { return a; } return f(1); }`,
    expect: fires("function-forms"),
  },
  {
    name: "a declaration lacking both annotations reports once",
    source: `function f(a, b) { return a; }`,
    expect: fires("function-forms"),
  },
  {
    name: "a fully annotated declaration is fine",
    source: `export function f(a: number, b: string): number { return a; }`,
    expect: silent,
  },
  {
    name: "a declaration without parameters needs only a return type",
    source: `function f(): number { return 1; }`,
    expect: silent,
  },
  {
    name: "an unannotated arrow is exempt",
    source: `run((a) => a);`,
    expect: silent,
  },
  {
    name: "an unannotated object pattern parameter",
    source: `function f({ a }): number { return 1; }`,
    expect: fires("function-forms"),
  },
  // Layers.
  {
    name: "an adapter file is exempt",
    source: `function* g(a = 1, b?: number, ...c) { f(...c); }`,
    filename: ADAPTER,
    expect: silent,
  },
  {
    name: "a prelude file is exempt",
    source:
      `// @light-fp prelude\nfunction* g(a = 1, b?: number, ...c) { f(...c); }`,
    expect: silent,
  },
]);

const messagesOf = (source: string): readonly string[] =>
  diagnose(source, DOMAIN)
    .filter((d) => d.id === "light-fp/function-forms")
    .map((d) => d.message);

Deno.test("function-forms: a generator expression gets the generator message", () => {
  assertEquals(messagesOf(`run(function* (): number { yield 1; });`), [
    "A generator keeps state between calls.",
  ]);
});

Deno.test("function-forms: a function expression gets the expression message", () => {
  assertEquals(messagesOf(`run(function (): number { return 1; });`), [
    "A function expression hides the function from a reader who scans for declarations.",
  ]);
});
