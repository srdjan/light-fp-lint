// Advanced orchestration example (before): tangled side effects.
// - Mixes networking, persistence, and logging directly in the domain.
// - Uses mutable state and ignores error branches.
// - Hard to test because all capabilities are hard-coded singletons.

import { authService } from "./auth_flow.bad.ts"; // Builds on earlier "bad" example.
import { requestUserProfile } from "./api_orchestration.bad.ts";
import { insertUser } from "./persistence.bad.ts";

let onboardingCount = 0; // Mutable shared state.

export async function onboardNewUser(credentials: { email: string; password: string }) {
  const token = await authService.login(credentials); // Throws on failure, so callers must remember try/catch.
  const profile = await requestUserProfile(token); // Another throw path.
  await insertUser({
    email: profile.email,
    roles: profile.roles ?? ["user"],
  }); // Throws again on driver errors.
  onboardingCount += 1;
  console.log("Onboarded users:", onboardingCount); // Side effect tangled with orchestration.
  return profile;
}

