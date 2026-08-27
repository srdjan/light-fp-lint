// Simple auth example (before): demonstrates what the linter flags.
// - `layer-boundary` reports the adapter import.
// - `pure-module` and `no-ambient-effects` report the initializer calls.
// - `no-oo` reports the class, parameter property, and each use of `this`.
// - `no-throw` reports exceptions instead of `Result<E, A>` values.
// - The data interface triggers `prefer-type-for-data` and `readonly-data`.

import { hashPassword, issueToken } from "../adapters/auth.ts"; // layer-boundary

interface Credentials { // prefer-type-for-data
  email: string; // readonly-data
  password: string; // readonly-data
}

let lastIssuedAt = Date.now(); // pure-module twice, no-ambient-effects
const randomSalt = Math.random().toString(36); // pure-module, no-ambient-effects
// Mutable module data is risky, but constructing this array is not reported.
const issuedTokens: string[] = [];

export class AuthService { // no-oo
  private currentUserId: number | undefined;

  constructor(private readonly endpoint: string) {} // no-oo

  async login(credentials: Credentials): Promise<string> {
    // no-ambient-effects reports fetch; no-oo reports this.
    const response = await fetch(`${this.endpoint}/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...credentials, salt: randomSalt }),
    });
    if (!response.ok) {
      throw new Error("Invalid credentials"); // no-throw
    }
    const payload = await response.json();
    this.currentUserId = payload.user.id; // no-oo
    const token = await issueToken({
      userId: this.currentUserId, // no-oo
      roles: payload.user.roles,
    });
    lastIssuedAt = Date.now(); // no-ambient-effects
    issuedTokens.push(token); // no-discarded-values
    console.log("Issued token", token); // no-ambient-effects, no-discarded-values
    return token;
  }

  async ensureAdmin(token: string): Promise<boolean> {
    const result = await fetch(`${this.endpoint}/validate`, { // no-ambient-effects, no-oo
      headers: { authorization: `Bearer ${token}` },
    });
    const json = await result.json();
    if (!json.user?.roles?.includes("admin")) {
      throw new Error("not authorized"); // no-throw
    }
    return true;
  }
}

// Local construction is allowed. The class declaration above is what no-oo reports.
export const authService = new AuthService("https://example.com");
