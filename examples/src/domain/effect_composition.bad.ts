// Advanced orchestration example (before): tangled side effects.
// - Mixes networking, persistence, and logging directly in the domain.
// - Uses mutable state and ignores error branches.
// - Imports concrete dependencies instead of accepting capabilities as inputs.

import { authService } from "./auth_flow.bad.ts"; // Builds on earlier "bad" example.
import { requestUserProfile } from "./api_orchestration.bad.ts";
import { insertUser } from "./persistence.bad.ts";

let onboardingCount = 0; // pure-module

export async function onboardNewUser(
  credentials: { email: string; password: string },
) {
  const token = await authService.login(credentials); // Throws on failure, so callers must remember try/catch.
  const profile = await requestUserProfile(token); // Another throw path.
  await insertUser({ // no-discarded-values
    email: profile.email,
    roles: profile.roles ?? ["user"],
  });
  onboardingCount += 1;
  console.log("Onboarded users:", onboardingCount); // no-ambient-effects, no-discarded-values
  return profile;
}
