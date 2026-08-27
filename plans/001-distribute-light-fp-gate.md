# Plan 001: Distribute the Light FP gate for developers and Codex agents

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving on. Touch
> only the files listed as in scope. If any STOP condition occurs, stop and
> report; do not improvise around it. When done, update the status row for this
> plan in `plans/README.md`, unless a reviewer says they maintain the index.
>
> **Drift check, run first**:
> `git diff --exit-code d201e80 -- deno.json jsr.json README.md q_and_a.md src tests .codex-plugin .agents skills hooks`
> If any in-scope file changed since this plan was written, compare the Current
> state excerpts against the live code. If they mismatch, stop and report.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED
- **Depends on**: none
- **Category**: dx
- **Planned at**: commit `d201e80` and `2026-08-27`

## Why this matters

The lint plugin is available through JSR, but consumers must remember to run it
and agents receive no workflow guidance. A copied `.git/hooks/pre-commit` file
would compete with existing hook managers and be difficult to update safely. Use
one package as the source of truth, a composable Git 2.55 named hook for local
feedback, mandatory CI for enforcement, and an optional Codex plugin for agent
guidance and stop-time validation.

This split keeps each mechanism honest. The Git hook can be bypassed and checks
the working tree. CI checks the committed state. The Codex skill teaches the
workflow, while its hook invokes the actual linter instead of duplicating rule
logic.

## Current state

- `deno.json:2-6` defines package version `0.4.0` and exports only `.` from
  `src/mod.ts`.
- `deno.json:16-18` configures this repository to lint itself with the local
  plugin.
- `deno.json:27-32` exposes the standard `fmt`, `lint`, `test`, `examples:lint`,
  and `ci` tasks. `ci` is the repository's canonical gate.
- `jsr.json:2-15` duplicates package identity and declares `publish.include`.
  However, `deno publish --dry-run` currently uses `deno.json` and includes
  repository-only files. Running `deno publish --dry-run --config jsr.json`
  applies the intended narrow file list. Package metadata therefore has two
  authorities and the default release check does not enforce the intended
  boundary.
- `README.md:45-55` documents an unversioned JSR plugin specifier and has no
  local hook installation path.
- `README.md:32-43` already explains the three-part `lint`, `check`, and `test`
  gate. Preserve this model and add the local and agent entry points without
  claiming that either replaces CI.
- `.github/workflows/ci.yml:19-26` runs `deno task ci` and
  `deno publish --dry-run`. No workflow change is needed.
- `src/mod.ts:13-54` is the lint plugin composition root and public library
  export. Do not mix CLI startup effects into it.
- Tests use `Deno.test`, `@std/assert`, and explicit temporary fixtures. Match
  the small table-driven style in `tests/plugin_test.ts` and
  `tests/ratchet_test.ts`.
- The current baseline is green: `deno task ci` exits 0 with 118 passing tests.
- The development checkout has Deno `2.9.5`. Its default `git` is Apple Git
  `2.50.1`, while Git `2.55.0` is available at `/opt/homebrew/bin/git`. Prefix
  `PATH` with `/opt/homebrew/bin` when running the named-hook E2E cases.
- Git 2.55 named hooks support multiple friendly hook entries plus an existing
  traditional hook. The verified local configuration is:

  ```console
  git config set --local hook.light-fp.command "deno lint"
  git config set --local --append hook.light-fp.event pre-commit
  git hook list --show-scope pre-commit
  ```

  The final command reports `local light-fp` in a configured repository.
- Git merges a friendly hook name across configuration scopes. A global
  `hook.light-fp.event` can therefore activate a local `hook.light-fp.command`.
  Installation owns the name only when the complete effective namespace is
  absent, and uninstall owns it only when the effective namespace contains
  exactly the expected local command and event.
- A pre-commit hook is fast feedback, not an authority.
  `git commit
  --no-verify` bypasses it, and linting the working tree is not
  identical to linting only the staged snapshot. The repository's required CI
  remains the final gate.
- Deno lint plugin configuration accepts plugin specifier strings, not plugin
  options. Hook behavior belongs in the new CLI and documentation, not in the
  lint plugin API.
- No dependency is required for this work. `deno.lock` should remain unchanged.

## Target architecture

| Layer        | Distribution                                   | Responsibility                         | Authority                  |
| ------------ | ---------------------------------------------- | -------------------------------------- | -------------------------- |
| Lint package | Versioned JSR import                           | Rules and pure hook decisions          | Shared implementation      |
| Local hook   | Package CLI plus Git 2.55 local config         | Fast developer feedback                | Optional and bypassable    |
| CI           | Existing `deno task ci` workflow               | Validate committed repository state    | Mandatory                  |
| Codex plugin | Plugin bundle with one skill and one Stop hook | Teach workflow and validate agent work | Optional agent integration |

Do not build an MCP server. This feature needs deterministic local commands and
static instructions, not a network service or model-facing tool protocol.

## Commands you will need

| Purpose          | Command                                                                                                         | Expected on success                                                     |
| ---------------- | --------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| Tool versions    | `deno --version && /opt/homebrew/bin/git --version`                                                             | Deno 2.2 or newer and Git 2.55 or newer for automatic hook installation |
| Typecheck        | `deno check src tests hooks`                                                                                    | Exit 0                                                                  |
| Focused tests    | `deno test -A tests/git_hook_test.ts tests/hook_cli_e2e_test.ts tests/agent_hook_test.ts tests/package_test.ts` | Exit 0 with all new tests passing                                       |
| Full gate        | `deno task ci`                                                                                                  | Exit 0 with formatting, type checking, lint, and all tests passing      |
| Package boundary | `deno publish --dry-run --allow-dirty`                                                                          | Exit 0 and list only the intended package files                         |
| Diff hygiene     | `git diff --check`                                                                                              | Exit 0                                                                  |

## Suggested executor toolkit

- [Git named hook documentation](https://git-scm.com/docs/git-hook) for the
  `hook.<name>.command`, `hook.<name>.event`, and `git hook list` contract.
- [Deno lint plugin documentation](https://docs.deno.com/runtime/reference/lint_plugins/)
  for JSR plugin specifiers and supported Deno versions.
- [OpenAI plugin packaging](https://developers.openai.com/plugins/build/plugins)
  for `.codex-plugin/plugin.json`, root `skills/`, and root `hooks/` layout.
- [OpenAI Codex hooks](https://learn.chatgpt.com/docs/hooks) for Stop hook
  input, blocking responses, and `stop_hook_active` loop prevention.
- `tests/ratchet_test.ts` for pure domain behavior tests.
- `tests/examples_test.ts` for temporary file and subprocess patterns.

## Scope

**In scope, the only files/directories to modify:**

- `deno.json` - make package metadata authoritative, add the hook CLI export,
  bump the minor version, and define the publish boundary.
- `jsr.json` - remove this duplicate configuration after moving its useful
  publish settings to `deno.json`.
- `src/git_hook.ts` - pure argument, Git version, hook state, and action model.
- `src/cli/hook.ts` - small Deno command adapter for install, status, uninstall,
  and help.
- `tests/git_hook_test.ts` - unit tests for the pure hook decisions.
- `tests/hook_cli_e2e_test.ts` - end-to-end tests in isolated Git repositories.
- `.codex-plugin/plugin.json` - Codex plugin manifest.
- `.agents/plugins/marketplace.json` - repo-local Codex marketplace entry that
  makes the plugin installable from this checkout.
- `skills/light-fp/SKILL.md` - agent workflow and architecture guidance.
- `hooks/hooks.json` - Codex Stop hook registration.
- `hooks/verify.ts` - boundary adapter that invokes the repository's own lint
  command when the plugin is configured.
- `tests/agent_hook_test.ts` - Codex hook behavior and loop-prevention tests.
- `tests/package_test.ts` - manifest, export, plugin layout, and
  publish-boundary regression tests.
- `README.md` - versioned setup, local hook lifecycle, CI authority, and agent
  plugin documentation.
- `q_and_a.md` - explain why distribution has separate enforcement layers.
- `plans/README.md` - execution status only.

**Out of scope, do not touch even if related:**

- `.github/workflows/ci.yml` - the existing workflow already runs both required
  gates.
- `src/rules/`, `src/layer.ts`, and `src/ratchet.ts` - no lint semantics change
  is required.
- `examples/` - no example rule behavior changes.
- `deno.lock` - no dependency is added.
- `CHANGELOG.md`, generated files, vendor files, or build outputs.
- Husky, Lefthook, pre-commit framework adapters, or `core.hooksPath` changes.
- A staged-index-only lint implementation. Document working-tree semantics.
- Automatic installation on Git older than 2.55.
- An MCP server or a second implementation of lint rules in agent prose.
- Publishing to JSR, submitting the plugin to a public directory, pushing,
  tagging, releasing, or deploying.

## Git/workflow guidance

- Branch name: work on local `main` unless the operator explicitly asks for a
  branch. If requested, use `feat/distribute-light-fp-gate` from local `main`.
- Commit style: Conventional Commits, matching the current history.
- Keep package/CLI and Codex integration reviewable as separate commits if the
  operator asks to commit.
- Do not push, open a PR, publish a package, or deploy unless the operator
  explicitly asks. Do not push even as part of local completion.

## Steps

### Step 1: Make `deno.json` the one package authority

In `deno.json`:

1. Bump `version` from `0.4.0` to `0.5.0`. The new CLI export and installation
   contract are a backward-compatible feature.
2. Add `"./hook": "./src/cli/hook.ts"` beside the existing root export.
3. Move the narrow `publish.include` list from `jsr.json` into `deno.json`.
   Include only `src`, `README.md`, `LICENSE`, and `deno.json`.
4. Delete `jsr.json`. Do not retain duplicated package identity.
5. Do not add the Codex plugin bundle to the JSR package. It has its own
   distribution lifecycle and should not inflate the lint package.

Add `tests/package_test.ts` with parsed-JSON assertions that:

- package name is `@light-fp/deno-lint-plugin`;
- version is `0.5.0`;
- exports are exactly `.` and `./hook`;
- publish includes are exactly the four intended entries;
- `jsr.json` is absent;
- `.codex-plugin`, `.agents`, `skills`, `hooks`, `tests`, and `.github` are not
  included.

**Verify**:
`deno test -A tests/package_test.ts && deno publish --dry-run --allow-dirty` ->
the test exits 0, the dry run exits 0, and its stderr file list excludes
`.github`, `examples`, `tests`, `q_and_a.md`, `plans`, `.codex-plugin`,
`.agents`, `skills`, and `hooks`.

### Step 2: Model hook installation as pure decisions

Create `src/git_hook.ts` with no Deno APIs and no process startup at module
load. Use readonly tagged unions and exhaustive switches for:

- `HookCommand`: `Install`, `Status`, `Uninstall`, or `Help`;
- `GitVersion`: parsed `major`, `minor`, and `patch`, or `InvalidGitVersion`;
- `HookState`: `Absent`, `Installed`, or `Conflict` carrying all observed scoped
  namespace entries;
- `HookDecision`: `Write`, `Remove`, `NoChange`, `UnsupportedGit`, or
  `RefuseConflict`.

Export pure functions that:

1. Parse only `install`, `status`, `uninstall`, `help`, `--help`, and `-h`.
2. Parse Git output such as `git version 2.55.0` without accepting partial or
   malformed versions.
3. Require Git 2.55 or newer for `install` and `uninstall`.
4. Treat the exact command `deno lint` and the exact single event `pre-commit`
   as installed.
5. Make a repeated install a no-op.
6. Treat the namespace as installed only when it contains exactly one local
   command entry and one local `pre-commit` event entry.
7. Refuse to overwrite or remove a `hook.light-fp` namespace containing a
   non-local value, duplicate value, different command or event, `enabled`,
   `parallel`, or any unknown key.
8. Return an unsupported decision with manual integration guidance for older
   Git. Do not suggest modifying `core.hooksPath` or copying over an existing
   hook.

Keep the expected hook name, command, event, and minimum Git version in one
readonly value so the CLI and tests cannot drift.

**Verify**: `deno test tests/git_hook_test.ts` -> all parsing, version boundary,
idempotency, conflict, and uninstall decision cases pass without permissions.

### Step 3: Add the local hook lifecycle CLI

Create `src/cli/hook.ts` as an adapter with `// @light-fp adapter`. Keep its
effectful surface small:

- accept an injected `RunGit` capability in the main workflow;
- implement the production capability with `new Deno.Command("git", ...)` and
  argument arrays, never shell interpolation;
- run `git rev-parse --show-toplevel` before reading or writing local config;
- read the Git version and complete effective namespace with
  `git config get --show-scope --show-names --all --regexp '^hook\.light-fp\.'`;
- read the complete local namespace with
  `git config get --local --show-names --all --regexp '^hook\.light-fp\.'` and
  validate all values, not only the last value for each key;
- validate all exit codes and decoded output at the boundary;
- apply only the decision returned from `src/git_hook.ts`;
- install with:

  ```console
  git config set --local hook.light-fp.command "deno lint"
  git config set --local --append hook.light-fp.event pre-commit
  ```

- uninstall only the exact owned configuration with:

  ```console
  git config remove-section --local hook.light-fp
  ```

- report `installed`, `already installed`, `not installed`, `removed`,
  `unsupported Git`, and `conflict` distinctly;
- use stable documented exit codes: 0 success, 2 invalid usage, 3 unsupported
  Git, 4 config conflict, and 1 unexpected Git or process failure;
- run only below `if (import.meta.main)` so importing the JSR export has no
  startup effect.

The public commands are:

```console
deno run --allow-run=git jsr:@light-fp/deno-lint-plugin@0.5.0/hook install
deno run --allow-run=git jsr:@light-fp/deno-lint-plugin@0.5.0/hook status
deno run --allow-run=git jsr:@light-fp/deno-lint-plugin@0.5.0/hook uninstall
```

The installed hook command remains `deno lint`, so it uses the consumer
repository's own `deno.json` and locked plugin version.

**Verify**:
`deno check src/git_hook.ts src/cli/hook.ts && deno test -A tests/git_hook_test.ts tests/hook_cli_e2e_test.ts`
-> type checking and all tests exit 0.

### Step 4: Prove real pre-commit behavior in isolated repositories

Add `tests/hook_cli_e2e_test.ts`. Each test must create its own temporary Git
repository and clean it with `try/finally`. Do not touch this repository's Git
configuration.

Cover these user-level cases:

1. Install, inspect with `git hook list --show-scope pre-commit`, reinstall,
   inspect status, uninstall, and inspect absence.
2. Start with a traditional `.git/hooks/pre-commit`; install the named hook and
   prove the traditional file was neither replaced nor edited.
3. Configure the local lint plugin in the fixture. Add a domain file with a
   known violation, run `git hook run pre-commit`, and assert nonzero status.
   Correct the file and assert zero status.
4. Preconfigure `hook.light-fp` with a different command or event. Prove install
   and uninstall both fail without changing the config.
5. Add global, duplicate, and unknown-key namespace cases. Prove all are
   conflicts and no config is changed.
6. Unit-test the older-Git path through the injected capability and prove no
   mutating Git command is issued. Do not require an old Git executable.
7. Run the CLI outside a Git repository and assert a clear failure with no
   mutation.

Normalize environment-dependent Git output before assertions. Assert exit code
and the stable message fragment, not terminal color or absolute temp paths.

**Verify**:
`PATH="/opt/homebrew/bin:$PATH" deno test -A tests/hook_cli_e2e_test.ts` -> all
fixture lifecycle, cross-scope conflict, and real hook execution cases pass.

### Step 5: Package agent instructions as a Codex plugin

Add this exact plugin layout:

```text
.codex-plugin/plugin.json
.agents/plugins/marketplace.json
skills/light-fp/SKILL.md
hooks/hooks.json
hooks/verify.ts
```

In `.codex-plugin/plugin.json`:

- use plugin name `light-fp` and version `0.5.0`;
- describe the package as workflow guidance and local validation for Deno
  projects using this lint plugin;
- point `skills` to `./skills/` and `hooks` to `./hooks/hooks.json` according to
  the current Codex plugin schema;
- declare no MCP server and no external dependency.

In `.agents/plugins/marketplace.json`:

- name the repo-local marketplace `light-fp-local`;
- expose the `light-fp` plugin from the repository root through a `./`-prefixed
  local source path;
- make installation available and require no external authentication;
- include the required category and install policy fields from the current
  marketplace schema.

In `skills/light-fp/SKILL.md`, keep the frontmatter trigger narrow: use the
skill when editing or reviewing a Deno repository whose `deno.json` configures
`@light-fp/deno-lint-plugin`. The instructions must tell the agent to:

- inspect the consumer's Deno config and file layer before editing;
- keep domain functions pure with explicit inputs and outputs;
- put effects at adapter edges and inject capabilities;
- prefer readonly tagged unions and exhaustive handling;
- validate external input at boundaries;
- run `deno lint` on the work and the repository's standard check at the end;
- fix diagnostics in the design, not by relabeling domain code as an adapter or
  adding a suppression without a specific written reason;
- treat the installed linter as the authority and avoid restating every rule.

Do not put the skill under `.agents/skills`. That path is appropriate for a
repo-local standalone skill, while a distributable plugin owns the root
`skills/` directory declared by its manifest.

**Verify**: `deno test -A tests/package_test.ts` -> the plugin and marketplace
manifests parse, declared paths exist, skill frontmatter is present, and no MCP
configuration exists.

### Step 6: Add a fail-safe Codex Stop validation hook

Register one `Stop` hook in `hooks/hooks.json`. Invoke the implementation using
`${PLUGIN_ROOT}` and the minimum Deno permissions needed to read configuration
and launch Deno. Do not grant network, environment, write, or broad run access.

Implement `hooks/verify.ts` as an adapter with pure parsing and decision helpers
that can be unit tested. It must:

1. Read and parse one JSON input object from stdin. Validate `cwd`, event name,
   and `stop_hook_active` before use.
2. Starting at `cwd`, locate the nearest `deno.json` or `deno.jsonc` without
   crossing the filesystem root.
3. No-op with `{}` unless that config contains a lint plugin specifier for
   `@light-fp/deno-lint-plugin` or the local `./src/mod.ts` specifier used by
   this repository.
4. Run `deno lint` in the discovered config directory with an argument array and
   capture output. Use the current Deno executable rather than a shell.
5. Return `{}` on success.
6. On first failure, return a blocking Stop response with a short reason that
   tells the agent to run `deno lint`, inspect the local diagnostics, and fix
   the design.
7. If `stop_hook_active` is already true and lint still fails, return a
   non-continuing response with a concise stop reason. This prevents an infinite
   correction loop.
8. Do not copy source snippets or the full linter output into the hook response.
   Source can contain credentials or personal data. The agent can run the local
   command to see diagnostics.
9. Fail closed for malformed hook input only when the hook was selected. Outside
   a configured Light FP repository, remain a no-op.

Add `tests/agent_hook_test.ts` covering malformed input, no config, unrelated
config, local development config, versioned JSR config, lint success, first
failure, repeated failure, paths with spaces, and child-process failure. Inject
filesystem and process capabilities so most tests are pure. Keep one isolated
subprocess test for the real JSON protocol.

**Verify**:
`deno check hooks tests/agent_hook_test.ts && deno test -A tests/agent_hook_test.ts`
-> all protocol, activation, validation, redaction, and loop-prevention cases
pass.

### Step 7: Document installation and authority boundaries

Update `README.md`:

1. Pin the quick-start plugin to the supported minor line, initially
   `jsr:@light-fp/deno-lint-plugin@^0.5.0`.
2. Add a `Local pre-commit hook` section with exact install, status, uninstall,
   and `git hook list --show-scope pre-commit` commands.
3. State the Git 2.55 minimum for automatic installation. For older Git, show a
   manual recipe that adds `deno lint` to the user's existing hook system. Do
   not provide an overwrite command.
4. State that the hook checks the working tree, can be bypassed with
   `--no-verify`, and does not replace CI.
5. Add a compact enforcement table for package, local hook, CI, Codex skill, and
   Codex Stop hook.
6. Add an `Agent integration` section with the exact local install sequence
   `codex plugin marketplace add <checkout>` and
   `codex plugin add light-fp@light-fp-local`, plus list and removal commands.
   Explain what the skill and hook each do, that a new session is required, and
   that bundled hooks require explicit review and trust. Do not claim the plugin
   is available from a public directory until it actually is.
7. Update all package import examples to a consistent supported version range.

Update `q_and_a.md` with one focused answer: local hooks optimize feedback, CI
owns enforcement, the agent skill carries reasoning guidance, and the agent hook
calls the same linter. Explain why these are separate instead of embedding Git
or agent behavior into lint rules.

Record these implementation assumptions in the new README sections:

- consumers use Deno 2.2 or newer;
- automatic local installation requires Git 2.55 or newer;
- CI remains required;
- the Codex plugin is optional and locally testable but is not published by this
  plan.

**Verify**:
`deno fmt --check README.md q_and_a.md skills/light-fp/SKILL.md && rg -n '0\.4\.0|jsr:@light-fp/deno-lint-plugin"' README.md q_and_a.md skills hooks`
-> formatting exits 0 and the search finds no stale unversioned or 0.4.0
installation examples.

### Step 8: Run the complete release-quality gate

Run the focused tests first, then the repository's canonical task and package
dry run. Inspect the dry-run file list manually because exit 0 alone did not
catch the current broad package.

Do not publish, install into the user's global Codex configuration, or mutate
this repository's local Git hook during verification. All installation tests
must remain inside temporary fixtures.

**Verify**:

```console
deno test -A tests/git_hook_test.ts tests/hook_cli_e2e_test.ts tests/agent_hook_test.ts tests/package_test.ts
deno task ci
deno publish --dry-run --allow-dirty
git diff --check
git status --short
```

Expected: all commands exit 0; the dry run contains only `src`, `README.md`,
`LICENSE`, and `deno.json`; the status lists only in-scope source, test, docs,
plugin, plan, and deletion changes; `deno.lock` is unchanged.

## Test plan

- `tests/git_hook_test.ts`
  - exact argument grammar;
  - valid, malformed, boundary, and future Git versions;
  - absent, installed, and conflicting state;
  - install and uninstall decisions are exhaustive and idempotent.
- `tests/hook_cli_e2e_test.ts`
  - real temp repository install/status/uninstall lifecycle;
  - coexistence with a traditional hook;
  - violating file blocks `git hook run pre-commit` and corrected file passes;
  - conflict and outside-repository failures do not mutate config.
- `tests/agent_hook_test.ts`
  - config discovery and activation;
  - malformed and irrelevant input;
  - successful lint, first failure, and repeated failure;
  - no diagnostics or source text leaked in JSON responses;
  - real subprocess protocol.
- `tests/package_test.ts`
  - one package authority, exact exports, exact publish includes;
  - valid Codex plugin and repo marketplace manifests and referenced paths;
  - no plugin files in the JSR publish set and no MCP declaration.
- Existing full suite
  - all 118 baseline tests plus the new tests remain green under `deno task ci`.

## Done criteria

All must hold:

- [ ] `deno task ci` exits 0 with all existing and new tests passing.
- [ ] `deno publish --dry-run --allow-dirty` exits 0 and lists only the intended
      JSR package files on stderr.
- [ ] The CLI installs, reports, and removes only `hook.light-fp` in a temp
      repository using Git 2.55 named hooks.
- [ ] An existing traditional pre-commit hook remains byte-for-byte unchanged.
- [ ] Git older than 2.55 and conflicting config produce no mutation.
- [ ] A real lint violation makes `git hook run pre-commit` fail, and correcting
      it makes the command pass.
- [ ] The Codex skill supplies concise Light FP workflow guidance without
      duplicating lint rules.
- [ ] The Stop hook runs only in configured repositories, blocks once on lint
      failure, and cannot loop indefinitely.
- [ ] Hook responses do not expose source, raw diagnostics, credentials, or
      personal data.
- [ ] README commands and version specifiers match the shipped exports.
- [ ] No files outside the in-scope list are modified and `deno.lock` is
      unchanged.
- [ ] `plans/README.md` status is updated to `DONE`, unless the reviewer owns
      the index.

## STOP conditions

Stop and report back if:

- current-state excerpts do not match the live code after the drift check;
- no Git executable with the named-hook `command` and `event` behavior
  documented for Git 2.55 is available for E2E verification;
- Codex plugin or Stop hook schemas differ from the current official
  documentation;
- the JSR dry run cannot exclude repository-only files using `deno.json`;
- a correct Deno permission set requires network, write, environment, or
  unrestricted process access for the Codex hook;
- hook installation would require changing `core.hooksPath`, replacing a hook
  file, or modifying configuration outside `hook.light-fp`;
- the implementation requires a dependency or changes `deno.lock`;
- a step fails twice after reasonable local correction;
- the work requires touching an out-of-scope file;
- a credential, private repository value, or other sensitive data appears.

## Maintenance notes

- Review the CLI and Codex hook as security boundaries. Both start subprocesses,
  so arguments must stay fixed and shell-free.
- Keep Git hook ownership narrow. Future commands can extend the tagged unions,
  but must not silently adopt config written by another tool.
- Keep the skill short. Rule details belong in the installed linter and README,
  not in duplicated agent prose that can drift.
- Revisit support for older Git only if user demand justifies a framework
  adapter. Do not introduce a compatibility shim preemptively.
- Public JSR publication and public Codex plugin listing are separate operator
  actions and remain deferred.
