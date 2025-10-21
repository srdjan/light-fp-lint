// Intermediate API example (before): domain code tightly coupled to HTTP.
// - Calls `fetch` directly, so the boundary between domain and adapter is blurry.
// - Uses mutable caches and logging side effects mid-flow.
// - Throws on non-200 responses instead of returning a typed Result.

const responseCache: unknown[] = []; // Mutable state mixed with domain logic.

export async function requestUserProfile(token: string) {
  const res = await fetch("https://api.example.com/me", { // Rule violation: domain depending on HTTP adapter.
    method: "GET",
    headers: { authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    throw new Error("Unable to fetch profile"); // Result rule violation.
  }
  const json = await res.json();
  console.log("Fetched profile", json); // Side effect in domain logic.
  responseCache.push(json); // Hidden mutation.
  return json;
}

export async function postAuditEvent(token: string, event: Record<string, unknown>) {
  const res = await fetch("https://api.example.com/audit", {
    method: "POST",
    headers: { authorization: `Bearer ${token}` },
    body: JSON.stringify({ ...event, at: Date.now() }), // `Date.now()` in domain logic.
  });
  if (!res.ok) {
    throw new Error(`Audit failed: ${res.status}`);
  }
}

