// Simple auth example (after): passes all Light FP rules.
// Benefits:
// - Testable: `planLogin` is a pure function that returns a branded IO plan.
// - Type safe: readonly types and explicit `Result` make failures visible.
// - Clear boundary: the domain no longer imports adapters; capabilities are provided as parameters.
// - Self-documenting: the `AuthIO` brand makes side effects visible to the reader.
// - Auto-fix ready: the plugin has nothing to rewrite here, so `deno lint --fix` confirms the file stays clean.

import {
  brandWithCapability,
  chain,
  err,
  handleThrow,
  ok,
  type Result,
  type WithCapability,
} from "./shared/primitives.ts";

type Email = string & { readonly Email: unique symbol };

type Password = string & { readonly Password: unique symbol };

export type Credentials = {
  readonly email: string;
  readonly password: string;
};

export type AuthError =
  | { readonly type: "InvalidEmail"; readonly reason: string }
  | { readonly type: "InvalidPassword"; readonly reason: string }
  | { readonly type: "UnknownUser"; readonly email: string }
  | { readonly type: "WrongPassword"; readonly email: string }
  | { readonly type: "TokenIssueFailed"; readonly cause: string };

export type UserRecord = {
  readonly id: number;
  readonly email: Email;
  readonly passwordHash: string;
  readonly roles: readonly string[];
  readonly isLocked: boolean;
};

export type LoginSuccess = {
  readonly token: string;
  readonly issuedAt: number;
  readonly userId: number;
  readonly roles: readonly string[];
};

export type LoginPorts = {
  readonly clock: () => number;
  readonly hashPassword: (plain: Password) => Promise<string>;
  readonly verifyPassword: (
    args: { readonly plain: Password; readonly hash: string },
  ) => Promise<boolean>;
  readonly lookupUser: (email: Email) => Promise<UserRecord | null>;
  readonly issueToken: (
    input: {
      readonly userId: number;
      readonly roles: readonly string[];
      readonly issuedAt: number;
    },
  ) => Promise<string>;
};

export type AuthPlan = WithCapability<
  "AuthIO",
  LoginPorts,
  Result<AuthError, LoginSuccess>
>;

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

// Each validator is generic in its input so it adds a brand without discarding
// the ones already there. Written against a bare `Credentials` instead, the
// second validator in a chain would erase the first one's brand, and the two
// would have to be applied in one fixed order forever.

function validateEmail<T extends Credentials>(
  raw: T,
): Result<AuthError, T & { readonly email: Email }> {
  const normalized = normalizeEmail(raw.email);
  if (!normalized.includes("@")) {
    return err({ type: "InvalidEmail", reason: "Must contain @" });
  }
  return ok({ ...raw, email: normalized as Email });
}

function validatePassword<T extends Credentials>(
  raw: T,
): Result<AuthError, T & { readonly password: Password }> {
  if (raw.password.length < 12) {
    return err({
      type: "InvalidPassword",
      reason: "Use at least 12 characters",
    });
  }
  return ok({ ...raw, password: raw.password as Password });
}

function ensureNotLocked(record: UserRecord): Result<AuthError, UserRecord> {
  return record.isLocked
    ? err({ type: "WrongPassword", email: record.email })
    : ok(record);
}

function planIssue(
  ports: LoginPorts,
  input: Credentials & { readonly email: Email; readonly password: Password },
): AuthPlan {
  return brandWithCapability("AuthIO", ports, async (cap) => {
    const record = await cap.lookupUser(input.email);
    if (!record) return err({ type: "UnknownUser", email: input.email });
    const verifiedRecord = ensureNotLocked(record);
    if (verifiedRecord._tag === "Err") return verifiedRecord;
    const matches = await cap.verifyPassword({
      plain: input.password,
      hash: verifiedRecord.value.passwordHash,
    });
    if (!matches) return err({ type: "WrongPassword", email: input.email });
    const issueTime = cap.clock();
    const tokenResult = await handleThrow(
      () =>
        cap.issueToken({
          userId: verifiedRecord.value.id,
          roles: verifiedRecord.value.roles,
          issuedAt: issueTime,
        }),
      (cause) => ({
        type: "TokenIssueFailed" as const,
        cause: cause instanceof Error ? cause.message : String(cause),
      }),
    );
    if (tokenResult._tag === "Err") return tokenResult;
    return ok({
      token: tokenResult.value,
      issuedAt: issueTime,
      userId: verifiedRecord.value.id,
      roles: verifiedRecord.value.roles,
    });
  });
}

export function planLogin(
  ports: LoginPorts,
  input: Credentials,
): Result<AuthError, AuthPlan> {
  return chain(
    validateEmail(input),
    (emailReady) =>
      chain(
        validatePassword(emailReady),
        (ready) => ok(planIssue(ports, ready)),
      ),
  );
}

// Callers can supply fake ports when they execute the returned AuthIO effect.
// This module imports no adapter implementation.
