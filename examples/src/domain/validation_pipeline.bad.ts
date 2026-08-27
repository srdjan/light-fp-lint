// Beginner validation example (before): meant to trigger lint feedback for direct mutations.
// - Uses `any` + mutation, so we lose type safety.
// - Throws instead of returning `Result`, so callers must remember to catch.
// - Mutates inputs and relies on `Date.now()` inside the domain.
// - Uses `new Date()` directly, violating the "no new" rule.

interface SignupForm { // Rule violation: plugin suggests `type SignupForm = ...` and offers auto-fix.
  name?: string;
  email?: string;
  roles: string[];
  birthDate?: string | Date;
}

const legacyAuditLog: string[] = []; // Shared mutable state makes refactors hard.

export function normalizeForm(raw: any): SignupForm { // `any` bypasses type safety.
  if (!raw.email?.includes("@")) {
    throw new Error("Email must contain @"); // Rule violation: raw throw in domain.
  }
  legacyAuditLog.push(`normalized:${raw.email}`); // Side-effect at call-time; breaks test determinism.
  const roleList = raw.roles ?? [];
  roleList.push("user"); // Mutation: rule prefers returning new readonly arrays.
  raw.birthDate = raw.birthDate ? new Date(raw.birthDate) : new Date(); // Rule violation: `new` in domain logic.
  return {
    name: raw.name ?? "",
    email: raw.email,
    roles: roleList,
    birthDate: raw.birthDate,
  };
}

export function toPersistenceRecord(form: SignupForm): Record<string, unknown> {
  // Rule violation: domain reaching for `Date.now()` and mutating incoming object.
  form.birthDate = form.birthDate instanceof Date
    ? form.birthDate
    : new Date(form.birthDate ?? Date.now());
  return { ...form, createdAt: Date.now() };
}
