# TypeScript restrictions from the zts-model-1 profile

Status: IN PROGRESS

## Goal

Add the restrictions of the zts-model-1 source profile that apply to standard
TypeScript to the `light-fp` plugin. The source is
`../_TEAMOK/ZTTP/docs/ts-restrictions.md` at ZTTP commit `a1db8b0b`. The linter
stays a standard TypeScript linter. It does not parse or support ZTS syntax.

## Decisions

- D1 (delivery): the new rules join the `light-fp` plugin. They apply to
  `domain` files only. `adapter` and `prelude` files stay exempt.
- D2 (spec gaps): parity with `zts check` does not matter. Each restriction is
  judged on its value in standard TypeScript.
- D3 (rule split): one rule for each section of the source document.
- D4 (array fix): the `readonly-data` autofix writes `readonly T[]` for
  `Array<T>`. The `Map` and `Set` fixes stay `ReadonlyMap` and `ReadonlySet`.
- D5 (`async`): skip. Domain files keep `async`, `await`, and `Promise`.
- D6 (ambient names): a closed allowlist. The allowed unbound value names are
  `Array`, `Boolean`, `Date`, `JSON`, `Math`, `Number`, `Object`, `String`,
  `parseFloat`, `parseInt`, `undefined`, `NaN`, `Infinity`, and `Promise`.
- D7 (high-churn bans): adopt G2 and G3. From G4, adopt only ZTS061. Skip G1 and
  the rest of G4.

## Adoption filter

A restriction is adopted when all three conditions are true:

1. One file's AST and filename decide it. No type information is necessary.
2. Its replacement is standard TypeScript. `match` from `ts-pattern` is the
   replacement for `switch`.
3. No current `light-fp` rule, Deno `recommended` rule, TypeScript parser error,
   or `deno check` error already enforces it.

The ZTS codes stay in the README tables to show where each check came from.
Diagnostic messages do not show ZTS codes, because the linter targets standard
TypeScript.

## New rules

| Rule                         | Source section               |
| ---------------------------- | ---------------------------- |
| `light-fp/module-forms`      | Source Files And Modules     |
| `light-fp/lexical-forms`     | Lexical Rules                |
| `light-fp/declaration-forms` | Declarations And Bindings    |
| `light-fp/function-forms`    | Functions And Parameters     |
| `light-fp/statement-forms`   | Statements And Control Flow  |
| `light-fp/operator-forms`    | Operators And Expressions    |
| `light-fp/record-forms`      | Records, Arrays, And Strings |
| `light-fp/type-forms`        | Types                        |
| `light-fp/ambient-names`     | Ambient Names And Effects    |

## Classification

"Adopt" names the rule. "Covered" names the current enforcer. "Skip" gives the
reason. D7 groups are marked G1 to G4.

### Source files and modules

| Restriction                                                       | Code                   | Verdict                                                          |
| ----------------------------------------------------------------- | ---------------------- | ---------------------------------------------------------------- |
| `.js`, `.jsx`, `.mjs`, `.cjs` domain file                         | ZTS052                 | Adopt: `module-forms`                                            |
| `.tsx` domain file                                                | ZTS052                 | Skip: the ZTS replacement `h()` is ZTS-only, and JSX is standard |
| Default import, including `import type X from`                    | ZTS002                 | Adopt: `module-forms`                                            |
| Namespace import `import * as X`                                  | ZTS002                 | Adopt: `module-forms`                                            |
| Side-effect import, non-relative specifier                        | ZTS002                 | Adopt: `module-forms`                                            |
| Side-effect import, relative specifier                            | ZTS002                 | Covered: `layer-boundary`                                        |
| Dynamic `import()`                                                | ZTS002                 | Covered: `layer-boundary`                                        |
| `export ... from`, `export *`, `export { x }` of an imported name | ZTS002                 | Adopt: `module-forms`                                            |
| `export default`                                                  | ZTS056                 | Adopt: `module-forms`                                            |
| `export let`, top-level `let`, module-scope writes                | ZTS057, ZTS604, ZTS310 | Covered: `pure-module`                                           |
| `namespace` and `module`                                          | ZTS001                 | Covered: `no-oo`                                                 |
| `zttp:` modules                                                   | ZTS053, ZTS206, ZTS207 | Skip: ZTS-only                                                   |

### Lexical rules

| Restriction                                     | Code           | Verdict                                         |
| ----------------------------------------------- | -------------- | ----------------------------------------------- |
| Escape outside the closed set, such as `"a\qb"` | ZTS013         | Adopt: `lexical-forms`                          |
| Backslash before a real newline                 | ZTS045         | Adopt: `lexical-forms`                          |
| Non-ASCII identifier                            | ZTS046         | Adopt: `lexical-forms`                          |
| Legacy octal `0755` and `08`                    | ZTS012         | Covered: Deno `no-octal` (probe: fired on both) |
| Unterminated string, digitless `0x`             | ZTS008, ZTS012 | Covered: TypeScript parser                      |
| Missing `;`                                     | ZTS047         | Skip: `deno fmt` inserts semicolons by default  |

### Declarations and bindings

| Restriction                                                                      | Code           | Verdict                                                        |
| -------------------------------------------------------------------------------- | -------------- | -------------------------------------------------------------- |
| `var`, `let` never reassigned                                                    | ZTS001, ZTS604 | Covered: Deno `no-var`, `prefer-const`                         |
| Declaration destructuring and renames, including `for...of` heads and parameters | ZTS001         | Adopt: `declaration-forms` (G3)                                |
| `const f = () => ...` and `const f = function ...`                               | ZTS608         | Adopt: `declaration-forms` (G3)                                |
| `export const f = () => ...`                                                     | ZTS609         | Adopt: `declaration-forms` (G3)                                |
| `class`, `enum`, decorators, access modifiers                                    | ZTS001         | Covered: `no-oo`                                               |
| `interface`, `type`, `distinct type`, `nominal`                                  | ZTS048-051     | Skip: the replacements `structural` and `nominal` are ZTS-only |

### Functions and parameters

| Restriction                                                        | Code                   | Verdict                                            |
| ------------------------------------------------------------------ | ---------------------- | -------------------------------------------------- |
| Function expression                                                | ZTS001                 | Adopt: `function-forms`                            |
| Generator and `yield`                                              | ZTS001                 | Adopt: `function-forms`                            |
| `async`, `await`, `Promise`                                        | ZTS001                 | Skip (D5): no standard synchronous I/O replacement |
| Default parameter                                                  | ZTS054                 | Adopt: `function-forms`                            |
| Optional parameter `name?: T`                                      | ZTS055                 | Adopt: `function-forms`                            |
| Rest parameter                                                     | ZTS001                 | Adopt: `function-forms`                            |
| Call-site spread `f(...args)`                                      | ZTS616                 | Adopt: `function-forms`                            |
| Function declaration without full parameter and return annotations | ZTS601                 | Adopt: `function-forms`                            |
| `this`, `super`                                                    | ZTS001                 | Covered: `no-oo`                                   |
| Arity, `Effects` ceilings                                          | ZTS202, ZTS610, ZTS623 | Skip: needs types, or ZTS-only                     |

### Statements and control flow

| Restriction                                          | Code           | Verdict                                                                                          |
| ---------------------------------------------------- | -------------- | ------------------------------------------------------------------------------------------------ |
| `switch`                                             | ZTS001         | Adopt: `statement-forms`, hint `match` from `ts-pattern`                                         |
| `while`, `do...while`, C-style `for`                 | ZTS001         | Adopt: `statement-forms`                                                                         |
| `for...in`                                           | ZTS001         | Adopt: `statement-forms`                                                                         |
| Labeled statement                                    | ZTS001         | Adopt: `statement-forms`                                                                         |
| Empty statement `;`                                  | ZTS001         | Adopt: `statement-forms`                                                                         |
| `for...of` body that mutates its iterated identifier | ZTS622         | Adopt: `statement-forms` (mutating method call, index write, or `length` write on the same name) |
| `throw`, `try`                                       | ZTS001         | Covered: `no-throw`                                                                              |
| `debugger`                                           | ZTS001         | Covered: Deno `no-debugger`                                                                      |
| `break` outside a loop                               | ZTS022, ZTS023 | Covered: TypeScript parser                                                                       |
| Fallback `assert`, `range(n)` members                | ZTS002, ZTS201 | Skip: ZTS-only                                                                                   |

### Operators and expressions

| Restriction                                                | Code               | Verdict                                            |
| ---------------------------------------------------------- | ------------------ | -------------------------------------------------- |
| `==`, `!=`                                                 | ZTS001             | Adopt: `operator-forms`                            |
| `++`, `--`                                                 | ZTS001             | Adopt: `operator-forms`                            |
| Compound and logical assignment                            | ZTS613, ZTS001     | Adopt: `operator-forms`                            |
| Assignment inside an expression                            | spec               | Adopt: `operator-forms`                            |
| Call or update inside an assignment target                 | spec               | Adopt: `operator-forms`                            |
| `instanceof`, `in`                                         | ZTS001             | Adopt: `operator-forms`                            |
| Unary `+`, unary `void`, `delete`                          | ZTS001             | Adopt: `operator-forms`                            |
| `new`                                                      | ZTS001             | Adopt: `operator-forms` (G2)                       |
| Regex literal, `RegExp`                                    | ZTS001             | Adopt: `operator-forms` (G2)                       |
| Sequence expression, tagged template                       | ZTS003             | Adopt: `operator-forms`                            |
| Template interpolation                                     | ZTS001             | Skip (D7, G1)                                      |
| `+` with a string operand                                  | ZTS105             | Skip (D7, G1)                                      |
| Optional call `f?.()`, optional computed access `xs?.[i]`  | ZTS001             | Adopt: `operator-forms`                            |
| Conditional expression as an arm of a conditional          | ZTS621             | Adopt: `operator-forms`                            |
| Comparison with a boolean literal                          | ZTS620             | Adopt: `operator-forms`                            |
| `pipe()`, `guard()`                                        | ZTS001             | Skip: a name-based ban. House style uses `aspipes` |
| Non-boolean conditions, operand types, effectful `?:` arms | ZTS100-106, ZTS612 | Skip: needs types or effect analysis               |

### Records, arrays, and strings

| Restriction                                         | Code                   | Verdict                                          |
| --------------------------------------------------- | ---------------------- | ------------------------------------------------ |
| Object literal shorthand `{ value }`                | ZTS001                 | Adopt: `record-forms` (G3)                       |
| Object method `{ m() {} }`                          | ZTS001                 | Adopt: `record-forms` (G3)                       |
| Getter and setter                                   | ZTS001                 | Covered: `no-oo`                                 |
| Computed key, numeric key                           | ZTS001                 | Adopt: `record-forms`                            |
| Spread after a key, or a second spread              | ZTS614                 | Adopt: `record-forms`                            |
| `Object.assign`, `Object.freeze`, `Object.isFrozen` | ZTS001                 | Adopt: `record-forms`                            |
| Dynamic property access `obj[key]`                  | ZTS605                 | Skip: needs types to tell a record from an array |
| Runtime member set, tuple writes, `readonly` writes | ZTS200, ZTS201, ZTS215 | Skip: ZTS runtime, or `deno check`               |

### Null, undefined, absence, and match

Every row needs types (ZTS200, ZTS203, ZTS308, ZTS309, ZTS600, ZTS624) or ZTS
syntax (ZTS062, ZTS205, ZTS216, ZTS603, ZTS625, ZTS626). Skip all. `ts-pattern`
owns exhaustive matching.

### Types

| Restriction                                                                                                                                                               | Code           | Verdict                                                                                                                  |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `any`                                                                                                                                                                     | ZTS041         | Covered: `no-unsafe-cast`, Deno `no-explicit-any`                                                                        |
| `as`, `<T>x`                                                                                                                                                              | ZTS042         | Covered: `no-unsafe-cast`. The `as const` and local-type allowances stay, because standard TypeScript brands need a cast |
| `satisfies`                                                                                                                                                               | ZTS043         | Adopt: `type-forms`                                                                                                      |
| `Array<T>`, `ReadonlyArray<T>`                                                                                                                                            | ZTS058, ZTS059 | Adopt: `type-forms`                                                                                                      |
| `void` type                                                                                                                                                               | ZTS060         | Adopt: `type-forms`                                                                                                      |
| `string`, `number`, `boolean`, `object`, `unknown`, arrays of them, or unions with them, in an exported function signature                                                | ZTS061         | Adopt: `type-forms` (G4)                                                                                                 |
| Generic function types, `keyof`, indexed access, index signatures, type-position `typeof`, conditional, mapped, `infer`, overloads, `declare`, generic defaults, variance | spec           | Skip (D7, G4)                                                                                                            |
| Recursive cycles, predicates, type arguments, nine type parameters                                                                                                        | ZTS209-212     | Skip: `deno check`, or a ZTS limit                                                                                       |

### Ambient names and effects

| Restriction                         | Code                           | Verdict                                      |
| ----------------------------------- | ------------------------------ | -------------------------------------------- |
| Value name outside the D6 allowlist | ZTS629                         | Adopt: `ambient-names`                       |
| `eval`, `Proxy`, `Reflect`          | ZTS001                         | Adopt: `ambient-names`                       |
| `JSON.parse`                        | spec                           | Adopt: `ambient-names`. It returns `any`     |
| `JSON.stringify`                    | spec                           | Skip: pure, with no standard replacement     |
| `Date.now()`, `Math.random()`       | admitted                       | Covered: `no-ambient-effects` stays stricter |
| Capability calls, Request, Response | ZTS602, ZTS201, ZTS203, ZTS213 | Skip: ZTS-only                               |

## Known double reports

These nodes get one diagnostic from each of two rules. Each message gives a
different reason. The plan accepts the overlap instead of coupling rules.

- `Array<T>` in a data position: `readonly-data` and `type-forms`.
- `void x;` and a sequence statement: `no-discarded-values` and
  `operator-forms`.
- `new X()` and a tagged template at module scope: `pure-module` and
  `operator-forms`.

## Units

| Unit | Work                                                            | Model  | Files                                                                      | Acceptance                                           | Turns |
| ---- | --------------------------------------------------------------- | ------ | -------------------------------------------------------------------------- | ---------------------------------------------------- | ----- |
| U0   | D4 fix: `Array<T>` to `readonly T[]`, test first                | Opus   | `src/rules/readonly_data.ts`, `tests/fix_test.ts`                          | the new test fails first, then `deno task ci` passes | -     |
| U1   | Register nine stub rules                                        | Opus   | `src/mod.ts`, `src/rules/*_forms.ts`, `src/rules/ambient_names.ts`         | `deno task ci` passes                                | -     |
| U2   | `module-forms`, `lexical-forms`                                 | Sonnet | two rule files, `tests/module_lexical_forms_test.ts`                       | that test passes; check, lint, fmt clean             | 40    |
| U3   | `declaration-forms`, `function-forms`                           | Sonnet | two rule files, `tests/declaration_function_forms_test.ts`                 | same                                                 | 40    |
| U4   | `statement-forms`, `operator-forms`                             | Sonnet | two rule files, `tests/statement_operator_forms_test.ts`                   | same                                                 | 50    |
| U5   | `record-forms`, `type-forms`                                    | Sonnet | two rule files, `tests/record_type_forms_test.ts`                          | same                                                 | 40    |
| U6   | `ambient-names`                                                 | Sonnet | one rule file, `tests/ambient_names_test.ts`                               | same                                                 | 40    |
| U7   | Make `src` domain files pass the new rules                      | Sonnet | `src/layer.ts`, `src/ratchet.ts`, `src/git_hook.ts`, any other domain file | `deno task ci` passes, no new suppressions           | 50    |
| U8   | Make `.good.ts` examples pass; update `.bad.ts` expectations    | Sonnet | `examples/src/**`, `tests/example_expectations.ts`                         | `deno task ci` passes                                | 40    |
| U9   | README rules, guarantees, limits, prelude example; `q_and_a.md` | Opus   | `README.md`, `q_and_a.md`, `skills/light-fp/SKILL.md`                      | `deno task ci` passes                                | -     |

U2 to U6 run in parallel after U1. U7 and U8 run after U2 to U6. Executors do
not commit. Opus reviews each diff, runs the acceptance commands, and commits
each unit separately. Each test case is a literal source and a literal expected
count, through `tests/harness.ts`.

## Out of scope

- A version bump and a release. The user releases.
- The `gotai:typescript-expert` skill, which pins `light-fp-lint` 0.6.1.
