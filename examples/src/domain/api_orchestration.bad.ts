// Intermediate API example (before): domain code tightly coupled to HTTP.
// - Calls `fetch` directly, so the boundary between domain and adapter is blurry.
// - Uses mutable caches and logging side effects mid-flow.
// - Throws on non-200 responses instead of returning a typed Result.

// Mutable module data is risky, but constructing this array is not reported.
const responseCache: unknown[] = [];

export async function requestUserProfile(token: string) {
  const res = await fetch("https://api.example.com/me", { // no-ambient-effects
    method: "GET",
    headers: { authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    throw new Error("Unable to fetch profile"); // no-throw
  }
  const json = await res.json();
  console.log("Fetched profile", json); // no-ambient-effects, no-discarded-values
  responseCache.push(json); // no-discarded-values
  return json;
}

export async function postAuditEvent(
  token: string,
  event: Record<string, unknown>,
) {
  const res = await fetch("https://api.example.com/audit", { // no-ambient-effects
    method: "POST",
    headers: { authorization: `Bearer ${token}` },
    body: JSON.stringify({ ...event, at: Date.now() }), // no-ambient-effects
  });
  if (!res.ok) {
    throw new Error(`Audit failed: ${res.status}`); // no-throw
  }
}
