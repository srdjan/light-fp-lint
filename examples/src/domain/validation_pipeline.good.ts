// Beginner validation example (after): pure transformations with explicit Result.
// Highlights:
// - `Result` exposes validation errors explicitly.
// - Readonly types prevent accidental mutation.
// - Deterministic constructors stay available; clock access is deferred via an IO plan.
// - When run with `--fix`, the linter keeps this file unchanged because it already matches the recommended style.

import {
  brandWithCapability,
  err,
  ok,
  type Result,
  type WithCapability,
} from "./shared/primitives.ts";

type RawSignup = {
  readonly name?: string;
  readonly email?: string;
  readonly roles?: readonly string[];
  readonly birthDateISO?: string;
};

type ValidationError = {
  readonly field: "email" | "password" | "name" | "birthDate";
  readonly message: string;
};

type NormalizedSignup = {
  readonly name: string;
  readonly email: string;
  readonly roles: readonly string[];
  readonly birthDateISO: string;
};

export type PersistenceDraft = {
  readonly name: string;
  readonly email: string;
  readonly roles: readonly string[];
  readonly birthDateISO: string;
  readonly createdAt: number;
};

type ClockCapability = { readonly clock: () => number };

function ensureEmail(
  value?: string,
): Result<readonly ValidationError[], string> {
  if (!value) return err([{ field: "email", message: "Required" }]);
  const trimmed = value.trim().toLowerCase();
  if (!trimmed.includes("@")) {
    return err([{ field: "email", message: "Must contain @" }]);
  }
  return ok(trimmed);
}

function ensureName(
  value?: string,
): Result<readonly ValidationError[], string> {
  if (!value) return err([{ field: "name", message: "Required" }]);
  if (value.length > 80) return err([{ field: "name", message: "Too long" }]);
  return ok(value.trim());
}

function ensureBirthDate(
  value?: string,
): Result<readonly ValidationError[], string> {
  if (!value) {
    return err([{ field: "birthDate", message: "Required ISO string" }]);
  }
  return /\d{4}-\d{2}-\d{2}/.test(value)
    ? ok(value)
    : err([{ field: "birthDate", message: "Use YYYY-MM-DD" }]);
}

function ensureRoles(
  value?: readonly string[],
): Result<readonly ValidationError[], readonly string[]> {
  if (!value || value.length === 0) return ok(["user"]);
  const normalized = Array.from(
    new Set(value.map((role) => role.trim()).filter(Boolean)),
  );
  return ok(normalized);
}

export function normalizeSignup(
  input: RawSignup,
): Result<readonly ValidationError[], NormalizedSignup> {
  const emailResult = ensureEmail(input.email);
  const nameResult = ensureName(input.name);
  const birthDateResult = ensureBirthDate(input.birthDateISO);
  const rolesResult = ensureRoles(input.roles);

  if (
    emailResult._tag === "Err" || nameResult._tag === "Err" ||
    birthDateResult._tag === "Err" || rolesResult._tag === "Err"
  ) {
    const errors = [
      ...(emailResult._tag === "Err" ? emailResult.error : []),
      ...(nameResult._tag === "Err" ? nameResult.error : []),
      ...(birthDateResult._tag === "Err" ? birthDateResult.error : []),
      ...(rolesResult._tag === "Err" ? rolesResult.error : []),
    ];
    return err(errors);
  }

  return ok({
    name: nameResult.value,
    email: emailResult.value,
    roles: rolesResult.value,
    birthDateISO: birthDateResult.value,
  });
}

export type PersistenceEffect = WithCapability<
  "IO",
  ClockCapability,
  PersistenceDraft
>;

export function toPersistenceDraft(
  cap: ClockCapability,
  normalized: NormalizedSignup,
): PersistenceEffect {
  // The plan reads the clock and nothing else, so there is nothing to await.
  // `brandWithCapability` still wants a promise, so say so directly rather than
  // marking the function `async` and leaving a bare `async` with no `await`.
  return brandWithCapability("IO", cap, (clockCap) =>
    Promise.resolve({
      ...normalized,
      createdAt: clockCap.clock(),
    }));
}
