# @light-fp/deno-lint-plugin

**Deno lint plugin enforcing Light Functional Programming (TypeScript) discipline.**  
Fast, syntactic rules + pragmatic auto-fixes. Publishable on JSR.

## Install (local repo)
```jsonc
// deno.json
{
  "lint": { "plugins": ["./src/mod.ts"] }
}
```
Run:
```bash
deno lint --fix
```

## Install (JSR)
After publishing:
```jsonc
// deno.json
{
  "lint": { "plugins": ["jsr:@light-fp/deno-lint-plugin"] }
}
```

## Options
Each rule accepts a common options object; see `src/util/options.ts` for defaults.
Configure via `deno.json`:
```jsonc
{
  "lint": {
    "plugins": [ ["jsr:@light-fp/deno-lint-plugin", {
      "effectIdentifiers": ["IO","Console","FS","Clock","Env","Throw","State"],
      "adapterGlobs": ["**/src/adapters/**/*.ts"],
      "domainGlobs": ["**/src/**/*.ts"],
      "ignoreGlobs": ["**/tests/**/*.ts"]
    }] ]
  }
}
```

## Rules
- `light-fp/effect-brand-origin` — Effect brands originate from approved helpers; auto-fix wraps with `brand(...)` when safe.
- `light-fp/no-direct-effect-assertion` — Disallow TS `as` assertions to attach effect brands.
- `light-fp/result-type-usage` — Forbid raw throws in domain functions; prefer `Result<E, A>`.
- `light-fp/interface-vs-type` — Prefer `type` for data and `interface` for ports; safe auto-fixes.
- `light-fp/readonly-data` — Enforce `readonly` properties and arrays in data type literals.
- `light-fp/no-class` — Disallow classes in domain code.
- `light-fp/imports-boundary` — Domain must not import from adapters.
- `light-fp/no-top-level-effects` — No side-effects at module top level in domain.
- `light-fp/no-new` — Disallow `new` in domain.
- `light-fp/no-this` — Disallow `this` in domain.

## Developing
- `deno task test` — unit tests
- `deno task test:e2e` — runs the plugin against fixtures and verifies `--fix` output
- `deno task examples:lint` — try it on examples

## Publishing to JSR
```bash
deno publish
```
