# 006: Verification gates

Status: DONE

## Request

On 2026-11-17 the user asked for a review of tests, hooks, CLAUDE.md, and skills
against the article "How the Claude Code team thinks about verification". The
user then accepted every recommended option for decisions 1 to 6.

## Measured facts (Deno 2.9.8, Git 2.56.1, macOS)

- F1: Seven full suite runs (3 in order, 3 shuffled, 1 parallel) passed 946
  tests with 1 ignored. No unit test took 1 s or more.
- F2: The pre-commit hook runs `deno task ci` on the working tree. An exported
  index plus only `src/rules/declaration_forms.ts` and its test fails
  `deno check` with TS2305, but the working-tree gate passes.
- F3: `deno task ci` on an exported index passes 912 tests in 8.0 s. The suite
  does not need `.git` in the tree.
- F4: Git exports `GIT_INDEX_FILE=.git/index` for `git commit -m`, and an
  absolute temporary index path for `git commit -a` and `git commit <paths>`. A
  `git commit -a` probe under the current hook committed only the changed file.
- F5: The README ratchet recipe fails `deno check` with TS2440 (`baseline`
  declared twice) and TS2304 (`join`, `relative`).
- F6: `deno publish --dry-run --allow-dirty` passes in 0.77 s, also with the
  network blocked through an unreachable proxy.
- F7: `"test": { "exclude": ["plans"] }` makes
  `deno test -A plans/branch_compare_test.ts` report "No test modules found".
- F8: `CODEX_HOME=<empty dir> codex plugin list` shows no marketplace plugins,
  so `CODEX_HOME` isolates the plugin commands that were tried.
- F9: On Deno 2.2.0, all three floor tests fail at `a12382a`. The CLI reports no
  plugin diagnostics, because `no_empty_statement.ts` calls `getAllComments()`
  directly. After a local fallback patch, `runPlugin` still throws on
  `sourceCode.text`, and the CLI misses one `declaration-forms` diagnostic.

## Units

| Unit | Decision | Change                                                        | Files                                                       | Model  | Acceptance check                                                        | Turns |
| ---- | -------- | ------------------------------------------------------------- | ----------------------------------------------------------- | ------ | ----------------------------------------------------------------------- | ----- |
| U1   | 1 (C1)   | Pre-commit gate runs on the staged snapshot                   | `.githooks/pre-commit`, `tests/pre_commit_test.ts`, README  | Sonnet | New test fails on the old hook, passes on the new hook; `deno task ci`  | 25    |
| U2   | 1 (B1)   | README ratchet recipe compiles, and a test keeps it compiling | `README.md`, `tests/readme_ratchet_test.ts`                 | Sonnet | New test fails before the README fix, passes after; offline; lock clean | 25    |
| U3   | 1 (B2)   | `ci:base` runs `deno publish --dry-run --allow-dirty`         | `deno.json`                                                 | Opus   | `deno task ci`                                                          | 3     |
| U4   | 5 (A1)   | Test tasks run `tests` only, so `plans/` leaves the gate      | `deno.json`                                                 | Opus   | `deno task ci` passes 945; explicit plans run still works               | 3     |
| U5   | 2 (C2)   | Deny `git commit --no-verify` and `-n` for Claude Code        | `~/.claude/settings.json`                                   | Opus   | `git commit --dry-run --no-verify` is denied                            | 5     |
| U6   | 3 (C3)   | Commit rule names the verify skill; project verify skill      | `~/.claude/CLAUDE.md`, `.claude/skills/verify/SKILL.md`     | Opus   | One run of every skill step                                             | 8     |
| U7   | 4 (D)    | Three-attempt rule in its own section; copy to `~/AGENTS.md`  | `~/.claude/CLAUDE.md`, `~/AGENTS.md`                        | Opus   | Rule text read back; `agents-git` commit                                | 4     |
| U8   | 7        | Drop Deno 2.2 support: latest Deno only                       | `src/comments.ts`, `src/layer.ts`, 2 rules, 3 tests, README | Sonnet | Shebang pragma test; break-line mutation caught; `deno task ci`         | 30    |

Commit order: U1 first, so that each later commit is judged on its own staged
files. Each unit gets its own commit. Nobody pushes.

The working tree holds unrelated uncommitted work in `README.md`, `src/ast.ts`,
`src/rules/declaration_forms.ts`, `src/rules/statement_forms.ts`, and two test
files. Commits stage only the unit's own hunks.

## Status

- U1 `e0f16fb`, U2 `c981a59`, U3 `5881e07`, U4 `827eb8a`, U6 skill `575d64e`.
- U5 `668bd42` in the `~/.claude` repository.
- U6 commit rule `7dbb2df` and U7 `7dc8b99` in `agents-git`.
- U4 used `deno test -A tests` instead of a config exclude, because of F7.
- U5 deny rules also refuse a commit whose message contains `-n` or the
  hook-skipping flag text.
- On 2026-11-17 the user decided to support only the latest Deno, which replaces
  the floor gate in U8.
