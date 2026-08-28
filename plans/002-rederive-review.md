# Rederive Review: `@srdjan/light-fp-lint`

Review date: 2026-08-28. Baseline commit: `383fdba` (clean `main`). Method:
rederive — read the tests, the public API, and the docs to capture each unit's
contract, then judge the current implementation against it. Every claim below
carries a measurement. The measurement pipeline is committed under `plans/` and
re-runs with `deno test -A plans/`.

## 1. Executive summary

**Current state.** This is a small, unusually tight codebase. 16 source modules,
~1 970 LOC, 349 AST branches. The house style (light-functional TypeScript, ADTs
with exhaustive switches, capabilities injected, hexagonal edges) is already
followed in every module. Coverage is high: 90.7% branch, 95.4% function, 93.6%
line across `src/`. All 274 tests pass in ~4 s; no test exceeds 1 s. Docs
(README, q_and_a.md) match the code. The plugin lints its own source clean.

**Target state.** Same behavior, two things better:

1. `src/rules/readonly_data.ts` rederived onto an enter/`:exit` context stack
   (validated prototype: branches 29 → 23, worst-function complexity 30 → 24,
   behavior proven identical by a differential corpus).
2. The Deno 2.2 comment-scanner fallback in `src/comments.ts` judged on every
   Deno version, not only under the 2.2 CI matrix (44% function coverage today).

**Headline deltas the plan expects**

| Metric                                              | Before | After                           |
| --------------------------------------------------- | ------ | ------------------------------- |
| AST branches, `src/rules/readonly_data.ts`          | 29     | 23                              |
| Max function complexity, `readonly_data.ts`         | 30     | 24                              |
| Function coverage, `src/comments.ts` (current Deno) | 44.4%  | ≈ 90%                           |
| Line coverage, `src/comments.ts` (current Deno)     | 67.8%  | ≈ 95%                           |
| Test count                                          | 274    | 274 + new tests (no removals)   |
| Behavior                                            | —      | unchanged (differential-judged) |

No type-driven (branch-class) rederives are proposed: the codebase has no
swallowable `default`, no nullable where a total function fits, and no loose
string where an ADT fits. That section reports what was checked and found
already in target state, so the executor does not re-derive what is tight.

## 2. Baseline measurements

Method: `plans/measure_branches.ts` (AST walk via the Deno lint API; counts
`if`/`else`, `?:`, `switch` cases, `&&`/`||`/`??`, loops, `catch`, optional
chains, early returns) and `plans/hotspots.ts` (per-function cyclomatic
complexity). Coverage from `deno test -A --coverage` on the current suite.

### 2.1 Source modules

| Module                             |       LOC | Branches |     Fns | Max cx | Coverage L/B/F     |
| ---------------------------------- | --------: | -------: | ------: | -----: | ------------------ |
| src/mod.ts                         |        52 |        0 |       0 |      — | 100/100/100        |
| src/layer.ts                       |       149 |       21 |      15 |      6 | 95/82/92           |
| src/ratchet.ts                     |        74 |        9 |      10 |      5 | 97/95/100          |
| src/comments.ts                    |       135 |       33 |      13 |     15 | 68/74/44           |
| src/git_hook.ts                    |       214 |       54 |      14 |     16 | 95/96/100          |
| src/cli/hook.ts                    |       290 |       50 |      19 |     13 | 92/81/100          |
| src/rules/ambient_effects.ts       |       217 |       67 |      16 |     31 | 95/94/100          |
| src/rules/discarded_values.ts      |        81 |       19 |       6 |     10 | 95/92/100          |
| src/rules/layer_boundary.ts        |        75 |       13 |       9 |     12 | 97/88/100          |
| src/rules/no_oo.ts                 |        71 |        6 |       9 |      7 | 100/100/100        |
| src/rules/no_throw.ts              |        33 |        1 |       3 |      2 | 100/100/100        |
| src/rules/no_unsafe_cast.ts        |        89 |       13 |      10 |      7 | 98/91/100          |
| src/rules/prefer_type_for_data.ts  |        65 |       11 |       5 |      8 | 83/89/100          |
| src/rules/pure_module.ts           |       119 |       14 |      11 |     15 | 98/94/100          |
| src/rules/readonly_data.ts         |       134 |       29 |      12 |     30 | 99/99/100          |
| src/rules/require_ignore_reason.ts |        70 |        9 |       4 |      9 | 100/100/100        |
| **src total**                      | **1 968** |  **349** | **156** |      — | **93.6/90.7/95.4** |

### 2.2 Adapter edge and support

| Module                    |    LOC | Branches |            Max cx |
| ------------------------- | -----: | -------: | ----------------: |
| hooks/verify.ts           |    236 |       42 |                12 |
| hooks/activation_probe.ts |     20 |        0 |                 1 |
| tests/ (14 files)         | ~3 400 |     ~160 | 17 (hook_cli_e2e) |

### 2.3 Test suite

- 274 tests, 1 ignored (the Deno 2.2 floor test, which runs under the 2.2 CI
  matrix), 0 failed. Runtime ≈ 4 s. Slowest test 657 ms (under the 1 s threshold
  that would block a fast rederive loop).
- Per-rule table tests assert exact diagnostic counts; `fix_test.ts` asserts
  exact fix text and then typechecks it; `examples_test.ts` pins the corpus
  exact-multiset; `robustness_test.ts` feeds unusual syntax to every rule in
  every layer; `hook_cli_e2e_test.ts` drives real Git in temp repositories.
- Weak spots, measured: `comments.ts` fallback (44% fn / 68% line on current
  Deno), `prefer_type_for_data.ts` fix branch (83% line), `cli/hook.ts` error
  branches (81% branch).

## 3. Findings, ranked by leverage

### F1 — `readonly_data.ts`: replace the per-node ancestor walk with an enter/`:exit` context stack

**Problem.** `typePosition` (complexity 9) walks the full ancestor chain once
per visited
`TSPropertySignature`/`TSIndexSignature`/`TSArrayType`/`TSTypeReference` node,
resolving the "nearest enclosing data-or-callable declaration decides `inData`;
any enclosing module/declare-interface decides `inAmbient`" rule bottom-up for
every node. The rule's `create` is the highest-complexity function in the module
(30) and the second-highest in `src/` after `ambient_effects.ts`.

**Evidence.** 29 AST branches, max cx 30, 134 LOC. The ancestor walk is O(n · d)
per file and re-derives context the visitor already owns.

**Proposed rederive.** Maintain a frame stack with the `:exit` visitor support
the Deno lint API exposes (verified in the Deno 2.9 type surface: `LintVisitor`
accepts `` `${Node["type"]}:exit` `` keys). Enter pushes a frame for
`TSTypeAliasDeclaration` (`inData: true`), `TSInterfaceDeclaration`
(`inData: true, inAmbient: node.declare`), `TSModuleDeclaration`
(`inAmbient: true`), and each of the nine callable type nodes (`inData: false`).
A visited node reads `inData` from the deepest open frame with a defined value
and `inAmbient` from any open frame — exactly the ancestor walk's semantics. The
one node that still needs the direct parent (`TSArrayType` under a `readonly`
type operator) keeps a single `getAncestors` call.

**Validation (done, committed under `plans/`).** `plans/readonly_experiment.ts`
is the rederived rule; `plans/readonly_experiment_test.ts` runs a differential
corpus of 37 sources plus 9 fix-convergence sources against both implementations
and asserts identical diagnostics (id, message, range, fix presence) and
identical fixed text, plus a no-throw pass over the robustness fixtures. All
pass. The rederived rule also passes `deno task ci` in place.

**Expected delta.** Branches 29 → 23 (−21%), max cx 30 → 24, LOC 134 → 151
(neutral), coverage holds (differential-proven). The win is structural: the rule
reads top-down and the "nearest declaration" rule becomes "the deepest frame"
instead of a three-condition ancestor scan.

**Risk.** Low. The `:exit` API is present in every supported Deno (2.2+), the
existing table tests, fix tests, and robustness tests all still pass, and the
differential corpus pins behavior. The executor must land it as the prototype
file moved into `src/` and run the full suite, not re-type it.

### F2 — `comments.ts`: judge the Deno 2.2 fallback on every Deno version

**Problem.** `scanText`, `scanComments`, `collectBlockedRanges`, and
`childKeysOf` (44% function / 68% line coverage on current Deno) only execute
under the Deno 2.2 CI matrix, through the real CLI. On current Deno,
`getAllComments` exists and the fallback is dead. A rederive or even a
maintenance edit of `comments.ts` cannot be judged by the current-Deno suite.

**Evidence.** Coverage table 2.1: 44.4% fn, 67.8% line. The fallback is 33 of
the module's branches.

**Proposed fix (test gap first — do not touch the implementation yet).** Port
the probe tests from `plans/comments_probe_test.ts` into `tests/`. The trick
that makes this possible on current Deno: `scanComments`/`commentsOf`/
`headerComments` only check for `getAllComments` on the object and read
`sourceCode.text`, so a fabricated `SourceCode` (real AST captured from a probe
rule, a `text` getter, no `getAllComments`) exercises the entire fallback on any
Deno. The probe file already passes (18 cases): basic line/block comments,
comment markers inside `"…"`/`'…'`/backtick templates/nested templates, regex
literals and character classes, division, the `Unavailable` text branch, and the
`getAllComments` fast path. One probe case documents the block-comment value
shape (`/** … */` excludes the closing `*`).

**Expected delta.** comments.ts function coverage 44.4% → ≈ 90%, line 67.8% → ≈
95% on current Deno, with zero implementation change.

**Risk.** None (pure test addition). This is a prerequisite for any later
rederive of `comments.ts`.

### F3 — `pure_module.ts`: merge the two ancestor passes in `runsOnImport`

**Status: REJECTED by measurement (2026-08-28).** The proposed single ancestor
pass (a `for` loop accumulating `inFunction`/`covered` flags) was prototyped and
measured: the file went 14 → 17 AST branches and max cx 15 → 18, because the
original's two `.some` predicates count leaner than the loop's `if`/`||`
structure, and the two named early-exit predicates read better than one
accumulating loop. It fails the method's own success criterion (smaller in
branches and complexity), so the original was kept and the experiment reverted.
The second pass is a trivial in-memory scan of a small array; do not revisit.

## 4. Test-correctness findings

These are prerequisites or gate-keepers; each blocks a safe rederive that
depends on it. Fix them first, in this order.

### T1 (prerequisite for F2) — comments.ts fallback has no current-Deno coverage

See F2. The ported probe tests must land before any change to `comments.ts`.
Status: tests already written and green in `plans/comments_probe_test.ts`; the
phase moves them into `tests/`.

### T2 — the file-wide binding contract of `no-ambient-effects` is untested

`localBindings` (cx 31, the highest in `src/`) implements a documented
approximation: "Ambient-name binding analysis is file-wide, not lexical." The
README says a declaration anywhere in the file silences a use anywhere else.
Every existing test declares the binding **before** the use. The
use-before-declaration case (the sharpest edge of the approximation) is
untested, so a future rederive of `localBindings` cannot be judged. Verified by
probe: `const x = fetch("u"); const fetch = …` is silent today, matching the
README. Add that regression test (and the "binding inside a nested function
silences a top-level use" case) before any rederive of `ambient_effects.ts`.

### T3 — `require-ignore-reason` boundary is untested

`MIN_REASON = 10`; tests cover a 3-char and a 32-char reason. The 9/10 boundary
is untested. Add `-- 012345678` (9, fires) and `-- 0123456789` (10, passes).

### T4 — `prefer_type_for_data` fix branch has a gap

The fix path is `fix_test`-covered and typechecked, but the `extends`-without-
fix branch (reported, no fix offered) is asserted only by a hint string, not by
an exact-diagnostic test. A case `interface A extends B { readonly v: string }`
asserting exactly one diagnostic with no `fix` property closes it.

### T5 — runHookCli's config-consistency check is order-sensitive

`runHookCli` compares `git config --local` output against the local entries
filtered out of `git config --show-scope` output via
`JSON.stringify(a) !== JSON.stringify(b)`. Both derive from the same git
enumeration order, so it works today (E2E-covered), but the comparison is a
serialized, order-sensitive structural equality. Make it order-independent (sort
both sides before comparing, or compare structurally) so a git version that
reorders its output cannot false-positive the check.

## 5. Architecture findings

Measured against the target: hexagonal boundaries, capabilities as the DI
foundation, purity at the core.

**Already in target state** (verified by reading every module):

- **Domain core is I/O-free.** `layer.ts` (layer resolution), `ratchet.ts`
  (baseline comparison), `git_hook.ts` (hook state machine) are pure functions
  over their inputs. No module reads the network, the filesystem, or the clock
  except the documented edges below.
- **Capabilities are injected, not reached for.** `CountDiagnostics` into
  `measure` (ratchet.ts), `RunGit` into `runHookCli` (cli/hook.ts), and
  `VerifyCapabilities` into `verifyStop` (hooks/verify.ts). Each production
  implementation (`runGitProcess`, `productionCapabilities`) sits at the edge.
- **ADTs are exhaustive.** `Layer`, `PragmaLookup`, `Verdict`, `SourceText`,
  `HookState`, `HookDecision`, `GitVersion`, `ConfigEntries`, `ParsedStopInput`,
  `StopResponse`, `LintResult`, `PluginDetection`, `ConfigDiscovery` — every
  `switch` over them is exhaustive with no `default` swallowing unknowns (the
  only `default` in `src/` is `parseHookCommand`'s token parser, which returns
  `undefined` for an unknown token — a legitimate input-grammar case).

**Known leak, documented and accepted:**

- `layer.ts` calls `Deno.cwd()` (`currentRoot`), read per call and wrapped in a
  suppressed `try/catch`. This is the single hidden ambient in domain code,
  ratcheted at 2 in `SRC_BASELINE`. It cannot be injected (a lint rule's
  `create` receives only filename + sourceCode) and cannot be replaced by
  configuration (plugins take no options). Do not "fix" this; any attempt makes
  the layer decision depend on state captured at import, which is the stale-root
  defect commit `87dc493` removed.

**Boundary to preserve:** `comments.ts` is a sourceCode adapter that exists
because Deno 2.2's `runPlugin` cannot expose source text. Any rederive of it
must keep the `getAllComments` fast path and the `Unavailable` degradation, or
layer pragmas and `@ts-` suppressions silently vanish under 2.2 `runPlugin`.

## 6. Docs to update

- **`README.md`:** no rule behavior changes, so the rule sections stay. The
  Development section should mention the new `tests/comments_fallback_test.ts`
  and the `plans/` measurement tooling if the executor lands F2's port.
- **`src/rules/no_unsafe_cast.ts:40` comment:** "Type alias and interface names
  declared anywhere in this file" contradicts the implementation, which only
  collects top-level declarations (the README's "A type declared inside a
  function is not recognised as local" is correct). Fix the comment to "declared
  at the top level of this file" in the same commit as any touched rule file.
- **`q_and_a.md`:** verified current (rule ids, suppression semantics, ratchet
  baseline all match the code). No change.
- **`plans/README.md`:** add this review as a plan row once executed, per the
  existing index convention.

## 7. Additional re-basing tasks

Valuable, lower leverage; each is independent and safe:

- **A1 — Extract the AST-child enumeration.** The "walk every child via
  `Object.getOwnPropertyNames(Object.getPrototypeOf(node))`" pattern appears in
  `comments.ts` (`collectBlockedRanges`/`childKeysOf`) and `ambient_effects.ts`
  (`localBindings`). The two sites filter keys differently (comments skips
  `type`/`range`/`loc`; ambient skips only `constructor`/`parent`). One shared
  `astChildren(node)` helper in an adapter module removes the duplication and
  the divergent filters; low risk, small branch delta.
- **A2 — `cli/hook.ts` version preamble.** `runHookCli` inlines a three-step
  "read git version, split into lines, parse" sequence with three distinct
  failure messages. Extract `readGitVersion(runGit): Promise<VersionResult>`
  (ADT: `Version` | `Error(message)`). cx 13 → ≈ 9. Prototype and differential-
  judge against `hook_cli_e2e_test.ts` before landing.
- **A3 — `hooks/verify.ts` `discoverConfig`:** replace `while (true)` + `break`
  with a `for` loop over ascending parents; cosmetic, zero behavior change.
- **A4 — delete nothing, but keep an eye on `tests/rules_test.ts` (491 LOC, 0
  functions):** it is a data table, not a code smell; do not "refactor" it into
  helpers that hide the per-case expectations.

## 8. Phased plan

Ordered by leverage and risk. Every phase ends with the verification command and
the expected measurement. The executor runs on `main`, keeps the tree green
after every phase, and commits per phase.

### Phase 1 — Land the `readonly-data` rederive (F1)

- Move `plans/readonly_experiment.ts` to `src/rules/readonly_data.ts` (keeping
  the module's `@light-fp adapter` header and doc comment), with the
  `localTypeNames`-style comment fix from section 6 if touching the file anyway.
- Keep `plans/readonly_experiment_test.ts` as a differential regression test
  (rename to `tests/readonly_rederive_test.ts`), or fold its corpus into
  `tests/data_rules_test.ts`.

Verification: `deno task ci` (fmt, check, lint, 274+ tests). Expected: branches
29 → 23, max cx 30 → 24, coverage ≥ current.

### Phase 2 — Port the comments fallback tests (F2/T1)

- Move `plans/comments_probe_test.ts` to `tests/comments_fallback_test.ts` (drop
  the probe-only harness bits that are now redundant with `tests/harness.ts` if
  desired, but keep the fabricated-`SourceCode` technique verbatim).

Verification: `deno task ci`, then
`deno test -A --coverage=/tmp/cov && deno coverage /tmp/cov --exclude=tests --exclude=examples --exclude=plans --exclude=hooks`.
Expected: comments.ts function coverage 44.4% → ≈ 90%, line 67.8% → ≈ 95%.

### Phase 3 — Add the remaining test-correctness fixes (T2, T3, T4)

- T2: use-before-declaration and nested-function-binding regression tests in
  `tests/effects_purity_test.ts`.
- T3: 9-char and 10-char reason cases in `tests/rules_test.ts`.
- T4: exact-diagnostic test for the `extends`-without-fix branch in
  `tests/rules_test.ts`.

Verification: `deno task ci`. Expected: test count +4, coverage up, no branch
changes.

### Phase 4 — `pure_module.ts` single-pass `runsOnImport` (F3)

**REJECTED by measurement** — see finding F3. The prototype measured worse (14 →
17 branches, cx 15 → 18), so nothing was shipped. Phase recorded as
complete-with-rejection.

### Phase 5 — Optional, independent: A1 (AST-child helper), T5

(order-independent config comparison)

A2 (version preamble) was evaluated and rejected on the same evidence as F3: the
helper moves the branching into a separate function but keeps the same
conditions and adds a discriminator check, so the total branch count does not
drop. A3 (verify.ts loop) was skipped as pure churn with zero measurement delta.
Each surviving item is judged by `deno task ci`; T5 additionally by the hook E2E
suite
(`LIGHT_FP_REQUIRE_NAMED_HOOKS=1 deno test -A tests/hook_cli_e2e_test.ts`).

## 9. What not to touch

Measured as already tight; a rederive here trades clarity for nothing:

- **`src/rules/ambient_effects.ts` `localBindings` (cx 29).** The complexity is
  honest per-node-type dispatch (`addPattern`'s explicit cases for
  `Identifier`/`AssignmentPattern`/`RestElement`/`ArrayPattern`/`ObjectPattern`/
  `TSParameterProperty`), and the eager whole-file walk is what the documented
  file-wide contract requires. A lazy visitor accumulation would change the
  documented behavior (use-before-declaration) and cannot be made complete with
  the callback-only API (no scope analyzer in `SourceCode` — verified in the
  Deno 2.9 type surface). Pin it with T2, leave it alone.
- **`src/git_hook.ts` `hookState` (cx 16).** The `&&` chain is a precise spec of
  the three owned states; a classification table would be longer and no clearer.
- **`src/comments.ts` implementation.** The AST-blocked-range design is the
  right one: regex literals parse as `Literal` nodes, so the range set covers
  them (probe-verified: `/[//]/`, `/a\/*b/`), which a hand-rolled scanner would
  have to re-derive with a regex/division disambiguator. Judge it (Phase 2), do
  not rebuild it.
- **`src/ratchet.ts` (cx ≤ 5) and `src/mod.ts`.** Already the target shape.
- **The 2.2 CI split (`ci:deno-2.2` runs five test files).** Deliberate: the
  matrix exists to catch API-version drift via the real CLI. Do not fold the
  whole suite into it.
- **Scope traps:** do not add rule options (impossible — plugins take no
  options; see q_and_a.md), do not inject `Deno.cwd()` into `layer.ts`, do not
  change the fail-closed default layer, and do not "fix" the README-documented
  limits (no type info, file-wide bindings, module-scope construction allowance,
  no exhaustiveness checking) — they are contracts, not defects.

## 10. Execution log

Executed 2026-08-28 on `main`. Final suite: 299 passed, 0 failed, 1 ignored.

| Phase                                       | Result             | Commit    | Measured outcome                                                              |
| ------------------------------------------- | ------------------ | --------- | ----------------------------------------------------------------------------- |
| 1 — readonly-data rederive                  | DONE               | `eaab7bd` | branches 29 → 23, max cx 30 → 24, differential corpus identical               |
| 2 — comments fallback tests                 | DONE               | `399ae1e` | comments.ts coverage 44/68/74 → 100/96/94 (fn/line/branch)                    |
| 3 — T2/T3/T4 test pins                      | DONE               | `d559fb4` | +5 tests (2 binding, 2 reason boundary, 1 no-fix contract)                    |
| 4 — pure-module merge                       | REJECTED           | —         | prototype measured worse (14 → 17 branches, cx 15 → 18); reverted             |
| 5 — A1 AST-child helper, T5 config equality | DONE               | `f7eb59e` | comments 33 → 29 branches, ambient 67 → 65, cx 31 → 29; +2 fake-git E2E tests |
| 5 — A2 version preamble, A3 verify loop     | REJECTED / SKIPPED | —         | A2 same branch count plus a discriminator; A3 zero delta                      |

Docs updated in the same commits: README Development section names the two new
judging tests; the stale `no_unsafe_cast` comment now says "at the top level".

## Methodology and artifacts

Single-agent review (codebase is 16 source modules; scout work was done by the
two committed measurement tools rather than parallel agents). Artifacts in
`plans/`, all green under `deno task ci`:

- `plans/measure_branches.ts` + `plans/measurements.tsv` — AST branch/LOC table.
- `plans/hotspots.ts` + `plans/hotspots.tsv` — per-function complexity.
- `plans/readonly_original_reference.ts` — the frozen original readonly-data
  rule; `tests/readonly_rederive_test.ts` judges the shipped rule against it.
- `plans/branch_compare_test.ts` — before/after branch counter for F1.

Re-verify the plan when the measurement toolchain or the target architecture
changes.
