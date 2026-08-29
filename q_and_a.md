# Design rationale

Why this plugin is shaped the way it is. The [README](README.md) covers what the
rules do; this file covers the decisions behind them, including the ones that
were made under constraint rather than by preference.

## Why can I not configure rule options?

Because Deno's lint configuration cannot pass options to a plugin, and
pretending otherwise was the single largest defect in the previous version.

`lint.plugins` accepts an array of strings. A tuple entry is not ignored, it is
a hard parse error:

```console
error: Failed to parse "lint" configuration
Caused by: invalid type: sequence, expected a string
```

`Deno.lint.RuleContext` exposes exactly `id`, `filename`, `sourceCode`,
`report`, `getFilename()`, and `getSourceCode()`. There is no `options` field to
read even if there were a way to set one.

The rule context supplies the text of one file and that file's name. Layer
resolution also reads `Deno.cwd()` to strip the launch directory from an
absolute filename. It does not read a project configuration or resolve imports.

Per-file configuration is versioned and shows up in diffs.
`grep -rn "@light-fp adapter" src/` enumerates explicit adapter pragmas. It does
not include test files, adapters inferred from path names, or `lint.exclude`
entries, so those need their own audit.

## Why does an unrecognised file default to the strict layer?

Because a gate that fails open does not fail, it disappears.

Suppose the default were "unknown means relaxed". Someone renames `src/domain/`
to `src/core/` during a refactor. Every guarantee in this document evaporates
silently: no diagnostic, no warning, a green build, and nobody finds out until
the first `Date.now()` reaches production behind a `Result` that was never
checked.

Failing closed inverts that. The same rename produces diagnostics until the
files are classified deliberately. Existing codebases pay that cost on the first
run, when entry points and scripts need adapter classification.

An invalid or miscased pragma also stays in the strict layer. The
`layer-boundary` rule reports the token, while the other domain rules continue
to run.

## Why ban `try` as well as `throw`?

Because the two together are what let the type checker take over.

Banning `throw` alone still permits each domain file to add its own explicit
`try/catch` conversion. The previous rule set also tried to infer return types
without the type information needed to do that reliably.

Ban both syntactic forms and explicit domain failure has to be returned.
`deno check` can then propagate that declared type. The rule cannot prove that
an imported call does not throw, because lint plugins have no type or cross-file
information.

The example application centralises expected catching in the prelude's
`handleThrow`. Adapters may also catch. This repository's domain-layer
`src/layer.ts` has one signed `no-throw` suppression around root discovery so it
can tolerate hosts that deny cwd access.

## Why is discarding a value an error?

Because "did you handle this `Result`?" needs type information, while a
discarded expression is visible in one AST.

The rule reports every expression statement inside a function unless the
expression is an assignment, update, generator `yield`, directive prologue, or
required `super()` call. An ignored result is either dead code or a hidden
effect, and neither requires knowing its type.

That one syntactic check covers ignored `Result` values, floating promises, and
fire-and-forget calls.

`void expr`, literals, and binary expressions are reported too. An explicit
discard is still a discard, and letting `void` through would turn the rule into
a formality.

Logical and conditional wrappers do not change that contract. `ready && run()`,
`ready ? accept() : reject()`, and `new Box()` each produce a value, so a bare
statement throws that value away. Assign or return the complete expression. A
local assignment, update, directive prologue, generator `yield`, and required
`super()` call are transitions rather than discarded results and remain valid.

## Why is a cast to a local type allowed?

Because otherwise smart constructors would be impossible, and smart constructors
are how this style makes illegal states unrepresentable.

The pattern needs one cast:

```ts
type Email = string & { readonly _brand: unique symbol };

export const parseEmail = (raw: string): Result<ParseError, Email> =>
  raw.includes("@") ? ok(raw as Email) : err({ _tag: "NotAnEmail" });
```

That cast is the whole point of the file. In another unsuppressed domain file,
`Email` is not locally declared, so the same cast is reported. Adapter and
prelude files are outside `no-unsafe-cast`.

The distinction the rule draws is "is the target a top-level type alias or
interface declared in this file". It works when a brand and its constructor are
colocated. A type declared inside a function is not recognised. A codebase that
centralises brands separately from constructors must colocate them or suppress
the rule with a reason.

## Why not track where effect brands come from?

The previous version had a rule for this. It maintained a set of identifiers
believed to hold branded values and a stack of function return types, and tried
to conclude that a branded value could only originate from an approved helper.

Without type information, that analysis cannot be sound and cannot be complete.
It cannot follow a value through a function call, an array, or another module,
and any rename defeats it. What it can do is produce confident diagnostics that
are sometimes wrong, which is worse than producing none.

A non-exported `unique symbol` prevents structural construction outside the
defining module. Forging the brand elsewhere then needs a cast, and
`no-unsafe-cast` reports that cast because the target type is not declared in
the importing file.

## Why is `new` allowed?

A blanket ban on `new` fires on `new Map()`, `new Set()`, `new URL()`,
`new RegExp()`, and `new TextEncoder()`. This plugin treats those as value
constructors rather than ambient effects.

A rule whose diagnostics are usually wrong teaches people to suppress it, and a
suppression habit is contagious: the next diagnostic gets suppressed too,
whether or not it was right. Precision is not a nicety in a lint rule, it is
what keeps the rule believed.

The constructors that are treated as effectful are named individually in
`no-ambient-effects`: zero-argument `new Date()` reads the clock, and the five
platform constructors in the README reach external facilities. `new Date(ms)`
converts a number and is fine.

This allowance applies inside functions. Construction at module scope is a
different question: it runs during import, so `pure-module` reports it even when
the constructor itself is deterministic. Export a function that constructs the
value and let `main.ts` decide when to call it.

## Why are callable annotations outside `readonly-data`?

The rule protects declared data shapes, not every object-shaped parameter or
return annotation. Treating a method parameter as stored data creates noise
without establishing a useful boundary. Method signatures, function-valued
properties, function type aliases, call signatures, and constructor signatures
therefore form callable boundaries. Ordinary properties around those members
still need `readonly`.

## Why must suppressions carry a reason?

A strict gate accumulates holes. That is not a failure of the gate, it is what
happens when real code meets real deadlines. The question is whether the holes
stay visible.

An unsigned `// deno-lint-ignore light-fp/no-throw` is unreadable six months
later. Nobody can tell whether it was a considered exception or someone clearing
a build, so nobody removes it, and it becomes permanent. A signed one can be
judged, and often removed.

`require-ignore-reason` reports bare file-wide suppressions and file-wide
suppressions naming `light-fp` when the plugin receives their comments. The real
CLI applies a bare `// deno-lint-ignore-file` before the plugin runs, so that
form silences this rule along with every other rule. `Deno.lint.runPlugin` does
not honor ignore comments and therefore sees it. Reviewers need a text check for
the bare CLI hole; the preferred whole-file decision remains a layer pragma or a
reviewed `lint.exclude` entry.

## Why do the examples have their own `deno.json`?

The `.bad.ts` files are deliberately full of violations. Linting them as part of
the repository's own gate would mean the repository never passes its own CI.

Giving `examples/` its own configuration keeps deliberate violations out of the
repository's own lint task. The file is also a worked local-path setup for this
unpublished checkout. `tests/examples_test.ts` pins the complete sorted
diagnostic id list for every example file, including each duplicate and each
zero-diagnostic file. Deleting a bad example or reducing it to one diagnostic
now fails the test.

## Why does the plugin's own source carry adapter pragmas?

Because it is honest, and because refusing to answer the question would be
worse.

A lint rule adapts an imperative visitor API. It reports through a callback that
returns nothing, which `no-discarded-values` correctly flags, and it is driven
by traversal it does not own. That is adapter-shaped work, and the pragma says
so with a reason attached.

`src/layer.ts` resolves as domain code. Root discovery performs one `Deno.cwd()`
read inside `try/catch`, so the file carries two signed line suppressions. The
real CLI honors them and reports the file clean. `Deno.lint.runPlugin` ignores
them and reports `no-ambient-effects` plus `no-throw`; the ratchet records both
as debt.

## Why are local, CI, and agent enforcement separate?

They solve different problems. The local Git hook runs `deno lint` against the
working tree for fast developer feedback, but `--no-verify` can bypass it. CI
checks the committed repository and owns enforcement. The Codex skill carries
reasoning guidance for edits, while the Codex Stop hook invokes the configured
repository's same linter before an agent stops.

Putting Git or agent behavior inside lint rules would mix workflow effects into
the rule engine and create a second authority. Keeping the layers separate lets
each remain small: rules diagnose code, hooks invoke the rules, the skill guides
design, and CI decides whether a change can ship.

The Stop hook does not parse one config and guess whether the plugin is active.
It finds the nearest Deno config for the lint scope, then asks Deno to load that
config's effective settings. This matters in workspaces: a member config can
inherit the plugin from the workspace root. Detection and lint subprocess output
stay private; the hook protocol returns only a fixed correction or failure
message.

## What this cannot do

Listed in the [README](README.md#limits), and worth repeating as a principle:
the linter proves shapes, not properties. Several rules exist specifically so
that `deno check` can prove the properties afterwards. A gate that claimed more
than it delivers would be worse than no gate, because people would stop
checking.
