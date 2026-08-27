// Intermediate persistence example (after): domain stays pure and returns commands.
// Benefits:
// - Clear boundary: adapters implement `UserRepositoryPort`; domain only relies on the interface.
// - No mutation or classes; everything is readonly for safer refactors.
// - Errors surface as `Result`, so callers cannot forget to handle them.
// - Auto-fix tip: this structure already matches the recommended type alias style, so --fix reports no changes.

import {
  brandWithCapability,
  err,
  handleThrow,
  map,
  ok,
  type Result,
  type WithCapability,
} from "./shared/primitives.ts";

export type UserRecord = Readonly<{
  readonly email: string;
  readonly roles: readonly string[];
}>;

export type UserRow = UserRecord & Readonly<{ readonly id: number }>;

export type UserRepositoryPort = Readonly<{
  readonly insert: (record: UserRecord) => Promise<number>;
  readonly findByRole: (role: string) => Promise<readonly UserRow[]>;
}>;

export type PersistenceError =
  | {
    readonly type: "Validation";
    readonly field: "email";
    readonly message: string;
  }
  | { readonly type: "Driver"; readonly message: string };

export type InsertEffect = WithCapability<
  "Persistence",
  UserRepositoryPort,
  Result<PersistenceError, number>
>;
export type ListEffect = WithCapability<
  "Persistence",
  UserRepositoryPort,
  Result<PersistenceError, readonly UserRow[]>
>;

const ensureEmail = (
  record: UserRecord,
): Result<PersistenceError, UserRecord> =>
  record.email.includes("@")
    ? ok(record)
    : err({ type: "Validation", field: "email", message: "Must contain @" });

export const planInsertUser = (
  repo: UserRepositoryPort,
  record: UserRecord,
): Result<PersistenceError, InsertEffect> =>
  map(
    ensureEmail(record),
    (validRecord) =>
      brandWithCapability("Persistence", repo, (cap) =>
        handleThrow(
          () => cap.insert(validRecord),
          (cause): PersistenceError => ({
            type: "Driver",
            message: cause instanceof Error ? cause.message : String(cause),
          }),
        )),
  );

export const planListAdmins = (
  repo: UserRepositoryPort,
): Result<PersistenceError, ListEffect> =>
  ok(
    brandWithCapability("Persistence", repo, (cap) =>
      handleThrow(
        () => cap.findByRole("admin"),
        (cause): PersistenceError => ({
          type: "Driver",
          message: cause instanceof Error ? cause.message : String(cause),
        }),
      )),
  );
