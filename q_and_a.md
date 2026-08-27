# Design rationale

Why this plugin is shaped the way it is. The [README](README.md) covers what the
rules do; this file covers the decisions behind them, including the ones that
were made under constraint rather than by preference.

## Why can I not configure anything?

Because Deno lint plugins cannot receive configuration, and pretending otherwise
was the single largest defect in the previous version.

`lint.plugins` accepts an array of strings. A tuple entry is not ignored, it is
a hard parse error:

```console
error: Failed to parse "lint" configuration
Caused by: invalid type: sequence, expected a string
```

`Deno.lint.RuleContext` exposes exactly `id`, `filename`, `sourceCode`,
`report`, `getFilename()`, and `getSourceCode()`. There is no `options` field to
read even if there were a way to set one.

So a rule knows two things: the text of one file, and that file's name. Every
decision has to come from those. Once that is accepted, the design follows: the
layer is a property of the file, declared in the file.

The consolation is real. Per-file configuration is versioned, shows up in every
diff, and answers questions a glob cannot. `grep -rn "@light-fp adapter" src/`
enumerates every file that left the strict layer. There is no equivalent query
for "which files did that `**/src/**/*.ts` pattern actually match, and did
anyone notice when it stopped matching".

## Why does an unrecognised file default to the strict layer?

Because a gate that fails open does not fail, it disappears.

Suppose the default were "unknown means relaxed". Someone renames `src/domain/`
to `src/core/` during a refactor. Every guarantee in this document evaporates
silently: no diagnostic, no warning, a green build, and nobody finds out until
the first `Date.now()` reaches production behind a `Result` that was never
checked.

Failing closed inverts that. The same rename produces a wall of diagnostics,
which is annoying for ten minutes and correct forever after. The cost is paid on
the first run of an existing codebase, when entry points and scripts light up
until they are marked. That is the same trade every strict tool makes.

## Why ban `try` as well as `throw`?

Because the two together are what let the type checker take over.

Banning `throw` alone leaves a gap: domain code that calls something throwing,
catches it, and converts. That is a second, hand-rolled error path in every file
that does it, and the previous rule set tried to police it with a return-type
analysis that reported the same throw twice.

Ban both and the analysis is unnecessary. A function that can neither throw nor
catch has exactly one way to report failure: return it. `deno check` then
propagates that type outward for free, which is a stronger guarantee than any
lint rule could give, and it is the reason the rule is worth its strictness.

The catching still has to happen somewhere. It happens once, in the prelude's
`handleThrow`, which is the only function in the codebase with a `catch` in it.

## Why is discarding a value an error?

Because "did you handle this `Result`?" is the question everyone wants and
nobody can answer syntactically, and "did you throw a value away?" is a question
that can be answered syntactically and turns out to be the same question.

Deciding whether an expression is a `Result` needs type information. The linter
has none. But consider what a discarded value means inside a function that is
already guaranteed pure by the other rules: either the call did nothing, in
which case it is dead code, or it did something, in which case the purity
guarantee was already broken. Both are defects. Neither requires knowing the
type.

The rule catches more than it was aimed at, which is the sign it was aimed
correctly: ignored `Result` values, floating promises, and fire-and-forget
effects are one violation, not three.

`void expr` is reported too. An explicit discard is still a discard, and letting
`void` through would turn the rule into a formality.

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

That cast is the whole point of the file. Every other cast to `Email` anywhere
else in the codebase is a forgery, and is reported.

The distinction the rule can actually draw is "is the target type declared in
this file". It works because the style already colocates a brand with its
constructor, and it fails for a codebase that centralises brands in one module
and constructors in another. Such a codebase must colocate them or suppress the
rule with a reason. This is the one place where the rule shapes the code rather
than the other way round, and it is a deliberate trade: the alternative is
either no brands or no rule.

## Why not track where effect brands come from?

The previous version had a rule for this. It maintained a set of identifiers
believed to hold branded values and a stack of function return types, and tried
to conclude that a branded value could only originate from an approved helper.

Without type information, that analysis cannot be sound and cannot be complete.
It cannot follow a value through a function call, an array, or another module,
and any rename defeats it. What it can do is produce confident diagnostics that
are sometimes wrong, which is worse than producing none.

The guarantee it wanted is available a different way. Give the brand a
non-exported `unique symbol`, and forging one requires a cast. Ban the cast, and
the brand is unforgeable, enforced by the type checker rather than approximated
by the linter. That is what `no-unsafe-cast` is for.

## Why is `new` allowed?

A blanket ban on `new` fires on `new Map()`, `new Set()`, `new URL()`,
`new RegExp()`, and `new TextEncoder()`. All of them are deterministic value
constructors, and all of them are ordinary in pure code.

A rule whose diagnostics are usually wrong teaches people to suppress it, and a
suppression habit is contagious: the next diagnostic gets suppressed too,
whether or not it was right. Precision is not a nicety in a lint rule, it is
what keeps the rule believed.

The constructors that are genuinely effectful are named individually in
`no-ambient-effects`: `new Date()` with no arguments reads the clock,
`new WebSocket` opens a socket. `new Date(ms)` converts a number and is fine.

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

The file-wide `deno-lint-ignore-file` is refused entirely, because a whole file
leaving the gate is a layer decision. Make it a layer decision: a pragma, which
one `grep` enumerates.

## Why do the examples have their own `deno.json`?

The `.bad.ts` files are deliberately full of violations. Linting them as part of
the repository's own gate would mean the repository never passes its own CI.

Giving `examples/` its own configuration solves that and earns something extra:
the file is a worked consumer setup, so anyone adopting the plugin can copy it.
The corpus is verified by `tests/examples_test.ts` instead, which asserts that
every `.good.ts` file is clean and every `.bad.ts` file is not. Documentation
that is executed cannot drift from the code, which is exactly how the previous
version came to describe rules it did not have.

## Why does the plugin's own source carry adapter pragmas?

Because it is honest, and because refusing to answer the question would be
worse.

A lint rule adapts an imperative visitor API. It reports through a callback that
returns nothing, which `no-discarded-values` correctly flags, and it is driven
by traversal it does not own. That is adapter-shaped work, and the pragma says
so with a reason attached.

`src/layer.ts` is different: it is pure logic over a string and an AST, and it
holds as domain code with no exemption. That the gate can be turned on its own
implementation, and that the part which should pass does pass, is the only
evidence worth having that the rules are livable.

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
