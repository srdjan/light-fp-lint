// Beginner validation example (before): unsafe data, discarded calls, and ambient time.
// - `no-unsafe-cast` reports `any`.
// - `no-throw` reports exceptions instead of `Result` values.
// - `no-discarded-values` reports ignored push results.
// - `no-ambient-effects` reports `Date.now()` and zero-argument `new Date()`.
// - `statement-forms` reports the `switch`.

interface SignupForm { // prefer-type-for-data
  name?: string; // readonly-data
  email?: string; // readonly-data
  roles: string[]; // readonly-data twice: property and array
  birthDate?: string | Date; // readonly-data
}

// Mutable module data is risky, but constructing this array is not reported.
const legacyAuditLog: string[] = [];

export function normalizeForm(raw: any): SignupForm { // no-unsafe-cast
  if (!raw.email?.includes("@")) {
    throw new Error("Email must contain @"); // no-throw
  }
  legacyAuditLog.push(`normalized:${raw.email}`); // no-discarded-values
  const roleList = raw.roles ?? [];
  roleList.push("user"); // no-discarded-values
  // no-ambient-effects reports only the zero-argument constructor.
  raw.birthDate = raw.birthDate ? new Date(raw.birthDate) : new Date(); // no-ambient-effects
  return {
    name: raw.name ?? "",
    email: raw.email,
    roles: roleList,
    birthDate: raw.birthDate,
  };
}

export function toPersistenceRecord(form: SignupForm): Record<string, unknown> {
  // Assignments are not reported. The clock read below is no-ambient-effects.
  form.birthDate = form.birthDate instanceof Date
    ? form.birthDate
    : new Date(form.birthDate ?? Date.now()); // no-ambient-effects
  return { ...form, createdAt: Date.now() }; // no-ambient-effects
}

type Label = string;

export function describeRole(role: Label): Label {
  switch (role) { // statement-forms
    case "admin":
      return "Administrator";
    default:
      return "Member";
  }
}
