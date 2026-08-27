# @light-fp/deno-lint-plugin

[![Version](https://img.shields.io/badge/version-0.5.0-blue)](deno.json)
![JSR: not published](https://img.shields.io/badge/JSR-not%20published-lightgrey?logo=deno)
[![License: MIT](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)

A Deno lint plugin for Light Functional Programming in TypeScript: module-scope
purity checks, explicit error-as-value conventions, readonly data declarations,
and a hexagonal boundary between domain and adapters.

> **Publication status:** `@light-fp/deno-lint-plugin` is not published to JSR.
> The JSR specifiers and hook commands below describe the intended interface
> after the first publish; they do not work today. This checkout uses the local
> plugin path instead.

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

For a file in the domain layer that reaches the plugin without a suppression,
the rules enforce this syntactic contract:

- module scope contains no mutable declaration, control flow, top-level await,
  bare expression statement, call, or tagged template;
- imports do not name a recognised adapter segment, and direct uses of the
  plugin's ambient-effect vocabulary are reported;
- explicit `throw`, `try`, and discarded call-like values are reported;
- data declarations use readonly syntax; and
- `as` expressions are limited to `as const` and top-level types declared in the
  same file; angle-bracket casts, non-null assertions, and `any` report.

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

After the first publish, add the registry package to `deno.json`:

```jsonc
{
  "lint": {
    "plugins": ["jsr:@light-fp/deno-lint-plugin@^0.5.0"]
  }
}
```

Until then, a checkout of this repository can load the implementation by its
local path:

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
3. **Path.** A directory segment named `adapters`, `adapter`, `infra`,
   `scripts`, or `bin`, or a basename of `main.ts`, is an adapter.
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

| Layer     | Rules applied                              |
| --------- | ------------------------------------------ |
| `domain`  | all of them                                |
| `adapter` | only `require-ignore-reason`               |
| `prelude` | all except `no-throw` and `no-unsafe-cast` |

The prelude is intended for the small module defining `Result` and the helpers
that legitimately need `try/catch` or a brand-creating cast.

## Rules

### `light-fp/layer-boundary`

In domain and prelude code, reports a specifier containing an exact `adapters`,
`adapter`, `infra`, `scripts`, or `bin` segment. The check covers plain imports,
re-exports, and `export *`. Every dynamic `import()` is reported, whatever it
targets, and every relative side-effect-only import is reported. Segment
matching means `../adapters/http.ts` and the sibling `../adapters.ts` count,
while `my-adapters-helper` does not.

```ts
import { fetchUser } from "../adapters/http.ts"; // reported
import type { HttpPort } from "../ports/http.ts"; // fine
```

### `light-fp/pure-module`

Reports module-level `let` and `var`, bare expression statements, top-level
`await`, top-level control flow, and calls or tagged templates outside a
function body. Calls in exported, default-exported, and destructuring
initializers are included. A `NewExpression` is not a call for this rule, so
module-level construction is allowed unless `no-ambient-effects` names that
constructor.

```ts
let cache = new Map(); // reported: module-level let
export const loaded = main(); // reported: initializer call
export const cache = new Map(); // fine: construction is allowed
export const makeCache = () => new Map(); // fine: inside a function
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
`structuredClone`, or `new Map`.

```ts
const ambientStamp = Date.now(); // reported
const injectedStamp = ports.clock.now(); // fine
```

### `light-fp/no-throw`

Reports `throw` and `try` alike, pushing explicit domain failure toward returned
values that `deno check` can propagate. The rule has no type or cross-file
information, so it cannot prove that an imported call will not throw.
`new Error(...)` as a value inside `err(...)` is data and is fine.

```ts
if (!valid) throw new Error("invalid"); // reported
if (!valid) return err({ _tag: "Invalid", reason }); // fine
```

### `light-fp/no-discarded-values`

Inside function bodies, reports expression statements that discard a call,
await, tagged template, optional call, or a sequence containing one. It also
reports every `void expr`. This is the syntactic approximation of an unhandled
`Result`: the rule cannot identify a `Result`, but it can identify the common
call-like forms whose values were ignored.

```ts
validateUser(input); // reported
void save(x); // reported: an explicit discard is still a discard
const checked = validateUser(input); // fine
```

Assignments, `++`, literals, and bare binary expressions are not reported. A
local accumulator inside a pure function is allowed, and readonly annotations at
data boundaries are `readonly-data`'s job.

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

Function parameter and return annotations outside a type alias or interface are
not reported. Ambient interfaces and module augmentations are also skipped.

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
export const addItem = (cart: Cart, item: Item): Cart => ({
  ...cart,
  items: [...cart.items, item],
}); // fine
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
export const parseEmail = (raw: string): Result<ParseError, Email> =>
  raw.includes("@") ? ok(raw as Email) : err({ _tag: "NotAnEmail" }); // fine
```

### `light-fp/prefer-type-for-data`

An interface carrying data should be a `type`, so it composes into unions and
intersections. Interfaces whose members are all call, construct, method, or
function-property signatures describe capability ports and are left alone.
Ambient interfaces are also left alone. An interface with `extends` is reported
without a fix; other reported interfaces are autofixable.

### `light-fp/require-ignore-reason`

Reports a line suppression naming a `light-fp` rule unless it has a reason of at
least ten characters. It also reports file-wide suppressions that are bare or
name a `light-fp` rule when the plugin receives the comment. The real CLI has an
important exception described below.

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
} from "jsr:@light-fp/deno-lint-plugin@^0.5.0";
import { join, relative } from "jsr:@std/path@^1.0.0";

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

After the first JSR publish, Git 2.55 or newer can install the optional named
hook from the versioned package export:

```console
$ deno run --allow-run=git jsr:@light-fp/deno-lint-plugin@0.5.0/hook install
$ deno run --allow-run=git jsr:@light-fp/deno-lint-plugin@0.5.0/hook status
$ git hook list --show-scope pre-commit
```

Remove the repository-local `hook.light-fp` namespace:

```console
$ deno run --allow-run=git jsr:@light-fp/deno-lint-plugin@0.5.0/hook uninstall
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
guides edits without copying the lint rule catalog. The Stop hook activates only
when the nearest Deno config uses this package, invokes that repository's own
`deno lint`, and returns no source or raw diagnostics.

The plugin is optional. CI remains required whether or not developers install
the Git hook or agents enable the Codex integration.

## Limits

These limits are measured against the current implementation:

- **The linter has no type information.** Every rule decides from one file's AST
  plus its filename. There is no cross-file resolution.
- **Imported effects are invisible unless the specifier names an adapter
  segment.** Wrapping `fetch` in `../ports/http.ts` and importing that helper is
  silent. `layer-boundary` reports only exact `adapters`, `adapter`, `infra`,
  `scripts`, or `bin` segments. It does not report `../main.ts`, even though
  layer resolution classifies a file named `main.ts` as an adapter.
- **Ambient-name binding analysis is file-wide, not lexical.** A parameter or
  local declaration with a name such as `fetch` makes that name local for the
  whole file. That can silence a real global use in another scope or before the
  declaration. Passing a bare ambient object as an argument, such as
  `use(Deno)`, is also silent; member access and the explicit capture positions
  documented above are what report.
- **Module-level construction is allowed.** `pure-module` reports calls and
  tagged templates in initializers, but not `new LocalService()` or `new Map()`.
  `no-ambient-effects` still reports the named effectful constructors in its
  closed list.
- **`no-discarded-values` covers call-like expression statements, not every
  expression.** An ignored call, await, tagged template, optional call,
  qualifying sequence, or `void expr` reports. A discarded literal or binary
  expression does not.
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
- **Exhaustiveness is not checked here.** Give your functions explicit return
  types and let `deno check` catch unhandled variants. Avoid `default` in a
  switch over `_tag`, which is precisely what hides a missing variant.
- **Mutation through an alias is not tracked.** `readonly-data` forces the
  annotations; `deno check` enforces them from there.
- **There is no general npm or node allowlist.** `npm:zod` and `node:fs` are not
  reported. A package specifier containing an exact adapter segment, such as
  `npm:pkg/adapters/x`, is reported by the same segment matcher as a relative
  import.

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

The plugin lints its own source. `src/layer.ts` resolves as domain code. The
real CLI reports it clean because two signed line suppressions cover its one
`Deno.cwd()` read and the surrounding `try/catch` used when cwd access is
denied. `runPlugin` ignores those suppressions and records two diagnostics as
ratchet debt. The rule modules, composition root, and hook CLI carry adapter
pragmas because they adapt imperative APIs.

Tests use `Deno.lint.runPlugin`. `tests/rules_test.ts` is table-driven per rule
and asserts exact diagnostic counts, and the harness rejects unknown rule ids
before registering a table. `tests/fix_test.ts` asserts the exact text each fix
produces and then typechecks it. `tests/examples_test.ts` pins the complete
sorted diagnostic id list for every example file. `tests/robustness_test.ts`
runs every rule over unusual TypeScript syntax at each layer and fails if a
visitor throws.

## Further reading

- [Design rationale](q_and_a.md)
- [Before and after examples](examples/src/)
- [Rule implementations](src/rules/)
- [Layer resolution](src/layer.ts)
