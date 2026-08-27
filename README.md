# @light-fp/deno-lint-plugin

[![Version](https://img.shields.io/badge/version-0.4.0-blue)](deno.json)
[![JSR](https://img.shields.io/badge/jsr-@light--fp%2Fdeno--lint--plugin-black?logo=deno)](https://jsr.io/@light-fp/deno-lint-plugin)
[![License: MIT](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)

A Deno lint plugin that enforces Light Functional Programming in TypeScript:
pure domain modules, errors as values, immutable data, and a hexagonal boundary
between domain and adapters.

## Contents

- [What the gate guarantees](#what-the-gate-guarantees)
- [Quick start](#quick-start)
- [Layers](#layers)
- [Rules](#rules)
- [Suppressing a rule](#suppressing-a-rule)
- [Adopting on an existing codebase](#adopting-on-an-existing-codebase)
- [Limits](#limits)
- [Development](#development)

## What the gate guarantees

For a file in the domain layer, the rules together guarantee that:

- importing it runs nothing;
- it cannot reach the platform, an adapter, or the clock;
- it cannot throw, catch, or discard a value;
- its data is readonly;
- its types cannot be forged by a cast.

The linter proves shapes. It cannot prove properties, so the gate has three legs
and needs all of them:

| Command      | Proves                                                                        |
| ------------ | ----------------------------------------------------------------------------- |
| `deno lint`  | shapes: the rules in this plugin                                              |
| `deno check` | types: exhaustiveness and Result propagation, which the shapes make checkable |
| `deno test`  | whole-repo invariants: your own tests                                         |

Several rules exist to make the second column possible. `no-throw` removes the
path by which an error escapes its type. `no-unsafe-cast` removes the escape
hatch that would let a bad value claim a good type.

## Quick start

Add the plugin to `deno.json`:

```jsonc
{
  "lint": {
    "plugins": ["jsr:@light-fp/deno-lint-plugin"]
  }
}
```

Run `deno lint`. Every file is treated as domain unless its path or its header
says otherwise, so expect diagnostics on entry points and scripts on the first
run. Mark those as adapters:

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

`handleThrow` is the boundary. A throwing call goes in, a `Result` comes out,
and no domain module catches anything itself.

See `examples/src/` for worked before-and-after pairs covering authentication,
validation, HTTP orchestration, persistence, and effect composition. Run
`deno task examples:lint` to see the diagnostics on the `.bad.ts` files; every
`.good.ts` file is clean, and a test enforces that.

## Layers

Deno lint plugins cannot take configuration. `lint.plugins` accepts strings
only, and `RuleContext` has no `options` field, so a rule sees exactly one thing
about its surroundings: the filename. Layers therefore come from the file
itself.

A file's layer is resolved in this order:

1. **Header pragma.** The first comment matching `@light-fp domain`,
   `@light-fp adapter`, or `@light-fp prelude` before the first statement. An
   unrecognised token is reported, and the file stays in the strict layer.
2. **Test files.** A name ending `_test.ts`, `.test.ts`, `_bench.ts`, or
   `.bench.ts` is an adapter. Tests wire fakes and throw assertions.
3. **Path.** A directory segment named `adapters`, `adapter`, `infra`,
   `scripts`, or `bin`, or a basename of `main.ts`, is an adapter.
4. **Everything else is domain.**

Step 4 fails closed on purpose. A gate that failed open would disappear the
moment someone renamed `src/domain/` to `src/core/`, and nothing would say so.
Failing closed makes the mistake loud, and correcting it costs one line.

It also makes every opt-out visible:

```console
$ grep -rn "@light-fp adapter" src/
```

That lists every file which left the strict layer. No glob configuration can
answer the same question.

| Layer     | Rules applied                              |
| --------- | ------------------------------------------ |
| `domain`  | all of them                                |
| `adapter` | only `require-ignore-reason`               |
| `prelude` | all except `no-throw` and `no-unsafe-cast` |

The prelude is meant to be one module: the one defining `Result` and the effect
brands, which legitimately needs `try/catch` and a brand-creating cast.

## Rules

### `light-fp/layer-boundary`

Domain code names no adapter, in any import form: plain imports, re-exports,
`export *`, dynamic `import()`, and side-effect-only imports. Matching is on
path segments, so `../adapters/http.ts` and the sibling `../adapters.ts` both
count, while an npm package called `my-adapters-helper` does not.

```ts
import { fetchUser } from "../adapters/http.ts"; // reported
import type { HttpPort } from "../ports/http.ts"; // fine
```

### `light-fp/pure-module`

Importing a domain module runs nothing. Reports module-level `let` and `var`,
bare call statements, top-level `await`, and top-level control flow. Anything
inside a function body is fine, including `let`.

```ts
let cache = new Map(); // reported
main(); // reported
export const makeCache = () => new Map(); // fine
```

### `light-fp/no-ambient-effects`

The domain never touches the platform's ambient effect vocabulary, anywhere in
the file. A closed list: `Deno`, `process`, `window`, `document`, `navigator`,
`localStorage`, `sessionStorage`, `globalThis`, `console`; `fetch`, the timers,
`queueMicrotask`, `requestAnimationFrame`, `addEventListener`, the prompts;
`Date.now`, `Math.random`, `performance.now`, `crypto.randomUUID`,
`crypto.getRandomValues`; `new Date()` with no arguments, `new WebSocket`,
`new Worker`, `new XMLHttpRequest`, `new EventSource`, `new BroadcastChannel`.

`new Date(ms)`, `Math.max`, `JSON.parse`, `structuredClone`, and `new Map` are
deterministic and are not reported.

```ts
const stamp = Date.now(); // reported
const stamp = ports.clock.now(); // fine
```

### `light-fp/no-throw`

Errors are values. Reports `throw` and `try` alike: a function that can neither
throw nor catch can only report failure as a value, which is what lets
`deno check` propagate the error type from there. `new Error(...)` as a value
inside `err(...)` is data and is fine.

```ts
if (!valid) throw new Error("invalid"); // reported
if (!valid) return err({ _tag: "Invalid", reason }); // fine
```

### `light-fp/no-discarded-values`

Every expression's value is used. This is the unhandled-`Result` check. Asking
"is this a `Result`?" needs type information the linter does not have; asking
"is a value being thrown away?" does not, and inside a pure function the two are
the same question. It catches ignored `Result` values, floating promises, and
fire-and-forget effects at once.

```ts
validateUser(input); // reported
void save(x); // reported: an explicit discard is still a discard
const checked = validateUser(input); // fine
```

Assignments and `++` are not reported: a local accumulator inside a pure
function is Light FP, and immutability across boundaries is `readonly-data`'s
job.

### `light-fp/readonly-data`

Data is immutable, at any nesting depth: type aliases, interface bodies, nested
objects, generic arguments, and **every member of every discriminated union**.
Also reports mutable arrays and `Map`/`Set` in data positions.

Autofixable.

```ts
type ADT = { _tag: "A"; items: string[] } | { _tag: "B" }; // reported, twice
type ADT =
  | { readonly _tag: "A"; readonly items: readonly string[] }
  | { readonly _tag: "B" }; // fine
```

Function parameter and return annotations are not reported. Requiring `readonly`
on every parameter would be the noisiest rule in the set; this is a deliberate
false-positive budget.

### `light-fp/no-oo`

Reports `class` declarations and expressions, `this`, `enum`, non-ambient
`namespace`, decorators, parameter properties, and object-literal `get`/`set`
accessors.

```ts
export class CartService {
  add(i: Item) {
    this.items.push(i);
  }
} // reported
export const addItem = (cart: Cart, item: Item): Cart => ({
  ...cart,
  items: [...cart.items, item],
}); // fine
```

### `light-fp/no-unsafe-cast`

The type system cannot be overruled, so brands and `Result` types cannot be
forged. Reports `as`, angle-bracket casts, `!`, `any` in annotations, and the
`@ts-ignore`, `@ts-expect-error`, and `@ts-nocheck` comments.

Two allowances: `as const`, and a cast to a type alias **declared in the same
file**. The second is what makes smart constructors work without type
information. Colocate a brand with its constructor and the cast is legal; a cast
to a type from anywhere else is the forgery the rule exists to stop.

```ts
const io = fetchUser(url) as IO<Response>; // reported

type Email = string & { readonly _brand: unique symbol };
export const parseEmail = (raw: string): Result<ParseError, Email> =>
  raw.includes("@") ? ok(raw as Email) : err({ _tag: "NotAnEmail" }); // fine
```

### `light-fp/prefer-type-for-data`

An interface carrying data should be a `type`, so it composes into unions and
intersections. Interfaces whose members are all functions describe capability
ports and are left alone. Autofixable, except when the interface has `extends`.

### `light-fp/require-ignore-reason`

Every `light-fp` suppression carries a reason, and there is no file-wide off
switch: a whole file leaves the gate through a layer pragma or `lint.exclude`,
both of which one `grep` can enumerate.

## Suppressing a rule

```ts
// deno-lint-ignore light-fp/no-ambient-effects -- seeded once at startup, never in a request
```

The reason must be at least ten characters. It is not ceremony: a strict gate
survives only if its holes stay visible, and an unsigned suppression is a hole
nobody can judge later.

To relax a whole file, change its layer instead:

```ts
// @light-fp adapter
```

## Adopting on an existing codebase

Turning this on everywhere at once produces a diagnostic count nobody will work
through. Two orders that do work:

**By layer.** Mark everything `// @light-fp adapter`, then move files to domain
one at a time as you clean them. The pragma list shrinks as adoption grows, and
`grep` shows exactly how far along you are.

**By ratchet.** Freeze today's count and forbid new violations. `runPlugin`
works inside `deno test`, where file access is normal, so a test can walk
`src/`, count diagnostics per file, and compare against a committed baseline.
New violations fail; a reduced count fails too, asking you to tighten the
baseline, so progress cannot silently regress.

## Limits

Stated plainly, because a gate that overstates itself is worse than one that
does not exist:

- **The linter has no type information.** Every rule decides from one file's AST
  plus its filename. There is no cross-file resolution.
- **An imported effectful function is invisible.** `no-ambient-effects` works
  from a closed list of platform names. If you wrap `fetch` in your own helper
  and import it into the domain, only `layer-boundary` will catch it, and only
  if the helper lives under an adapter path.
- **Exhaustiveness is not checked here.** Give your functions explicit return
  types and let `deno check` catch unhandled variants. Avoid `default` in a
  switch over `_tag`, which is precisely what hides a missing variant.
- **Mutation through an alias is not tracked.** `readonly-data` forces the
  annotations; `deno check` enforces them from there.
- **npm and node specifiers are not restricted.** A pure schema library in the
  domain is legitimate, and banning it would only breed suppressions.

## Development

```console
$ deno task ci   # fmt --check, check, lint, test
```

Individually:

| Task                      | Purpose                           |
| ------------------------- | --------------------------------- |
| `deno task fmt`           | format                            |
| `deno task lint`          | lint the plugin with itself       |
| `deno task test`          | the full test suite               |
| `deno task examples:lint` | diagnostics on the example corpus |

The plugin lints its own source. `src/layer.ts` holds as domain code; the rule
modules carry an adapter pragma, because a lint rule adapts an imperative
visitor API and reports through a void callback.

Tests use `Deno.lint.runPlugin`. `tests/rules_test.ts` is table-driven per rule
and asserts exact diagnostic counts, so a rule that fires twice fails as loudly
as one that never fires. `tests/fix_test.ts` asserts the exact text each fix
produces and then typechecks it. `tests/examples_test.ts` pins the example
corpus, so the documentation cannot drift away from what the rules do.

## Further reading

- [Design rationale](q_and_a.md)
- [Before and after examples](examples/src/)
- [Rule implementations](src/rules/)
- [Layer resolution](src/layer.ts)
