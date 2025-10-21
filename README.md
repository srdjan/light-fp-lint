# @light-fp/deno-lint-plugin

[![Version](https://img.shields.io/badge/version-0.3.0-blue)](deno.json)
[![JSR](https://img.shields.io/badge/jsr-@light--fp%2Fdeno--lint--plugin-black?logo=deno)](https://jsr.io/@light-fp/deno-lint-plugin)
[![License: MIT](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)

> Deno lint plugin that keeps Light Functional Programming discipline enforceable, testable, and discoverable across your TypeScript codebase.

## Table of Contents
- [Quick Start](#quick-start)
- [Installation](#installation)
  - [Local Development](#local-development)
  - [JSR Usage](#jsr-usage)
- [Distribution & Installation](#distribution--installation)
  - [Publisher Playbook (JSR)](#publisher-playbook-jsr)
  - [Consumer Setup](#consumer-setup)
  - [Why JSR](#why-jsr)
  - [Caveats & Special Considerations](#caveats--special-considerations)
  - [Live Examples](#live-examples)
- [Configuration](#configuration)
- [Effect Branding Overview](#effect-branding-overview)
- [Domain vs Adapter Boundary](#domain-vs-adapter-boundary)
- [Rule Reference](#rule-reference)
  - [Effect Management Rules](#effect-management-rules)
  - [Type System Rules](#type-system-rules)
  - [Architectural Rules](#architectural-rules)
  - [Object-Oriented Restrictions](#object-oriented-restrictions)
- [Migration Guide](#migration-guide)
- [Best Practices](#best-practices)
- [Auto-fix Workflow](#auto-fix-workflow)
- [Common Patterns & Anti-Patterns](#common-patterns--anti-patterns)
- [Troubleshooting & FAQ](#troubleshooting--faq)
- [Further Reading](#further-reading)
- [Project Scripts](#project-scripts)

## Quick Start
1. **Add the plugin to `deno.json`:**
   ```jsonc
   {
     "lint": {
       "plugins": ["./src/mod.ts"]
     }
   }
   ```
   Replace `"./src/mod.ts"` with `"jsr:@light-fp/deno-lint-plugin"` once you depend on the published package.

2. **Create minimal effect helpers** (`src/domain/effects.ts`) so branded plans compile:
   ```ts
   export type Result<E, A> =
     | { readonly _tag: "Ok"; readonly value: A }
     | { readonly _tag: "Err"; readonly error: E };

   export const ok = <E, A>(value: A): Result<E, A> => ({ _tag: "Ok", value });
   export const err = <E, A>(error: E): Result<E, A> => ({ _tag: "Err", error });

   export type Effect<Name extends string, A> = {
     readonly effect: Name;
     readonly run: () => Promise<A>;
   };

   export type WithCapability<Name extends string, C, A> = {
     readonly effect: Name;
     readonly capability: C;
     readonly run: (cap: C) => Promise<A>;
   };

   export const brandWithCapability = <Name extends string, C, A>(
     name: Name,
     capability: C,
     run: (cap: C) => Promise<A>,
   ): WithCapability<Name, C, A> => ({
     effect: name,
     capability,
     run,
   });

   export const brand = <Name extends string, A>(name: Name, run: () => Promise<A>): Effect<Name, A> => ({
     effect: name,
     run,
   });

   export const handleThrow = async <E, A>(
     run: () => Promise<A>,
     onError: (cause: unknown) => E,
   ): Promise<Result<E, A>> => {
     try {
       return ok(await run());
     } catch (cause) {
       return err(onError(cause));
     }
   };
   ```

3. **Create your first domain file** (`src/domain/login.ts`) with an intentional violation to see the rule feedback:
   ```ts
   // ❌ Domain code mixing effects and throwing
   export async function login(email: string, password: string) {
     if (!email.includes("@")) {
       throw new Error("Invalid email");
     }
     const response = await fetch("https://api.example.com/login", {
       method: "POST",
       body: JSON.stringify({ email, password }),
     });
   return response.json();
   }
   ```

4. **Run the linter:**
   ```bash
   deno lint
   ```
   You will see diagnostics from the plugin (`result-type-usage`, `no-top-level-effects`, `imports-boundary`, and more).

5. **Refactor into Light FP style** and re-run the linter:
   ```ts
   // ✅ Pure domain plan that the adapters can execute
   import { brandWithCapability, err, ok, type Result, type WithCapability } from "./effects.ts";

   type LoginError =
     | { readonly type: "InvalidEmail"; readonly message: string }
     | { readonly type: "Network"; readonly message: string };

   type LoginPorts = {
     readonly request: (body: { readonly email: string; readonly password: string }) => Promise<{ readonly ok: boolean; readonly json: () => Promise<unknown> }>;
   };

   type HttpPlan = WithCapability<"IO", LoginPorts, Result<LoginError, unknown>>;

   export const planLogin = (
     ports: LoginPorts,
     email: string,
     password: string,
   ): Result<LoginError, HttpPlan> => {
     if (!email.includes("@")) return err({ type: "InvalidEmail", message: "Email must contain @" });
     return ok(
       brandWithCapability("IO", ports, async (cap) => {
         const response = await cap.request({ email, password });
         if (!response.ok) return err({ type: "Network", message: "Request failed" });
         return ok(await response.json());
       }),
     );
   };
   ```
   The function is now pure, returns `Result`, and surface-level effects are encoded in the branded plan.

6. **Explore the curated examples** under `examples/src/` for complete before/after walkthroughs covering authentication, validation, HTTP orchestration, persistence, and effect composition.

## Installation

### Local Development
Use the local path while iterating on the plugin:
```jsonc
{
  "lint": {
    "plugins": ["./src/mod.ts"]
  }
}
```

### JSR Usage
After publishing to JSR (`version: 0.3.0`):
```jsonc
{
  "lint": {
    "plugins": ["jsr:@light-fp/deno-lint-plugin"]
  }
}
```
Keep the plugin as the final entry in your plugins list so it can build on upstream diagnostics.

## Distribution & Installation

### Publisher Playbook (JSR)
Deno positions JSR as the canonical registry for modern TypeScript packages, including lint plugins, so treat it as the default publication target for this project.citeturn1search7

1. **Create or sign in to a JSR account** using GitHub—this is the only supported authentication path today.citeturn0reddit13
2. **Reserve a scope and package name** that matches your plugin (`@light-fp/deno-lint-plugin`). You can configure the scope and visibility from the JSR dashboard before your first publish.citeturn1search0
3. **Ensure `deno.json` (or `jsr.json`) declares the correct metadata**: include `"name"`, `"version"`, and an `"exports"` map so JSR knows how to serve the package, and keep the source ESM-only with full file extensions because JSR rewrites bare specifiers to fully qualified URLs.citeturn1search5turn1search0
4. **Verify plugin wiring locally** by pointing `deno.json` at `./src/mod.ts` and running `deno lint` so you catch rule regressions before shipping to users.citeturn0search1
5. **Run quality gates**: `deno doc --lint` and `deno lint` surface documentation and style issues the registry will reject, and `deno publish --dry-run` confirms what files will ship.citeturn1search4turn1search0
6. **Publish the release** with `deno publish` (or `npx jsr publish`) once the dry run succeeds. You can automate this step via CI, but manual publishes are supported as long as you are logged in.citeturn1search0
7. **Follow semantic versioning**: JSR packages are immutable, so bump the version every time (e.g., patch for bug fixes, minor for new rules, major for breaking defaults) before publishing.citeturn1search2

### Consumer Setup
1. **Add the dependency**. `deno add @light-fp/deno-lint-plugin` records the package in `deno.json` (or `deno.jsonc`) and updates `deno.lock`.citeturn1search8
2. **Reference the plugin with an explicit semver range** so CI detaches from unpublished development versions:
   ```jsonc
   {
     "lint": {
       "plugins": [
         ["jsr:@light-fp/deno-lint-plugin@^0.3.0", {
           "adapterGlobs": ["**/src/adapters/**/*.ts"],
           "domainGlobs": ["**/src/**/*.ts", "**/tests/**/*.ts"]
         }]
       ]
     }
   }
   ```
   The `@^0.3.0` prefix keeps you on compatible minor releases while locking out breaking majors.citeturn1search2
3. **Run `deno lint --fix`** to confirm the plugin loads and to apply safe auto-fixes in your project.citeturn0search1
4. **Commit the updated `deno.lock`** so team members and CI resolve the same plugin version; JSR’s immutable packages guarantee reproducible installs.citeturn1search2

### Why JSR
- **First-class TypeScript support and automatic documentation** differentiate JSR from publishing to npm or `deno.land/x`.citeturn1search1turn1search7
- **Native integration with Deno tooling** (`deno add`, `deno publish`, registry-backed linting) means less configuration than npm packages, which require extra shim metadata.citeturn1search8turn1search0
- **Import rewriting and module verification** ensure consumers get ESM-friendly specifiers with full extensions, something `deno.land/x` cannot enforce.citeturn1search0
- **Alternatives**: local paths (`"./src/mod.ts"`) remain useful for development, and npm packages (`"npm:..."`) can work but demand bundling CommonJS/ESM builds and produce slower installs—JSR avoids both trade-offs.citeturn0search1turn1search7

### Caveats & Special Considerations
- The lint plugin API shipped in Deno 2.2 and is still flagged experimental, so recommend Deno ≥ 2.2 for consumers and monitor release notes for breaking changes.citeturn0search1
- JSR only serves ESM modules; keep `.ts` (or transpiled `.mjs`) sources with explicit extensions and avoid Node-style resolution.citeturn1search0
- Publishing from CI requires a JSR token tied to your GitHub identity—there is no alternative auth flow today.citeturn0reddit13
- Releases are immutable; to retract a faulty build you must publish a new, higher version and deprecate the old one.citeturn1search2

### Live Examples
- `@studios/lint` — a community rule pack published through JSR’s lint plugin contest, showcasing best-practice packaging.citeturn0search2
- `@lambtron/andys-lint-rule` — single-rule plugin demonstrating minimal configuration and documentation.citeturn0search6
- Contest entries such as `@armaanas/no-empty-function` illustrate how teams submit specialty rules via JSR with the same workflow.citeturn0search0

## Configuration
All rules share a single options object. Set it in `deno.json` alongside the plugin entry.

```jsonc
{
  "lint": {
    "plugins": [
      ["jsr:@light-fp/deno-lint-plugin", {
        "effectIdentifiers": ["IO", "Console", "FS", "Clock", "Env", "Throw", "State"],
        "allowedBrandFunctions": ["brand", "brandWithCapability", "withCapability", "withIOCapability", "withConsoleCapability", "withClockCapability", "withEnvCapability", "map", "chain", "zip", "mapArray", "raise", "handleThrow"],
        "allowedBrandAssertionPaths": ["**/src/effect-brands.ts"],
        "adapterGlobs": ["**/src/adapters/**/*.ts"],
        "domainGlobs": ["**/src/**/*.ts", "**/tests/**/*.ts"],
        "ignoreGlobs": ["**/tests/**/*.ts"],
        "allowedThrowPaths": ["**/src/effect-brands.ts", "**/tests/**/*.ts"]
      }]
    ]
  }
}
```

| Option | Default | Purpose |
| --- | --- | --- |
| `effectIdentifiers` | `["IO","Console","FS","Clock","Env","Throw","State"]` | Recognised effect brands. Extend when you add new capability markers. |
| `allowedBrandFunctions` | `["brand","brandWithCapability","withCapability","withIOCapability","withConsoleCapability","withClockCapability","withEnvCapability","map","chain","zip","mapArray","raise","handleThrow"]` | Helper names that may originate branded effects. |
| `allowedBrandAssertionPaths` | `["**/src/effect-brands.ts"]` | Files where brand assertions are permitted (escape hatch). |
| `adapterGlobs` | `["**/src/adapters/**/*.ts"]` | Files treated as adapters. Relaxed OO rules apply here. |
| `domainGlobs` | `["**/src/**/*.ts","**/tests/**/*.ts"]` | Files treated as domain. Strict FP rules apply here. |
| `ignoreGlobs` | `["**/tests/**/*.ts"]` | Files excluded from linting (still parsed but not enforced). |
| `allowedThrowPaths` | `["**/src/effect-brands.ts","**/tests/**/*.ts"]` | Files permitted to throw (e.g., effect helpers, test harnesses). |

## Effect Branding Overview
Effect branding keeps side effects explicit in types:

```ts
import { brand, brandWithCapability, handleThrow } from "./src/domain/effects.ts";

type FileIO<A> = A & { readonly IO: unique symbol };

const readConfig = (path: string) =>
  brand("IO", () => Deno.readTextFile(path)); // ✅ Effect birth is tracked

const withConsole = brandWithCapability("Console", console, async (cap) => {
  cap.log("hello");
});

const safeFetchJson = (url: string) =>
  handleThrow(() => fetch(url).then((res) => res.json()), (cause) => ({ type: "Network", cause }));
```

- **Why it matters:** the plugin validates that branded values originate from approved helpers (`effect-brand-origin`) and are not forged via type assertions (`no-direct-effect-assertion`).
- **Composition:** use `map`, `chain`, and `zip` (also on the allowlist) to build complex workflows without losing effect metadata.
- **Testing:** domain functions return branded “plans” that tests can execute with fakes.

See `examples/src/domain/auth_flow.good.ts` and friends for realistic composition patterns.

## Domain vs Adapter Boundary

```
src/
├─ domain/        # Pure business logic (strict rules apply)
├─ adapters/      # I/O implementations (fetch, databases, console)
├─ ports/         # Interfaces/capabilities (optional but recommended)
└─ tests/         # Treated as domain by default (configurable)
```

- **Domain expectations:** no top-level effects, no classes, no `new`, no `this`, no adapter imports, and errors returned as `Result`.
- **Adapter expectations:** own the side effects, instantiate dependencies, and execute branded plans from the domain.

```ts
// src/domain/profile.ts
import type { HttpCapability } from "../adapters/http.ts"; // ❌ would violate imports-boundary

// ✅ Prefer
import type { HttpPort } from "../ports/http.ts";
export const planProfile = (http: HttpPort) => ...
```

```ts
// src/adapters/http.ts
import { planProfile } from "../domain/profile.ts"; // ✅ Adapter owning the IO
```

Adapters execute the branded plans and translate them into real-world IO, keeping domain logic deterministic and unit-test friendly.

## Rule Reference
All rule keys live under the `light-fp/` namespace. They are grouped here for easier scanning.

### Effect Management Rules

#### `light-fp/effect-brand-origin`
Ensures effect-branded values come from approved helpers.

❌ Violation
```ts
const io = { effect: "IO", run: () => fetch(url) }; // Direct object literal
```

✅ Recommended
```ts
const io = brand("IO", () => fetch(url));
```

#### `light-fp/no-direct-effect-assertion`
Disallows forging brands with type assertions.

❌ Violation
```ts
const io = fetch(url) as IO<Response>;
```

✅ Recommended
```ts
const io = brand("IO", () => fetch(url));
```

#### `light-fp/result-type-usage`
Replaces `throw` statements in domain code with `Result<E, A>`.

❌ Violation
```ts
export function parseUser(payload: unknown): User {
  throw new Error("invalid");
}
```

✅ Recommended
```ts
export function parseUser(payload: unknown): Result<ParseError, User> {
  return err({ type: "InvalidPayload" });
}
```

### Type System Rules

#### `light-fp/interface-vs-type`
Use `type` for data structures, `interface` for capability ports. Auto-fix rewrites between the two when safe.

❌ Violation
```ts
interface User {
  id: string;
  roles: string[];
}
```

✅ Recommended
```ts
type User = {
  readonly id: string;
  readonly roles: readonly string[];
};
```

#### `light-fp/readonly-data`
Enforces `readonly` properties and arrays in data type literals.

❌ Violation
```ts
type Session = {
  token: string;
  scopes: string[];
};
```

✅ Recommended
```ts
type Session = {
  readonly token: string;
  readonly scopes: readonly string[];
};
```

### Architectural Rules

#### `light-fp/imports-boundary`
Domain code must not import from adapters.

❌ Violation
```ts
// src/domain/session.ts
import { fetchUser } from "../adapters/http.ts";
```

✅ Recommended
```ts
import type { HttpPort } from "../ports/http.ts";
```

#### `light-fp/no-top-level-effects`
No side effects at module scope in domain files.

❌ Violation
```ts
export const now = Date.now();
const user = await fetch("https://api.example.com/user");
```

✅ Recommended
```ts
export const planClock = withCapability({ now: () => Date.now() }, (cap) => cap.now());
```

### Object-Oriented Restrictions

#### `light-fp/no-class`
Disallows classes in domain code; prefer functions and modules.

❌ Violation
```ts
export class CartService {
  add(item: Item) { ... }
}
```

✅ Recommended
```ts
export const createCart = (items: readonly Item[]) => ({ items });
```

#### `light-fp/no-new`
Bans the `new` keyword in domain files.

❌ Violation
```ts
const date = new Date();
```

✅ Recommended
```ts
const date = clock.now();
```

#### `light-fp/no-this`
Prevents usage of `this` in domain code.

❌ Violation
```ts
function updateName(this: User, name: string) {
  this.name = name;
}
```

✅ Recommended
```ts
const rename = (user: User, name: string) => ({ ...user, name });
```

## Migration Guide
1. **Enable the plugin in CI** using the local path so developers see violations early.
2. **Audit directory boundaries**: ensure `domainGlobs` and `adapterGlobs` reflect your layout before running `--fix`.
3. **Codemod data types**: run `deno lint --fix` to convert obvious `interface`/`type` issues, then clean up `readonly` warnings manually.
4. **Introduce ports**: replace direct adapter imports with interfaces; wire adapters in composition roots.
5. **Adopt Result types** incrementally: wrap existing `throw` hot spots with `handleThrow` and return `Result`.
6. **Capture new variability** as branded effects so testing remains deterministic.

## Best Practices
- Keep **domain functions pure** and delegate side effects to adapters.
- Store **effect helpers** (brand, withCapability, raise, etc.) in a shared module similar to `examples/src/domain/shared/primitives.ts`.
- **Name capability interfaces** after the behavior they expose (`AuthPorts`, `ClockPort`) to aid discoverability.
- **Treat tests as domain** by default; override `ignoreGlobs` if integration tests need relaxed rules.
- **Document ports next to examples** so teams see how adapters fulfill them.

## Auto-fix Workflow
1. Run `deno lint --fix` to apply safe fixes (e.g., `interface` ⇄ `type`, missing `readonly` suggestions where supported).
2. Review remaining diagnostics—many require conscious architectural refactors.
3. Pair auto-fix with `deno fmt` to keep formatting aligned.
4. Use `deno task examples:lint` to see the plugin act on the curated before/after snippets.

## Common Patterns & Anti-Patterns
- **Pattern:** Domain exports `planX` functions returning branded effects; adapters execute them.
- **Pattern:** Data validation returns `Result<ValidationError[], Data>`; adapters translate errors into HTTP responses.
- **Anti-pattern:** Calling `fetch`, `Deno.env`, or `Math.random` in domain files.
- **Anti-pattern:** Passing mutable arrays/objects across boundaries; prefer `readonly`.
- **Anti-pattern:** Hiding errors behind `console.log` in domain code—return a `Result` instead.

## Troubleshooting & FAQ
- **“Why are my tests flagged?”** — By default tests are treated as domain code. Adjust `domainGlobs` and `ignoreGlobs` if integration tests require imperatively creating effects.
- **“I need to assert a brand manually.”** — Add the file to `allowedBrandAssertionPaths`, but prefer refactoring toward approved helpers first.
- **“Adapters still violate rules.”** — Ensure they match `adapterGlobs`; otherwise they inherit strict domain constraints.
- **“How do I silence a rule temporarily?”** — Use standard `// deno-lint-ignore light-fp/<rule>` pragmas sparingly and document the follow-up.

## Further Reading
- [Q&A and design rationale](q_and_a.md)
- [Before/after examples](examples/src/)
- [Rule implementations](src/rules/)
- [Default options](src/util/options.ts)

## Project Scripts
- `deno task fmt` — Format the repo
- `deno task lint` — Run Deno’s built-in linting (with this plugin)
- `deno task test` — Execute unit tests with `--no-check`
- `deno task test:e2e` — Verify rule behavior against fixtures
- `deno task examples:lint` — Lint only the `examples/` directory to explore diagnostics quickly
