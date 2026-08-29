# Five-pass quality rebase

Status: DONE

## Goal

Restore a green release contract, make the documented lint boundary match the
tested implementation, strengthen the supported Deno floor, and reduce
duplication in private measurement tooling without changing public diagnostics.

## Assumptions

- `deno.json` is the package and release authority.
- Version 0.6.1 is intentional and already published on JSR.
- Existing rule diagnostics are preserved in these five passes.
- Example error behavior and Git-hook error text were excluded from these five
  passes and changed only in the separately approved boundary patch.
- The current Deno 2.9.6 result is the behavior oracle for the Deno 2.2 lane.

## Baseline

- Checkout: `main` at `9462a5a1005badd29e3a094922a67775ef69b918`.
- Full gate: 296 passed, 3 failed, 1 ignored. The three failures are release
  version assertions.
- TypeScript: 6,988 nonblank lines, 615 AST branches, 535 functions.
- `src`: 1,909 nonblank lines, 340 AST branches, 169 functions.
- Coverage: 96.313% lines, 91.421% branches, 99.296% functions.

## Sequential passes

1. Release authority
   - Scope: `deno.json`, `.codex-plugin/plugin.json`, `README.md`,
     `tests/package_test.ts`.
   - Refactor: remove the independent test version constant.
   - Simplify: align all release-derived strings with 0.6.1.
   - Verify: `deno test -A tests/package_test.ts`.
   - Stop if: JSR does not identify 0.6.1 as the current release.

2. Documentation truth
   - Scope: `README.md`, `q_and_a.md`.
   - Refactor: express each limit from the tested rule boundary.
   - Simplify: remove contradictory and duplicate prose.
   - Verify: focused rule tests plus the real example lint command.
   - Stop if: a documented claim lacks a source or test oracle.

3. Example corpus authority
   - Scope: `tests/examples_test.ts` and one data-only test module.
   - Refactor: move the exact diagnostic multiset to one reusable value.
   - Simplify: keep corpus discovery and assertions in the consumer test.
   - Verify: `deno test -A tests/examples_test.ts`.
   - Stop if: moving the value changes diagnostic order or membership.

4. Deno-floor example E2E
   - Scope: `tests/deno_2_2_cli_test.ts` and the shared example authority.
   - Refactor: parse the real CLI JSON by file and compare it with the exact
     corpus authority.
   - Simplify: reuse the existing subprocess edge and JSON boundary guards.
   - Verify: the focused current-Deno test and `deno task ci:deno-2.2` when a
     Deno 2.2 runtime is available.
   - Stop if: current Deno and the existing in-process oracle disagree.

5. Measurement authority
   - Scope: private files under `plans/` only.
   - Refactor: share AST child traversal and branch counting while preserving
     the optional-chain counting difference.
   - Simplify: remove local duplicate walkers and sets.
   - Verify: measurement and branch-comparison tests, then regenerate the TSV
     outputs through their scripts.
   - Stop if: the same checkout produces different source measurements.

## Excluded findings

The first four findings were excluded from this five-pass patch, then resolved
in separately approved commit `4ba5acb`:

- Network rejection in `planProfileFetch`: observable example behavior.
- Named function-expression binding: public lint diagnostics.
- Ambient nested classes: public lint diagnostics.
- Git-hook conflict redaction: public CLI error text.

The following findings remain rejected:

- Staged-index enforcement: rejected because the documented hook is working-tree
  feedback and CI is the committed-state authority.
- Stop-hook plugin execution: rejected because it matches the optional reviewed
  trust model and current Deno permission boundary.

## Execution log

- Baseline captured and overall review independently validated on 2026-08-29.
- Pass 1 refactor: `deno.json` now supplies the test's release value; README and
  plugin surfaces derive their asserted value from that authority.
- Pass 1 rederive: 6,990 nonblank lines, 616 AST branches, 535 functions. The
  added branch is the loop that verifies every derived README release surface.
- Pass 2 refactor: README and Q&A limits now state the existing tested behavior
  for main entry points, import-time construction, discarded expressions, and
  external protocol specifiers.
- Pass 2 simplify and rederive: contradictory prose was removed with no
  TypeScript metric change. The focused rule and example suites pass 156 tests.
- Pass 3 refactor: the exact example diagnostic multiset moved to a data-only
  module so both in-process and real-CLI tests can share one oracle.
- Pass 3 simplify and rederive: the authority comment moved with the data. The
  focused example suite passes; the split adds three nonblank lines and no AST
  branches or functions.
- Pass 4 refactor: the supported-runtime test now validates the complete example
  corpus through the real `deno lint --json` boundary by file and rule ID.
- Pass 4 simplify and rederive: malformed JSON diagnostics fail at the boundary,
  while non-plugin diagnostics remain irrelevant. The focused real-CLI suite
  passes with 4 tests and 1 version-specific ignore. Totals are 7,040 nonblank
  lines, 619 AST branches, and 542 functions.
- Pass 5 refactor: private measurement tools now share AST child traversal,
  branch counting, function detection, and TypeScript file discovery.
- Pass 5 simplify and rederive: the three consumers fell from 430 lines to 347
  lines including the new shared helper. Measurement and hotspot tables are
  unchanged for the same checkout, the readonly comparison remains `29 -> 23`,
  and the total row no longer carries trailing whitespace.
- After the separately approved boundary patch landed as `4ba5acb`, both
  measurement tables were regenerated against the committed source and tests.
- Final measured TypeScript: 7,148 nonblank lines, 627 AST branches, 547
  functions. The production `src` metric is 1,917 lines, 342 branches, and 170
  functions.
- Final coverage: 96.324% lines, 91.831% branches, and 99.301% functions across
  `src`.
- `deno task ci`: 303 passed, 0 failed, 1 Deno 2.2-only test ignored on Deno
  2.9.6.
- `deno task ci:deno-2.2`: 48 passed, 0 failed, 1 Deno 2.2-only test ignored on
  the local Deno 2.9.6 runtime. GitHub CI owns the actual Deno 2.2.0 run.
- `deno publish --dry-run --allow-dirty`: passed with only the intended package
  files.
