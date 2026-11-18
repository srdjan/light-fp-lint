# AGENTS.md

notes for the agents working on light-fp-lint.

## build and test

- Run `deno task ci` before each commit. It must exit 0.

## how we work

- Commit subjects use Conventional Commits, such as
  `fix(rules): allow all-spread ordered merges`.
- small changes, the tests run before each commit
