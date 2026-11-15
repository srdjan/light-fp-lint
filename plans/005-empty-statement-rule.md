# 005: Empty statements are a lint error in every layer

Status: DONE

## Request

On 2026-11-15 the user asked: "assure that a standalone `;` (an empty statement)
is a lint error". The request has no layer condition.

## Measured facts (Deno 2.9.8)

- F1: A standalone `;` has no node in the plugin AST. Deno drops the `;` and
  every later statement in the same list. This occurs in `Program.body`,
  `BlockStatement.body`, `SwitchCase.consequent`, and `TSModuleBlock.body`.
  Built-in rules still see the code.
- F2: At runtime, `StaticBlock.body` is a `BlockStatement` node, although the
  `Deno.lint` types declare `Statement[]`. The `BlockStatement` visitor already
  covers `static {}` blocks.
- F3: A `SwitchCase` range covers its original text, including the hidden
  statements. The `test` range excludes parentheses: in `case (1):` the test is
  only `1`.
- F4: A `TSModuleBlock` range is `{ ... }`, like a `BlockStatement`.
- F5: A `;` in a class body hides no class members.
- F6: A lone `;` used as a body is `null`. For `if (a) {} else ;` the
  `alternate` is `null`, as for `if (a) {}`. The `IfStatement` range covers
  `else ;`. For `if (d) if (e) {} else ;` the outer range ends where its
  consequent ends.
- F7: `deno fmt` deletes a standalone `;` in a statement list. It keeps `else;`
  and a lone `;` body. A `// deno-fmt-ignore` comment does not keep a standalone
  `;`.
- F8: Before this plan, `statement-forms` held both checks and ran in domain
  files only. It missed `case` bodies, `namespace` bodies, and `else ;`. In
  adapter and prelude files, `;` followed by any code hid that code from every
  plugin rule.

## Decisions

- D11 (placement): a new rule, `light-fp/no-empty-statement`, that runs in every
  layer. The rejected option was to run part of `statement-forms` in every
  layer. That rule is a domain-only restriction rule. The bypass guard protects
  the gate itself, like `require-ignore-reason`.
- D12 (scope): the new rule owns both forms, the standalone `;` and the lone `;`
  body. `statement-forms` loses both checks, so no form reports twice.

## Unit U7 (add `no-empty-statement`)

Model: Sonnet. Turn budget: 60. Acceptance: `deno task ci` passes, and the real
CLI reports `light-fp/no-empty-statement` for an adapter file that starts with
`;`.

Files:

- `src/rules/no_empty_statement.ts` (new): move `reportHiddenCode` and
  `reportEmptyBody` from `statement_forms.ts`. Do not check the layer. Add the
  `SwitchCase`, `TSModuleBlock`, and `else ;` checks.
- `src/rules/statement_forms.ts`: remove both checks and their visitors.
- `src/mod.ts`: register the rule in the "Meta" group.
- `tests/no_empty_statement_test.ts` (new), `tests/statement_forms_test.ts`,
  `tests/plugin_test.ts`, `tests/deno_2_2_cli_test.ts`,
  `hooks/activation_probe.ts`, one bad example and
  `tests/example_expectations.ts`.
- `README.md`, `plans/004-typescript-restrictions.md` (row for the empty
  statement), and `plans/README.md`.
