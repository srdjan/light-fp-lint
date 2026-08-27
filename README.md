# @srdjan/light-fp-lint

[![Version](https://img.shields.io/badge/version-0.6.0-blue)](deno.json)
[![JSR](https://img.shields.io/badge/jsr-@srdjan%2Flight--fp--lint-black?logo=deno)](https://jsr.io/@srdjan/light-fp-lint)
[![License: MIT](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)

A Deno lint plugin that enforces Light Functional Programming in TypeScript:
pure domain modules, errors as values, immutable data, and a hexagonal boundary
between domain and adapters.

## Contents

- [What the gate guarantees](#what-the-gate-guarantees)
- [Quick start](#quick-start)
- [Local pre-commit hook](#local-pre-commit-hook)
- [Enforcement layers](#enforcement-layers)
- [Agent integration](#agent-integration)
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
    "plugins": ["jsr:@srdjan/light-fp-lint@^0.6.0"]
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
3. **Path.** A directory segment or module basename named `adapters`, `adapter`,
   `infra`, `scripts`, or `bin`, or a module basename named `main`, is an
   adapter. This applies to every supported TypeScript and JavaScript extension.
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
that execute at module scope, including inside exported initializers. Anything
inside a function body is fine, including `let` and deterministic construction.

```ts
export const cache = new Map(); // reported: construction runs on import
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

Every expression statement inside a function must be a state transition such as
an assignment, update, or generator `yield`. Values produced by calls,
construction, logical and conditional expressions, optional chains, sequences,
and tagged templates cannot be silently discarded. This is the
unhandled-`Result` check. Asking "is this a `Result`?" needs type information
the linter does not have; asking "is a value being thrown away?" does not, and
inside a pure function the two are the same question. It catches ignored
`Result` values, floating promises, and fire-and-forget effects at once.

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

Function parameter and return annotations are not reported, including method,
function-property, call-signature, and constructor annotations nested inside a
data declaration. Requiring `readonly` on every parameter would be the noisiest
rule in the set; this is a deliberate false-positive budget. Ordinary data
surrounding a callable member remains subject to the rule.

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

**By ratchet.** Freeze today's count and forbid new violations. The plugin
exports the comparison, and you supply the counting:

```ts
import plugin, {
  compare,
  explain,
  measure,
} from "jsr:@srdjan/light-fp-lint@^0.6.0";
import baseline from "./lint-baseline.json" with { type: "json" };

const count = (path: string, source: string) =>
  Deno.lint.runPlugin(plugin, path, source).length;

Deno.test("lint debt does not grow", async () => {
  const verdict = compare(baseline, measure(count, await readSources("src")));
  if (verdict._tag !== "Unchanged") throw new Error(explain(verdict));
});
```

New violations fail. A reduced count fails too, asking you to tighten the
baseline, so ground that was won cannot be lost again unnoticed. `runPlugin`
works inside `deno test`, where file access is ordinary, which is why the
ratchet lives there rather than in a rule: a rule cannot hold state between
files, and a plugin reading a baseline from disk would lint differently in the
editor than in CI.

`measure` takes the counter as a parameter rather than calling `runPlugin`
itself, so the comparison stays pure and the effect stays at the edge. See
`tests/ratchet_test.ts` for the full version.

## Local pre-commit hook

Consumers need Deno 2.2 or newer. With Git 2.55 or newer, install the optional
named hook from the versioned package export:

```console
$ deno run --allow-run=git jsr:@srdjan/light-fp-lint@0.6.0/hook install
$ deno run --allow-run=git jsr:@srdjan/light-fp-lint@0.6.0/hook status
$ git hook list --show-scope pre-commit
```

Remove only the configuration owned by this package:

```console
$ deno run --allow-run=git jsr:@srdjan/light-fp-lint@0.6.0/hook uninstall
```

The installer uses the local `hook.light-fp` namespace. It refuses conflicting
or non-local values and leaves an existing traditional pre-commit hook intact.
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
and `hooks/`. It is not published by this release. Add this checkout's local
marketplace, install the plugin, and inspect the result:

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
- **Deno 2.2's programmatic lint helper cannot expose source text.** The real
  `deno lint` command supports every rule on Deno 2.2. Under exactly Deno 2.2,
  `Deno.lint.runPlugin` cannot observe layer pragmas or suppression comments;
  use the CLI for those checks or a newer Deno for programmatic comment rules.
- **npm and node specifiers are not restricted.** A pure schema library in the
  domain is legitimate, and banning it would only breed suppressions.

## Development

```console
$ deno task ci   # fmt --check, check, lint, test
```

CI requires Git 2.55 or newer and fails if the named-hook E2E tests would skip.
If the qualifying Git executable is not first on `PATH`, select it explicitly:

```console
$ LIGHT_FP_TEST_GIT=/absolute/path/to/git deno task ci
```

For local iteration, `deno task test` remains portable. It may skip only the Git
2.55-specific E2E tests when a qualifying Git executable is unavailable.

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

The current-Deno suite uses `Deno.lint.runPlugin`. `tests/rules_test.ts` is
table-driven per rule and asserts exact diagnostic counts, so a rule that fires
twice fails as loudly as one that never fires. Deno 2.2 has a separate
compatibility task that drives the real CLI across every plugin rule and runs
the hook and package E2E suites. `tests/fix_test.ts` asserts the exact text each
fix produces and then typechecks it. `tests/examples_test.ts` pins the example
corpus, so the documentation cannot drift away from what the rules do.

## Further reading

- [Design rationale](q_and_a.md)
- [Before and after examples](examples/src/)
- [Rule implementations](src/rules/)
- [Layer resolution](src/layer.ts)
