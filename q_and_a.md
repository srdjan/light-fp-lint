# Light FP Deno Lint Plugin - Questions & Answers

## 1. What is the purpose and scope of this Deno lint plugin for Light Functional Programming?

### Purpose
The `@light-fp/deno-lint-plugin` is a Deno lint plugin designed to enforce **Light Functional Programming (Light FP)** discipline in TypeScript projects. It provides fast, syntactic analysis with pragmatic auto-fixes to help developers write cleaner, more maintainable functional code.

### Core Philosophy
The plugin enforces three fundamental pillars of Light FP:
1. **Model with types first; make illegal states unrepresentable** - Use algebraic data types (ADTs) and smart constructors
2. **Keep the core pure (no I/O); push effects to edges** - Separate pure business logic from side effects
3. **Treat errors as values** - Use `Result<T, E>` instead of throwing exceptions

### Scope
The plugin provides **10 lint rules** that cover:
- **Effect management**: Ensuring side effects are properly tracked and branded
- **Data modeling**: Enforcing immutable data structures with `readonly` properties
- **Architectural boundaries**: Preventing domain code from importing adapters
- **Type discipline**: Using `type` for data and `interface` for capabilities/ports
- **Error handling**: Replacing exceptions with `Result` types
- **OOP restrictions**: Banning classes, `new`, and `this` in domain code

---

## 2. How do I install and configure this plugin in my Deno project?

### Installation

#### Option 1: Local Repository
If you're developing the plugin or using it locally:

```jsonc
// deno.json
{
  "lint": { 
    "plugins": ["./src/mod.ts"] 
  }
}
```

#### Option 2: JSR (Recommended for Production)
After the plugin is published to JSR:

```jsonc
// deno.json
{
  "lint": { 
    "plugins": ["jsr:@light-fp/deno-lint-plugin"] 
  }
}
```

### Running the Linter
```bash
# Run linter
deno lint

# Run linter with auto-fix
deno lint --fix
```

### Configuration Options
You can customize the plugin behavior by passing options:

```jsonc
{
  "lint": {
    "plugins": [ 
      ["jsr:@light-fp/deno-lint-plugin", {
        "effectIdentifiers": ["IO", "Console", "FS", "Clock", "Env", "Throw", "State"],
        "adapterGlobs": ["**/src/adapters/**/*.ts"],
        "domainGlobs": ["**/src/**/*.ts"],
        "ignoreGlobs": ["**/tests/**/*.ts"]
      }] 
    ]
  }
}
```

### Default Configuration
The plugin comes with sensible defaults (see `src/util/options.ts`):
- **Effect identifiers**: `["IO", "Console", "FS", "Clock", "Env", "Throw", "State"]`
- **Allowed brand functions**: `["brand", "brandWithCapability", "withCapability", "map", "chain", "zip", "mapArray", "raise", "handleThrow"]`
- **Adapter globs**: `["**/src/adapters/**/*.ts"]`
- **Domain globs**: `["**/src/**/*.ts", "**/tests/**/*.ts"]`
- **Ignore globs**: `["**/tests/**/*.ts"]`
- **Allowed throw paths**: `["**/src/effect-brands.ts", "**/tests/**/*.ts"]`

---

## 3. What are the core rules enforced by this plugin and what coding patterns do they prevent or encourage?

### Rule 1: `light-fp/effect-brand-origin`
**Purpose**: Ensure effect brands originate from approved helpers

**Prevents**:
- Creating effect-branded values from raw expressions
- Bypassing the effect tracking system

**Encourages**:
- Using approved helper functions like `brand()`, `brandWithCapability()`, `withCapability()`
- Proper effect tracking throughout the codebase

**Auto-fix**: Wraps expressions with `brand(...)` when safe

---

### Rule 2: `light-fp/no-direct-effect-assertion`
**Purpose**: Disallow TypeScript `as` assertions to attach effect brands

**Prevents**:
```typescript
// ❌ BAD: Using type assertion to add effect brand
const io = someValue as IO<string>;
```

**Encourages**:
```typescript
// ✅ GOOD: Using approved helper
const io = brand(someValue);
```

---

### Rule 3: `light-fp/result-type-usage`
**Purpose**: Forbid raw `throw` statements in domain functions; prefer `Result<E, A>`

**Prevents**:
```typescript
// ❌ BAD: Throwing exceptions in domain code
export function parseUser(data: unknown): User {
  throw new Error("Invalid user data");
}
```

**Encourages**:
```typescript
// ✅ GOOD: Returning Result type
export function parseUser(data: unknown): Result<User, ValidationError> {
  return err({ type: "invalid_data", message: "Invalid user data" });
}
```

---

### Rule 4: `light-fp/interface-vs-type`
**Purpose**: Prefer `type` for data structures and `interface` for capabilities/ports

**Prevents**:
```typescript
// ❌ BAD: Interface for data
interface User {
  id: string;
  name: string;
}

// ❌ BAD: Type for capabilities
type Logger = {
  readonly log: (msg: string) => void;
};
```

**Encourages**:
```typescript
// ✅ GOOD: Type for data
type User = {
  readonly id: string;
  readonly name: string;
};

// ✅ GOOD: Interface for capabilities
interface Logger {
  readonly log: (msg: string) => void;
}
```

**Auto-fix**: Automatically converts between `type` and `interface` when appropriate

---

### Rule 5: `light-fp/readonly-data`
**Purpose**: Enforce `readonly` properties and arrays in data type literals

**Prevents**:
```typescript
// ❌ BAD: Mutable properties
type User = {
  id: string;
  roles: string[];
};
```

**Encourages**:
```typescript
// ✅ GOOD: Readonly properties and arrays
type User = {
  readonly id: string;
  readonly roles: readonly string[];
};
```

---

### Rule 6: `light-fp/no-class`
**Purpose**: Disallow classes in domain code; prefer algebraic data types and functions

**Prevents**:
```typescript
// ❌ BAD: Classes in domain code
export class UserService {
  constructor(private db: Database) {}
  
  async createUser(data: UserData): Promise<User> {
    // ...
  }
}
```

**Encourages**:
```typescript
// ✅ GOOD: Functions and closures
export const createUserService = (db: Database) => ({
  createUser: async (data: UserData): Promise<Result<User, Error>> => {
    // ...
  }
});
```

---

### Rule 7: `light-fp/imports-boundary`
**Purpose**: Domain code must not import from adapters

**Prevents**:
```typescript
// ❌ BAD: Domain importing from adapters
// src/domain/user.ts
import { DatabaseAdapter } from "../adapters/database.ts";
```

**Encourages**:
```typescript
// ✅ GOOD: Domain depends on ports/interfaces
// src/domain/user.ts
import type { Database } from "../ports/database.ts";

export const createUser = (db: Database) => async (data: UserData) => {
  // ...
};
```

---

### Rule 8: `light-fp/no-top-level-effects`
**Purpose**: No side-effects at module top level in domain files

**Prevents**:
```typescript
// ❌ BAD: Side effects at top level
export const now = Date.now();
export const config = Deno.env.get("CONFIG");
const response = await fetch("https://api.example.com");
```

**Encourages**:
```typescript
// ✅ GOOD: Side effects behind functions/adapters
export const createClock = () => ({
  now: () => Date.now()
});
```

---

### Rule 9: `light-fp/no-new`
**Purpose**: Disallow `new` keyword in domain code

**Prevents**:
```typescript
// ❌ BAD: Using new in domain
const date = new Date();
const map = new Map();
```

**Encourages**:
```typescript
// ✅ GOOD: Factory functions
const createClock = () => ({ now: () => Date.now() });
```

---

### Rule 10: `light-fp/no-this`
**Purpose**: Disallow `this` keyword in domain code

**Prevents**:
```typescript
// ❌ BAD: Using this
function updateUser() {
  this.name = "New Name";
}
```

**Encourages**:
```typescript
// ✅ GOOD: Explicit parameters and closures
const updateUser = (user: User, name: string): User => ({
  ...user,
  name
});
```

---

## 4. How does the effect branding system work and what are the approved helpers for creating effect-branded values?

### What is Effect Branding?
Effect branding is a type-level mechanism to track side effects in your code. Effects are represented as type brands (e.g., `IO`, `Console`, `FS`, `Clock`) that are attached to values to indicate they perform or require side effects.

### How It Works
1. **Effect Types**: Special branded types like `IO<T>`, `Console<T>`, `FS<T>` indicate that a value carries a specific effect
2. **Tracking**: The plugin tracks where effect-branded values originate
3. **Validation**: Ensures effect brands only come from approved helper functions
4. **Propagation**: Effect-branded values can be passed around and composed

### Default Effect Identifiers
The plugin recognizes these effect brands by default:
- `IO` - General I/O operations
- `Console` - Console logging
- `FS` - File system operations
- `Clock` - Time-related operations
- `Env` - Environment variable access
- `Throw` - Operations that can throw
- `State` - Stateful operations

### Approved Helper Functions
The plugin allows these functions to create effect-branded values:

#### Core Branding Functions
- **`brand(value)`** - Attach an effect brand to a value
- **`brandWithCapability(value, capability)`** - Brand with a capability token
- **`withCapability(capability)`** - Create a branded value with a capability

#### Specific Capability Helpers
- **`withIOCapability()`** - Create IO-branded values
- **`withConsoleCapability()`** - Create Console-branded values
- **`withClockCapability()`** - Create Clock-branded values
- **`withEnvCapability()`** - Create Env-branded values

#### Composition Functions
- **`map(fn, branded)`** - Transform a branded value
- **`chain(fn, branded)`** - Flatmap over branded values
- **`zip(...branded)`** - Combine multiple branded values
- **`mapArray(fn, array)`** - Map over arrays of branded values

#### Error Handling
- **`raise(error)`** - Create a Throw-branded error
- **`handleThrow(fn)`** - Convert throws to Result types

### Example Usage
```typescript
// ✅ GOOD: Using approved helpers
const readFile = (path: string): FS<string> => 
  brand(Deno.readTextFileSync(path));

const log = (msg: string): Console<void> => 
  withConsoleCapability(() => console.log(msg));

// ✅ GOOD: Composing effects
const program = map(
  (content) => content.toUpperCase(),
  readFile("config.json")
);

// ❌ BAD: Direct assertion
const badIO = someValue as IO<string>;

// ❌ BAD: Raw expression without branding
const badRead: FS<string> = Deno.readTextFileSync("file.txt");
```

---

## 5. What is the difference between domain code and adapter code in terms of rule enforcement and architectural boundaries?

### Architectural Layers

#### Domain Code
**Location**: Typically in `src/domain/` or `src/` (configurable via `domainGlobs`)

**Purpose**: Contains pure business logic, data types, and domain rules

**Characteristics**:
- Pure functions (no direct side effects)
- No I/O operations
- No external dependencies
- Uses ports/interfaces for capabilities
- Returns `Result` types instead of throwing

**Rules Applied**:
- ✅ All 10 rules are enforced
- ❌ Cannot import from adapters
- ❌ Cannot use classes, `new`, `this`
- ❌ Cannot throw exceptions
- ❌ Cannot have top-level side effects
- ✅ Must use `type` for data, `interface` for ports
- ✅ Must use `readonly` properties

#### Adapter Code
**Location**: Typically in `src/adapters/` (configurable via `adapterGlobs`)

**Purpose**: Implements ports/interfaces with actual side effects and external dependencies

**Characteristics**:
- Can perform I/O operations
- Can use external libraries
- Can interact with Deno APIs
- Implements domain interfaces
- Bridges pure domain to impure world

**Rules Applied**:
- ✅ Effect branding rules still apply
- ✅ Type discipline rules apply
- ❌ Domain-specific restrictions are **relaxed**:
  - Can use classes if needed
  - Can use `new` keyword
  - Can use `this`
  - Can have top-level effects
  - Can throw exceptions (though Result is still preferred)

### Directory Structure Example
```
src/
├── domain/              # Pure business logic
│   ├── user.ts         # User types and functions
│   └── validation.ts   # Validation logic
├── ports/              # Interface definitions
│   ├── database.ts     # Database port interface
│   └── logger.ts       # Logger port interface
└── adapters/           # Implementations with side effects
    ├── sqlite-db.ts    # SQLite database adapter
    └── console-logger.ts # Console logger adapter
```

### Import Rules

#### ✅ Allowed
```typescript
// Domain importing ports
// src/domain/user.ts
import type { Database } from "../ports/database.ts";

// Adapter importing domain
// src/adapters/sqlite-db.ts
import type { User } from "../domain/user.ts";
import type { Database } from "../ports/database.ts";

// Adapter importing other adapters (if needed)
// src/adapters/composite.ts
import { createLogger } from "./console-logger.ts";
```

#### ❌ Forbidden
```typescript
// Domain importing adapters - VIOLATION!
// src/domain/user.ts
import { SqliteDatabase } from "../adapters/sqlite-db.ts"; // ❌ ERROR
```

### Configuration
You can customize which files are considered domain vs adapter:

```jsonc
{
  "lint": {
    "plugins": [ 
      ["jsr:@light-fp/deno-lint-plugin", {
        "domainGlobs": ["**/src/domain/**/*.ts", "**/src/core/**/*.ts"],
        "adapterGlobs": ["**/src/adapters/**/*.ts", "**/src/infra/**/*.ts"],
        "ignoreGlobs": ["**/tests/**/*.ts", "**/scripts/**/*.ts"]
      }] 
    ]
  }
}
```

### Benefits of This Separation
1. **Testability**: Domain logic can be tested without side effects
2. **Portability**: Domain code is independent of infrastructure
3. **Maintainability**: Clear separation of concerns
4. **Flexibility**: Easy to swap adapter implementations
5. **Reasoning**: Pure domain code is easier to understand and verify

---

## Additional Resources

- **Source Code**: `/src/mod.ts` - Plugin entry point
- **Rule Implementations**: `/src/rules/` - Individual rule definitions
- **Configuration**: `/src/util/options.ts` - Default options and types
- **Examples**: `/examples/` - Example code showing violations and fixes
- **Tests**: `/tests/` - Unit and E2E tests

## Development Commands

```bash
# Run unit tests
deno task test

# Run E2E tests (verifies auto-fix behavior)
deno task test:e2e

# Lint example code
deno task examples:lint

# Format code
deno task fmt

# Publish to JSR
deno publish
```

