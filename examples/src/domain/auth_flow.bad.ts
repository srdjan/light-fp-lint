// Simple auth example (before): demonstrates what the linter flags.
// - Violates `importsBoundary` by pulling adapters into the domain.
// - Violates `noTopLevelEffects` with `Math.random()` and `Date.now()` at module scope.
// - Violates `noNew`/`noThis` by relying on a class with mutable state.
// - Violates `resultType` by throwing instead of returning `Result<E, A>`.
// - Violates `interfaceVsType` (auto-fix hint) by using interface for data.

import { hashPassword, issueToken } from "../adapters/auth.ts"; // Rule violation: domain importing adapter utilities.

interface Credentials { // Rule violation: prefer `type` for data, the plugin offers an auto-fix to rewrite this.
  email: string;
  password: string;
}

let lastIssuedAt = Date.now(); // Rule violation: top-level `Date.now()` hides effectful state.
const randomSalt = Math.random().toString(36); // Rule violation: top-level randomness blocks determinism.
const issuedTokens: string[] = []; // Hidden mutable global state makes testing flaky.

export class AuthService { // Rule violation: classes bring implicit state and `this`.
  private currentUserId: number | undefined;

  constructor(private readonly endpoint: string) {}

  async login(credentials: Credentials): Promise<string> {
    // Rule violation: direct `fetch` call mixes IO and domain logic.
    const response = await fetch(`${this.endpoint}/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...credentials, salt: randomSalt }),
    });
    if (!response.ok) {
      throw new Error("Invalid credentials"); // Rule violation: raw throw instead of returning a Result.
    }
    const payload = await response.json();
    this.currentUserId = payload.user.id;
    const token = await issueToken({ userId: this.currentUserId, roles: payload.user.roles });
    lastIssuedAt = Date.now(); // Hidden mutable write.
    issuedTokens.push(token); // Mutates shared state.
    console.log("Issued token", token); // Side effect that the linter suggests moving to adapters.
    return token;
  }

  async ensureAdmin(token: string): Promise<boolean> {
    const result = await fetch(`${this.endpoint}/validate`, { headers: { authorization: `Bearer ${token}` } });
    const json = await result.json();
    if (!json.user?.roles?.includes("admin")) {
      throw new Error("not authorized"); // Another `throw` in domain logic.
    }
    return true;
  }
}

export const authService = new AuthService("https://example.com"); // Rule violation: `new` at top level in domain code.

