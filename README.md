# @srdjan/light-fp-lint

[![Version](https://img.shields.io/badge/version-0.8.1-blue)](deno.json)
[![JSR](https://img.shields.io/badge/jsr-@srdjan%2Flight--fp--lint-black?logo=deno)](https://jsr.io/@srdjan/light-fp-lint)
[![License: MIT](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)

A Deno lint plugin for Light Functional Programming in TypeScript: module-scope
purity checks, explicit error-as-value conventions, readonly data declarations,
a hexagonal boundary between domain and adapters, and one spelling for each
construct, taken from the zts-model-1 TypeScript profile.

## Contents

- [What the gate guarantees](#what-the-gate-guarantees)
- [Quick start](#quick-start)
- [Local pre-commit hook](#local-pre-commit-hook)
- [Enforcement layers](#enforcement-layers)
- [Agent integration](#agent-integration)
- [Layers](#layers)
- [Rules](#rules)
- [Restriction rules](#restriction-rules)
- [Suppressing a rule](#suppressing-a-rule)
- [Adopting on an existing codebase](#adopting-on-an-existing-codebase)
- [Limits](#limits)
- [Development](#development)

## What the gate guarantees

For a file in the domain layer that reaches the plugin without a suppression,
the rules enforce this syntactic contract:

- module scope contains no mutable declaration, control flow, top-level await,
  bare expression statement, call, or tagged template;
- imports do not name a recognised adapter segment, and direct uses of the
  plugin's ambient-effect vocabulary are reported;
- explicit `throw`, `try`, and discarded values are reported;
- data declarations use readonly syntax;
- `as` expressions are limited to `as const` and top-level types declared in the
  same file; angle-bracket casts, non-null assertions, and `any` report; and
- the [restriction rules](#restriction-rules) hold: each construct has one
  spelling, and the file reads no global name outside a closed set.

The linter proves shapes. It cannot prove properties, so the gate has three legs
and needs all of them:

| Command      | Proves                                          |
| ------------ | ----------------------------------------------- |
| `deno lint`  | shapes: the rules in this plugin                |
| `deno check` | types: assignability and annotated return types |
| `deno test`  | whole-repo invariants: your own tests           |

Several rules exist to make the second column useful. `no-throw` removes
explicit exception syntax from unsuppressed domain code. `no-unsafe-cast`
removes most ways to overrule the checker, with the documented local-type
allowance for smart constructors.

## Quick start

Add the published JSR package to `deno.json`:

```jsonc
{
  "lint": {
    "plugins": ["jsr:@srdjan/light-fp-lint@^0.8.1"]
  }
}
```

### Repository development

When you develop this repository, load the plugin from its local source path:

```jsonc
{
  "lint": {
    "plugins": ["./src/mod.ts"]
  }
}
```

Run `deno lint`. Every file is treated as domain unless its header, test suffix,
or path says otherwise, so expect diagnostics on entry points and scripts on the
first run. Mark those as adapters:

```ts
// @light-fp adapter
```

Write a prelude module holding `Result` and the helpers that need to catch:

```ts
// @light-fp prelude
export type Result<E, A> =
  | { readonly _tag: "Ok"; readonly value: A }
  | { readonly _tag: "Err"; readonly error: E };

export const ok = <E, A>(value: A): Result<E, A> => ({ _tag: "Ok", value });
export const err = <E, A>(error: E): Result<E, A> => ({ _tag: "Err", error });

export const handleThrow = async <E, A>(
  run: () => Promise<A>,
  onError: (cause: unknown) => E,
): Promise<Result<E, A>> => {
  try {
    return ok(await run());
  } catch (cause) {
    return err(onError(cause));
  }
};
```

`handleThrow` is the example boundary. A throwing call goes in, a `Result` comes
out, and unsuppressed domain modules do not catch exceptions themselves.

See `examples/src/` for worked before-and-after pairs covering authentication,
validation, HTTP orchestration, persistence, and effect composition. Run
`deno task examples:lint` to see the diagnostics on the `.bad.ts` files; every
`.good.ts` file is clean, and a test enforces that.

## Layers

Deno's lint configuration cannot pass options to a plugin. `lint.plugins`
accepts strings only, and `RuleContext` has no `options` field. Layer resolution
therefore uses the source header and filename, plus `Deno.cwd()` only to strip
the launch directory from absolute paths.

A file's layer is resolved in this order:

1. **Header pragma.** Before the first statement, the first comment whose body
   starts with `@light-fp` and a token. `domain`, `adapter`, and `prelude` are
   valid. Any other or miscased token is reported, and the file stays in the
   strict layer.
2. **Test files.** A stem ending `_test`, `.test`, `_bench`, or `.bench` is an
   adapter when its extension is `ts`, `tsx`, `mts`, `cts`, `js`, `jsx`, `mjs`,
   or `cjs`.
3. **Path.** A directory segment or module basename named `adapters`, `adapter`,
   `infra`, `scripts`, or `bin`, or a module basename named `main`, is an
   adapter. This applies to every supported TypeScript and JavaScript extension.
4. **Everything else is domain.**

Step 4 fails closed on purpose. A gate that failed open would disappear the
moment someone renamed `src/domain/` to `src/core/`, and nothing would say so.
Failing closed makes the mistake loud, and correcting it costs one line.

It also makes every explicit adapter pragma visible:

```console
$ grep -rn "@light-fp adapter" src/
```

That command does not list test files, path-inferred adapters, or `lint.exclude`
entries, which need separate review.

| Layer     | Rules applied                                                      |
| --------- | ------------------------------------------------------------------ |
| `domain`  | all of them                                                        |
| `adapter` | only `require-ignore-reason` and `no-empty-statement`              |
| `prelude` | all except `no-throw`, `no-unsafe-cast`, and the restriction rules |

The prelude is intended for the small module defining `Result` and the helpers
that legitimately need `try/catch` or a brand-creating cast.

## Rules

### `light-fp/layer-boundary`

Domain code names no adapter, in any import form: plain imports, re-exports,
`export *`, dynamic `import()`, and side-effect-only imports. Matching is on
path segments and module basenames, so `../adapters/http.ts`, `../adapters.ts`,
and `../main.ts?worker` all count, while an npm package called
`my-adapters-helper` does not.

```ts
import { fetchUser } from "../adapters/http.ts"; // reported
import type { HttpPort } from "../ports/http.ts"; // fine
```

### `light-fp/pure-module`

Importing a domain module runs nothing. Reports module-level `let` and `var`,
top-level `await` and control flow, and calls, construction, or tagged templates
that execute at module scope, including inside exported initializers. Inside a
function body, `let` is fine. `operator-forms` refuses `new` in every position.

```ts
export const cache = new Map(); // reported: construction runs on import
main(); // reported
export function emptyCache(): Cache {
  return { entries: [] };
} // fine
```

### `light-fp/no-ambient-effects`

Reports a closed set of unshadowed ambient names. Object member access and
capture through a variable, assignment, default export, or source-less named
export cover `Deno`, `process`, `window`, `document`, `navigator`,
`localStorage`, `sessionStorage`, `globalThis`, and `console`. Direct calls and
the same capture positions cover `fetch`, `alert`, `confirm`, `prompt`,
`setTimeout`, `setInterval`, `clearTimeout`, `clearInterval`, `queueMicrotask`,
`requestAnimationFrame`, `addEventListener`, and `removeEventListener`.

The member list covers `Date.now`, `Math.random`, `performance.now`,
`crypto.randomUUID`, and `crypto.getRandomValues`, including computed string
access such as `Date["now"]`. Constructors cover zero-argument `new Date()`,
`new WebSocket`, `new Worker`, `new XMLHttpRequest`, `new EventSource`, and
`new BroadcastChannel`.

A local or imported binding with one of these names is treated as an injected
capability and is not reported.

The rule does not report `new Date(ms)`, `Math.max`, `JSON.parse`,
`structuredClone`, or `new Map`. In domain files, `operator-forms` reports each
`new`, and `ambient-names` reports `JSON.parse` and `structuredClone`.

```ts
const ambientStamp = Date.now(); // reported
const injectedStamp = ports.clock.now(); // fine
```

### `light-fp/no-throw`

Reports `throw` and `try` alike, pushing explicit domain failure toward returned
values that `deno check` can propagate. The rule has no type or cross-file
information, so it cannot prove that an imported call will not throw. Domain
failure is a tagged record, not an `Error`: `operator-forms` refuses `new`, and
`ambient-names` refuses the global `Error`.

```ts
if (!valid) throw new Error("invalid"); // reported
if (!valid) return err({ _tag: "Invalid", reason: reason }); // fine
```

### `light-fp/no-discarded-values`

Every expression statement inside a function must be a state transition such as
an assignment, update, or generator `yield`, or a direct call to a nested helper
whose declared return type is exactly `undefined`. Values produced by other
calls, construction, logical and conditional expressions, optional chains,
sequences, and tagged templates cannot be silently discarded. This is the
unhandled-`Result` check. Asking "is this a `Result`?" needs type information
the linter does not have; asking "is a value being thrown away?" does not. It
catches ignored `Result` values, floating promises, and fire-and-forget effects
at once.

```ts
validateUser(input); // reported
void save(x); // reported: an explicit discard is still a discard
const checked = validateUser(input); // fine
```

Assignments, updates, generator `yield`, directive prologues, and a required
`super()` call are transitions and are not reported. The nested-helper allowance
is deliberately narrow: the helper is a concrete synchronous function inside an
actual function body; apart from its declaration identifier, every same-named
occurrence is one of its direct calls. `eval` or `with` disables the allowance
for the file. `void`, aliases of `undefined`, async functions, wrappers, member
calls, and native mutation such as `values.push(x)` remain reported. An
`undefined` return contract says only that no meaningful result was discarded;
the helper can still mutate borrowed input, so the rule does not call it pure or
locally owned.

### `light-fp/readonly-data`

Within type aliases and non-ambient interface declarations, reports mutable
properties and index signatures at any nesting depth. It also reports `T[]`,
`Array`, `Map`, and `Set` in those data positions, including generic arguments
and every member of a discriminated union.

Autofixable.

```ts
type MutableADT = { _tag: "A"; items: string[] } | { _tag: "B" }; // reported four times
type ReadonlyADT =
  | { readonly _tag: "A"; readonly items: readonly string[] }
  | { readonly _tag: "B" }; // fine
```

Members of a literal that is the single argument of `Readonly<{ ... }>` already
count as readonly and are not reported. The wrapper itself is reported as
redundant, because the convention is `readonly` on each member and no outer
`Readonly<>`. The fix drops the wrapper and adds `readonly` to every member that
lacks it. The rule skips this report when a method, call, construct, or accessor
member is present, and for `Readonly<Ref>`, `Readonly<A | B>`, and
`Readonly<Record<...>>`. Nested wrappers can need two `--fix` passes.

Function parameter and return annotations are not reported, including method,
function-property, call-signature, and constructor annotations nested inside a
data declaration. Requiring `readonly` on every parameter would be the noisiest
rule in the set; this is a deliberate false-positive budget. Ordinary data
surrounding a callable member remains subject to the rule.

### `light-fp/no-oo`

Reports non-ambient class declarations and class expressions, `this`, `enum`,
non-ambient `namespace`, decorators, parameter properties, and object-literal
`get`/`set` accessors.

```ts
export class CartService {
  add(i: Item) {
    this.items.push(i);
  }
} // reported
export function addItem(cart: Cart, item: Item): Cart {
  return { ...cart, items: [...cart.items, item] };
} // fine
```

### `light-fp/no-unsafe-cast`

Reports `as`, angle-bracket casts, `!`, `any` in annotations, and comments whose
body starts with `@ts-ignore`, `@ts-expect-error`, or `@ts-nocheck`.

Two allowances: `as const`, and a cast to a top-level type alias or interface
declared in the same file. The second is what makes smart constructors work
without type information. A type declared inside a function is not recognised as
local by this rule.

```ts
const io = fetchUser(url) as IO<Response>; // reported

type Email = string & { readonly _brand: unique symbol };
type RawEmail = string;
export function parseEmail(raw: RawEmail): Result<ParseError, Email> {
  return raw.includes("@") ? ok(raw as Email) : err({ _tag: "NotAnEmail" });
} // fine
```

### `light-fp/prefer-type-for-data`

An interface carrying data should be a `type`, so it composes into unions and
intersections. Interfaces whose members are all call, construct, method, or
function-property signatures describe capability ports and are left alone.
Ambient interfaces are also left alone. An interface with `extends` is reported
without a fix; other reported interfaces are autofixable.

### `light-fp/no-empty-statement`

The rule refuses a standalone `;` and a lone `;` used as a body (`if (x);`,
`else;`, `while (x);`) in every layer. Deno's plugin AST drops a standalone `;`
and every later statement in the same list. This was measured on Deno 2.9.8.
Without this rule, one `;` hides the rest of a file, block, `case` body, or
`namespace` body from every plugin rule. The rule reports the first character of
the hidden code. `deno fmt` also deletes a standalone `;`, but the gate does not
depend on the formatter.

### `light-fp/require-ignore-reason`

Reports a line suppression naming a `light-fp` rule unless it has a reason of at
least ten characters. It also reports file-wide suppressions that are bare or
name a `light-fp` rule when the plugin receives the comment. The real CLI has an
important exception described below.

## Restriction rules

These rules carry over the restrictions of the zts-model-1 TypeScript profile
that apply to standard TypeScript. They apply to domain files only. Each table
row names the ZTS diagnostic code that the restriction comes from.

### `light-fp/module-forms`

Domain code uses TypeScript files, named imports, and exports declared in the
module that exports them. Relative side-effect imports and dynamic `import()`
stay with `layer-boundary`.

| Refused form                                                | Write instead                                                   | ZTS code |
| ----------------------------------------------------------- | --------------------------------------------------------------- | -------- |
| A `.js`, `.jsx`, `.mjs`, or `.cjs` file                     | Rename the file to `.ts`, or to `.tsx` for JSX                  | ZTS052   |
| `import x from "./mod.ts"`, `import type X from "./mod.ts"` | `import { name } from "./mod.ts"`                               | ZTS002   |
| `import * as x from "./mod.ts"`                             | Import each name that the file uses                             | ZTS002   |
| `import "npm:pkg"` (a side-effect import of a package)      | Import a named value, and move the effect to an adapter         | ZTS002   |
| `export { x } from "./mod.ts"`, `export * from "./mod.ts"`  | Import the name, and export it from its own module              | ZTS002   |
| `import { x } from "./mod.ts"; export { x };`               | Export the declaration in the module that owns it               | ZTS002   |
| `export default ...`, `export { x as default }`             | `export function name(...)`, or `export const name` for a value | ZTS056   |

### `light-fp/lexical-forms`

Domain code writes strings with a closed set of escapes and names identifiers
with ASCII characters. Legacy octal literals stay with Deno's `no-octal` rule.

| Refused form                                                | Write instead                                                                                                  | ZTS code |
| ----------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- | -------- |
| An escape outside the closed set, such as `"a\qb"`          | Remove the backslash, or write an allowed escape: ``\n \r \t \b \f \v \0 \\ \' \" \` \$ \xHH \uHHHH \u{H...}`` | ZTS013   |
| A backslash before a line break inside a string or template | Join the lines, or write `\n`                                                                                  | ZTS045   |
| An identifier with a character above U+007F, such as `café` | Rename it with ASCII letters, digits, `_`, or `$`                                                              | ZTS046   |

### `light-fp/declaration-forms`

Domain code binds each name on its own. An arrow assigned to a `const` is an
immutable function value. A function expression or a function assigned to a
mutable binding remains refused.

| Refused form                                                            | Write instead                                     | ZTS code |
| ----------------------------------------------------------------------- | ------------------------------------------------- | -------- |
| Object destructuring, such as `const { a } = x`                         | Bind the value, then read each named member       | ZTS001   |
| Array destructuring outside the narrow local `const [a, b] = pair` form | Bind the value, then read each indexed member     | ZTS001   |
| A destructuring parameter, such as `function f({ a }: T)`               | Accept one named parameter, then read each member | ZTS001   |
| `const f = function ...`                                                | `const f = (...) => ...`                          | ZTS608   |
| `let f = () => ...`, `let f = function ...`                             | A `const` arrow or function declaration           | ZTS608   |

Inside an actual function body, a nonempty `const` array pattern is allowed when
every element is a plain identifier. The same flat pattern is allowed in a
synchronous `for...of` head. Top-level patterns, `let`, `var`, holes, defaults,
rest or nested patterns, parameters, `for...in`, `for await...of`, and class
static blocks remain refused. This allowance preserves the source iterator's
`next` and `return` behavior; it does not claim that direct slot reads are
equivalent.

### `light-fp/function-forms`

Domain code gives each function declaration a full signature, and each call
lists its arguments one by one. Immutable function values may use `const`
arrows.

| Refused form                                                                   | Write instead                                                              | ZTS code |
| ------------------------------------------------------------------------------ | -------------------------------------------------------------------------- | -------- |
| A function expression, such as `run(function () { ... })`                      | A function declaration, or an arrow passed directly as a callback argument | ZTS001   |
| A generator, `function* g() { yield 1; }`                                      | Return an array                                                            | ZTS001   |
| A default parameter, `function f(a = 1)`                                       | `function f(a: number \| undefined)`, then `const resolved = a ?? 1;`      | ZTS054   |
| An optional parameter, `function f(a?: number)`, also in a type or signature   | `function f(a: number \| undefined)`                                       | ZTS055   |
| A rest parameter, `function f(...rest: number[])`, also in a type or signature | `function f(rest: readonly number[])`                                      | ZTS001   |
| A call-site spread, `f(...args)`, `new F(...args)`                             | Pass positional arguments                                                  | ZTS616   |
| A function declaration without a type on each parameter and on its return      | `function f(a: number): number { ... }`                                    | ZTS601   |

A function expression bound to a `const` belongs to `declaration-forms`. An
object method belongs to `record-forms`, and a class method belongs to `no-oo`.

### `light-fp/statement-forms`

Domain code branches with `if`/`else` or a return-terminating `switch`, and
iterates a finite collection with `for...of`.

| Refused form                                                         | Write instead                                              | ZTS code |
| -------------------------------------------------------------------- | ---------------------------------------------------------- | -------- |
| A `switch` with fallthrough or a non-returning case                  | End every case group with an unconditional return          | ZTS001   |
| `while`, `do...while`                                                | Iterate a finite collection with `for...of`                | ZTS001   |
| A C-style `for (let i = 0; ...; ...)`                                | `for (const x of xs)`, or `for (const i of xs.keys())`     | ZTS001   |
| `for (const k in record)`                                            | `for (const key of Object.keys(record))`                   | ZTS001   |
| A labeled statement, `outer: for (...)`                              | A conditional, or move the loop into a function and return | ZTS001   |
| A `for...of` body that changes the collection that the loop iterates | Read one collection and build the changed one separately   | ZTS622   |

Empty labels may group into the next returning case body. The final label must
have a body, every non-empty body must end in a structural return, and no
`break` or `continue` may occur. A default case is not required. This is a
structural termination check, not an exhaustiveness proof.

The `for...of` check covers a mutating method call (`push`, `pop`, `shift`,
`unshift`, `splice`, `sort`, `reverse`, `fill`, `copyWithin`, `set`, `add`,
`delete`, `clear`), a write to a member (`xs[i] = v`, `xs.length = 0`,
`xs[i]++`), and `delete xs[i]`. It applies when the iterable is an identifier or
a chain of member reads such as `state.items`, and it compares source text.

Empty statements belong to `no-empty-statement`, which runs in every layer.

### `light-fp/operator-forms`

Domain code compares with strict equality, assigns in its own statement, and
builds values without coercing or hidden-effect operators.

| Refused form                                                                   | Write instead                                                            | ZTS code |
| ------------------------------------------------------------------------------ | ------------------------------------------------------------------------ | -------- |
| `==`, `!=`                                                                     | `===`, `!==`                                                             | ZTS001   |
| `x++`, `++x`, `x--`, `--x`                                                     | `x = x + 1`                                                              | ZTS001   |
| A compound assignment, `x += e`, `x **= e`, `x >>>= e`                         | `x = x + e`                                                              | ZTS613   |
| A logical assignment, `x &&= e`, `x \|\|= e`, `x ??= e`                        | `x = x ?? value`                                                         | ZTS001   |
| An assignment in an expression, `const m = (n = 2);`, `f(x = 1)`, `a = b = c;` | Assign in its own statement                                              | spec     |
| An assignment target that calls or assigns, `xs[next()] = 1`, `xs[i++] = 1`    | Compute the key or the object into a `const` first                       | spec     |
| `x instanceof T`                                                               | Discriminate with a tag field such as `_tag`                             | ZTS001   |
| A dynamic `key in record`, or any `in` query outside a function body           | Use a fixed string key inside a function, or check a tag field           | ZTS001   |
| Unary `+x`                                                                     | Remove it from a number, or parse text with `parseFloat`/`parseInt`      | ZTS001   |
| `void x`                                                                       | Write `undefined`, and run an effect as its own statement                | ZTS001   |
| `delete o.key`                                                                 | Build a new object without the key                                       | ZTS001   |
| `new T(...)`                                                                   | Call a factory function, or write an object literal                      | ZTS001   |
| A regex literal, `/a+/g`                                                       | String methods: `includes`, `startsWith`, `endsWith`, `indexOf`, `split` | ZTS001   |
| A sequence expression, `(a(), b())`                                            | Separate statements                                                      | ZTS003   |
| A tagged template, `` tag`x` ``                                                | Call the function with a string argument                                 | ZTS003   |
| An optional call, `f?.()`, `a.b?.()`                                           | Check for `undefined`, then call                                         | ZTS001   |
| An optional computed access, `xs?.[i]`                                         | Check for `undefined`, then index                                        | ZTS001   |
| A conditional in an arm of a conditional, `a ? b : c ? d : e`                  | `match` from `ts-pattern`, or `if`/`else`                                | ZTS621   |
| A comparison with a boolean literal, `x === true`                              | Use the boolean directly: `x` or `!x`                                    | ZTS620   |

This bounded static-field syntax allowance admits a string-literal query such as
`"kind" in value` inside an actual function body, including a concise arrow
body. It uses JavaScript's `HasProperty` semantics: an inherited field counts,
and a Proxy `has` trap can run. It is not own-field validation, a purity
guarantee, or equivalent to `Object.hasOwn`. Dynamic, member, template, numeric,
and symbol keys remain refused. Parameter defaults, module scope, class field
initializers, and static blocks remain outside the allowance.

An optional member read such as `a?.b` or `a?.b()`, a conditional in the test
position, and unary `-`, `!`, `~`, and `typeof` stay allowed. The `RegExp` name
belongs to `ambient-names`, and `new RegExp(...)` already reports as `new`. An
assignment or a sequence in a `for` header belongs to `statement-forms`.

### `light-fp/record-forms`

Domain code builds each record from explicit `key: value` fields and at most one
leading spread.

| Refused form                                                          | Write instead                                            | ZTS code |
| --------------------------------------------------------------------- | -------------------------------------------------------- | -------- |
| A shorthand property, `{ value }`                                     | `{ value: value }`                                       | ZTS001   |
| A method property, `{ run() {} }`                                     | A field that holds an arrow, `{ run: (x: T): R => ... }` | ZTS001   |
| A computed key, `{ [k]: v }`                                          | A literal field name, or `Object.fromEntries`            | ZTS001   |
| A numeric key, `{ 1: "a" }`                                           | A string key, or an array for dense indices              | ZTS001   |
| A spread that is not the first member, `{ x: 1, ...base }`            | One leading spread, `{ ...base, x: 1 }`                  | ZTS614   |
| `Object.assign`, `Object.freeze`, `Object.isFrozen` (global `Object`) | Object spread, `{ ...base, key: value }`                 | ZTS001   |

A getter and a setter belong to `no-oo`. A shorthand property or a spread in an
object pattern belongs to `declaration-forms`. An array spread stays allowed.

### `light-fp/type-forms`

Domain code writes one spelling for each type. Primitive types remain direct in
exported signatures; a transparent alias does not make them safer.

| Refused form                      | Write instead                                  | ZTS code |
| --------------------------------- | ---------------------------------------------- | -------- |
| `value satisfies T`               | Annotate the declaration: `const x: T = value` | ZTS043   |
| `Array<T>`                        | `T[]`, or `readonly T[]` for data              | ZTS058   |
| `ReadonlyArray<T>`                | `readonly T[]`                                 | ZTS059   |
| `void`, including `Promise<void>` | `undefined`                                    | ZTS060   |

`string`, `number`, `boolean`, `object`, `unknown`, arrays and unions of them,
and `Promise` results may appear directly in exported signatures.
`no-unsafe-cast` still reports `any`, and `readonly-data` still reports mutable
declared data. `readonly-data` also reports `Array<T>` in a data position.

### `light-fp/ambient-names`

Domain code reads only a closed set of global names. Every other name that the
file does not bind is a capability, and the file imports it or receives it from
a port.

| Refused form                                                                                                         | Write instead                                                 | ZTS code |
| -------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- | -------- |
| A value name that the file does not bind and the allowlist does not name, such as `console`, `Map`, `Error`, `fetch` | Import the name, or receive it as a parameter from a port     | ZTS629   |
| `eval`, `Proxy`, `Reflect`, `Function`, `arguments`                                                                  | Reach the capability through a port, not through a global     | ZTS001   |
| `JSON.parse`, including `JSON["parse"]`                                                                              | Parse in an adapter, and pass a validated value to the domain | spec     |

The allowlist has fourteen names: `Array`, `Boolean`, `Date`, `JSON`, `Math`,
`Number`, `Object`, `String`, `parseFloat`, `parseInt`, `undefined`, `NaN`,
`Infinity`, and `Promise`. A name is bound when the file declares it as a
variable, function, class, enum, namespace, parameter, catch parameter, or
import. The rule checks value positions only. A member property, an object key,
a label, an import or export name, `import.meta`, `new.target`, and every name
inside a type stay allowed. `JSON.stringify` stays allowed. `console.log` and
`fetch()` also report under `no-ambient-effects`, because each rule gives its
own reason.

## Suppressing a rule

```ts
// deno-lint-ignore light-fp/no-ambient-effects -- seeded once at startup, never in a request
```

The reason must be at least ten characters. A signed suppression can be reviewed
and removed later.

Prefer a layer declaration when a whole file belongs outside the strict layer:

```ts
// @light-fp adapter
```

The real `deno lint` CLI honors a bare `// deno-lint-ignore-file` before the
plugin can report that comment. It silences every built-in and plugin rule for
the file, including `require-ignore-reason`. `Deno.lint.runPlugin` does not
honor lint-ignore comments and does report the file-wide form. Code review or a
separate text check must catch this CLI-level hole.

## Adopting on an existing codebase

Turning this on everywhere at once produces a diagnostic count nobody will work
through. Two orders that do work:

**By layer.** Mark everything `// @light-fp adapter`, then move files to domain
one at a time as you clean them. The pragma list shrinks as adoption grows, and
`grep` shows the explicit pragmas that remain.

**By ratchet.** Freeze today's count and forbid new violations. The plugin
exports the comparison, and you supply the counting:

```ts
import plugin, {
  type Baseline,
  compare,
  explain,
  measure,
} from "jsr:@srdjan/light-fp-lint@^0.8.1";
import baseline from "./lint-baseline.json" with { type: "json" };

const baseline: Baseline = {
  "src/legacy.ts": 3,
};

const walk = async function* (dir: string): AsyncGenerator<string> {
  for await (const entry of Deno.readDir(dir)) {
    const path = join(dir, entry.name);
    if (entry.isDirectory) yield* walk(path);
    else if (entry.isFile && entry.name.endsWith(".ts")) yield path;
  }
};

const readSources = async (
  dir: string,
): Promise<readonly (readonly [string, string])[]> => {
  const sources: (readonly [string, string])[] = [];
  for await (const path of walk(dir)) {
    sources.push([
      relative(Deno.cwd(), path),
      await Deno.readTextFile(path),
    ]);
  }
  return sources.toSorted((a, b) => a[0].localeCompare(b[0]));
};

const count = (path: string, source: string): number =>
  Deno.lint.runPlugin(plugin, path, source).length;

Deno.test("lint debt does not grow", async () => {
  const verdict = compare(baseline, measure(count, await readSources("src")));
  if (verdict._tag !== "Unchanged") throw new Error(explain(verdict));
});
```

New violations fail. A reduced count fails too, asking you to tighten the
baseline. An empty walk returns `NothingMeasured` and also fails, so a broken
source reader cannot make the ratchet pass vacuously. `runPlugin` works inside
`deno test`, where file access is ordinary, which is why the ratchet lives there
rather than in a rule.

`runPlugin` does not honor `deno-lint-ignore` comments. Suppressed diagnostics
therefore count toward the baseline deliberately: a suppression is debt, and
debt must not pay itself down. This differs from the real `deno lint` CLI, which
honors those comments.

`measure` takes the counter as a parameter rather than calling `runPlugin`
itself, so the comparison stays pure and the effect stays at the edge.

## Local pre-commit hook

Git 2.55 or newer can install the optional named hook from the versioned package
export:

```console
$ deno run --allow-run=git jsr:@srdjan/light-fp-lint@0.8.1/hook install
$ deno run --allow-run=git jsr:@srdjan/light-fp-lint@0.8.1/hook status
$ git hook list --show-scope pre-commit
```

Remove the repository-local `hook.light-fp` namespace:

```console
$ deno run --allow-run=git jsr:@srdjan/light-fp-lint@0.8.1/hook uninstall
```

Install repairs the exact partial state where the command exists but the event
is missing. Install refuses other local conflicts and every non-local conflict.
Uninstall removes installed, partial, or conflicting local values in that
namespace, but refuses non-local values. Neither command changes an existing
traditional pre-commit hook.

The CLI prints successful results to stdout and failures to stderr. Exit codes
are `0` for successful actions and status results, `1` for Git or environment
failures, `2` for invalid usage, `3` when install or uninstall needs newer Git,
and `4` for conflicts or an incomplete status. On older Git, `status` returns
`0` with `installed but inactive: Git <version> is older than 2.55` when the
configuration exists but Git cannot run it.

On older Git, add this command to the pre-commit system you already use:

```console
deno lint
```

Do not replace an existing hook file. The hook checks the working tree, not only
the staged snapshot. It can be bypassed with `git commit --no-verify`, so it is
fast feedback and never a substitute for required CI.

## Enforcement layers

| Layer           | Role                                             | Authority             |
| --------------- | ------------------------------------------------ | --------------------- |
| Lint package    | Implements the rules                             | Shared implementation |
| Local Git hook  | Runs `deno lint` before a commit                 | Optional feedback     |
| CI              | Runs the repository's complete check             | Required enforcement  |
| Codex skill     | Teaches the Light FP editing workflow            | Optional guidance     |
| Codex Stop hook | Runs the configured repository's own `deno lint` | Optional validation   |

## Agent integration

This checkout includes a local Codex plugin under `.codex-plugin/`, `skills/`,
and `hooks/`. It is outside `deno.json`'s package include and remains
local-only. Add this checkout's local marketplace, install the plugin, and
inspect the result:

```console
$ codex plugin marketplace add /absolute/path/to/light-fp-lint
$ codex plugin add light-fp@light-fp-local
$ codex plugin list
```

Remove the local installation and marketplace when testing is complete:

```console
$ codex plugin remove light-fp@light-fp-local
$ codex plugin marketplace remove light-fp-local
```

Review `hooks/hooks.json` and `hooks/verify.ts` before enabling the plugin.
Plugin hooks are untrusted local commands until the user reviews them. Use
`/hooks` to complete that trust review, then start a new session. The skill
guides edits without copying the lint rule catalog. The Stop hook asks Deno to
load the nearest config's effective lint settings, so a workspace member
inherits activation from its workspace root. When active, it invokes that
member's own `deno lint` and returns no source, path, rule ID, or raw
diagnostic.

The plugin is optional. CI remains required whether or not developers install
the Git hook or agents enable the Codex integration.

## Limits

These limits are measured against the current implementation:

- **The linter has no type information.** Every rule decides from one file's AST
  plus its filename. There is no cross-file resolution.
- **Imported effects are invisible unless the local specifier names an adapter
  boundary.** Wrapping `fetch` in `../ports/http.ts` and importing that helper
  is silent. `layer-boundary` reports exact `adapters`, `adapter`, `infra`,
  `scripts`, or `bin` segments and a `main` basename with any lintable
  TypeScript or JavaScript extension.
- **Ambient-name binding analysis is file-wide, not lexical.** A parameter or
  local declaration with a name such as `fetch` makes that name local for the
  whole file. That can silence a real global use in another scope or before the
  declaration. `ambient-names` uses the same analysis. Passing a bare ambient
  object as an argument, such as `use(Deno)`, is silent for
  `no-ambient-effects`; in domain files, `ambient-names` reports it.
- **Construction is refused only in domain files.** `operator-forms` reports
  every `new` in a domain file. In a prelude file, `pure-module` reports
  construction at module scope, and construction inside a function is allowed.
- **`no-discarded-values` reports every non-transition expression statement in a
  function, except a proven nested unit call.** That call targets a concrete
  nested function whose return annotation is exactly `undefined`; apart from the
  declaration identifier, every same-named occurrence must be a direct call
  inside its owning function body. Assignments, updates, generator `yield`,
  directive prologues, and required `super()` calls are also allowed. Other
  calls, awaits, construction, literals, binary expressions, sequences, and
  `void expr` are reported.
- **Readonly coverage is declaration-scoped.** Parameter and return annotations
  outside a type alias or interface are silent. The mutable collection list is
  `Array`, `Map`, and `Set`; it does not include every mutable library type.
- **Layer paths are rooted at the current working directory.** Run lint from the
  repository root. A filename outside `Deno.cwd()` keeps its whole-path
  fallback, and the same fallback applies when cwd access is denied. An
  adapter-named ancestor outside the intended project path can therefore affect
  the result when lint is launched from a subdirectory over parent paths.
- **The real CLI has a file-wide suppression hole.** A bare
  `// deno-lint-ignore-file` silences the plugin before `require-ignore-reason`
  can report it. `runPlugin` sees and counts it.
- **Exhaustiveness is not checked here.** `statement-forms` accepts a `switch`
  when each case group returns, but it does not prove that the cases cover a
  union. Use an explicit return type and a post-switch `never` check when a
  closed discriminated union must stay exhaustive.
- **Restrictions that need types are not enforced.** Non-boolean conditions,
  string `+`, dynamic property access `obj[key]`, effectful conditional arms,
  and `null` handling (ZTS100-106, ZTS605, ZTS612, ZTS624) need type or effect
  information. The repository file `plans/004-typescript-restrictions.md`
  classifies every zts-model-1 restriction.
- **Deno's plugin AST drops a standalone `;` and the statements after it.** This
  was measured on Deno 2.9.8. `no-empty-statement` reports the hidden code in
  every layer.
- **Optional-call detection reads source text.** Deno sets `optional` on every
  node of an optional chain, so `operator-forms` looks for `?.` in the source. A
  comment between a callee and its `?.` hides an optional call.
- **Mutation through an alias is not tracked.** `readonly-data` forces the
  annotations; `deno check` enforces them from there.
- **Deno 2.2's programmatic lint helper cannot expose source text.** The real
  `deno lint` command supports every rule on Deno 2.2. Under exactly Deno 2.2,
  `Deno.lint.runPlugin` cannot observe layer pragmas or suppression comments;
  use the CLI for those checks or a newer Deno for programmatic comment rules.
- **External protocol specifiers are not adapter paths.** `npm:`, `node:`,
  `jsr:`, HTTP, and data specifiers are exempt even when their package path
  contains an adapter-named segment. A pure external library in the domain is
  legitimate; `layer-boundary` governs local relative and absolute paths.

## Development

```console
$ deno task ci   # fmt --check, check, lint, test
```

There is no remote CI. The gate runs in a pre-commit hook instead, so enable it
once per clone:

```console
$ git config core.hooksPath .githooks
```

`.githooks/pre-commit` runs `deno task ci` and refuses the commit if it fails.
Nothing else checks this repository, so `--no-verify` skips the only gate there
is.

The gate requires Git 2.55 or newer and fails if the named-hook E2E tests would
skip. If the qualifying Git executable is not first on `PATH`, select it
explicitly:

```console
$ LIGHT_FP_TEST_GIT=/absolute/path/to/git deno task ci
```

For local iteration, `deno task test` remains portable. It may skip only the Git
2.55-specific E2E tests when a qualifying Git executable is unavailable.

Individually:

| Task                       | Purpose                           |
| -------------------------- | --------------------------------- |
| `deno task fmt`            | format                            |
| `deno task lint`           | lint the plugin with itself       |
| `deno task test`           | the full test suite               |
| `deno task examples:lint`  | diagnostics on the example corpus |
| `deno task bump <version>` | rewrite every version reference   |
| `deno task publish`        | publish the package to JSR        |

The plugin lints its own source. `src/layer.ts` resolves as domain code. The
real CLI reports it clean because two signed line suppressions cover its one
`Deno.cwd()` read and the surrounding `try/catch` used when cwd access is
denied. The `Deno.cwd()` suppression names both `no-ambient-effects` and
`ambient-names`. `runPlugin` ignores those suppressions and records three
diagnostics as ratchet debt. The rule modules, composition root, and hook CLI
carry adapter pragmas because they adapt imperative APIs.

The current-Deno suite uses `Deno.lint.runPlugin`. `tests/rules_test.ts` is
table-driven per rule and asserts exact diagnostic counts, so a rule that fires
twice fails as loudly as one that never fires. `tests/deno_2_2_cli_test.ts`
drives the real CLI across every plugin rule to keep the oldest supported Deno
covered; it runs only where `deno --version` reports exactly 2.2.0 and reports
as ignored everywhere else. `tests/fix_test.ts` asserts the exact text each fix
produces and then typechecks it. `tests/examples_test.ts` pins the example
corpus, so the documentation cannot drift away from what the rules do.
`tests/comments_fallback_test.ts` fabricates a `SourceCode` without
`getAllComments` so the Deno 2.2 comment-scanner fallback is judged on every
Deno version, not only on 2.2 itself. `tests/readonly_rederive_test.ts` runs the
readonly-data rule against a frozen copy of its previous implementation and
requires identical diagnostics, so a future rewrite that changes behavior fails.

## Further reading

- [Design rationale](https://github.com/srdjan/light-fp-lint/blob/main/q_and_a.md)
- [Before and after examples](https://github.com/srdjan/light-fp-lint/tree/main/examples/src)
- [Rule implementations](src/rules/)
- [Layer resolution](src/layer.ts)
