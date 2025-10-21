// Advanced orchestration example (after): composes branded effects from smaller domain modules.
// Benefits:
// - Orchestrator remains pure; it simply returns a branded `Onboarding` effect.
// - Composition uses `Result`, so each failure path is explicit.
// - Each capability stays behind a clear port, making the flow easy to test with fakes.
// - Auto-fix confidence: this import order and type usage line up with the plugin's fixes, so --fix confirms the setup.

import { brandWithCapability, err, ok, type Result, type WithCapability } from "./shared/primitives.ts";
import { planLogin, type AuthError, type AuthPlan, type Credentials, type LoginPorts } from "./auth_flow.good.ts";
import { planProfileFetch, type ApiError, type HttpCapability, type HttpEffect } from "./api_orchestration.good.ts";
import {
  planInsertUser,
  type PersistenceError,
  type UserRecord,
  type UserRepositoryPort,
} from "./persistence.good.ts";

type Profile = Readonly<{ readonly email: string; readonly roles: readonly string[] }>;

const decodeProfile = (payload: unknown): Result<ApiError, Profile> => {
  if (typeof payload !== "object" || payload === null) {
    return err({ type: "UnexpectedResponse", message: "Profile payload missing" });
  }
  const maybe = payload as Record<string, unknown>;
  const email = maybe["email"];
  const roles = maybe["roles"];
  if (typeof email !== "string" || !email.includes("@")) {
    return err({ type: "UnexpectedResponse", message: "Profile missing email" });
  }
  if (!Array.isArray(roles)) {
    return err({ type: "UnexpectedResponse", message: "Profile missing roles" });
  }
  return ok({ email, roles: roles.filter((role): role is string => typeof role === "string") });
};

export type CompositeError = AuthError | ApiError | PersistenceError;

type OnboardingPorts = Readonly<{
  readonly auth: LoginPorts;
  readonly http: HttpCapability;
  readonly repo: UserRepositoryPort;
}>;

type OnboardingSuccess = Readonly<{ readonly token: string; readonly storedUserId: number }>;

export type OnboardingEffect = WithCapability<"Onboarding", OnboardingPorts, Result<CompositeError, OnboardingSuccess>>;

export const planOnboarding = (
  ports: OnboardingPorts,
  credentials: Credentials,
): Result<CompositeError, OnboardingEffect> => {
  const loginPlanResult = planLogin(ports.auth, credentials);
  if (loginPlanResult._tag === "Err") return loginPlanResult;
  const loginPlan: AuthPlan = loginPlanResult.value;

  return ok(
    brandWithCapability("Onboarding", ports, async (cap) => {
      const loginOutcome = await loginPlan.run();
      if (loginOutcome._tag === "Err") return loginOutcome;

      const profilePlanResult: Result<ApiError, HttpEffect> = planProfileFetch(cap.http, loginOutcome.value.token);
      if (profilePlanResult._tag === "Err") return profilePlanResult;

      const profileResponse = await profilePlanResult.value.run();
      if (profileResponse._tag === "Err") return profileResponse;

      const profileJson = await profileResponse.value.json();
      const profile = decodeProfile(profileJson);
      if (profile._tag === "Err") return profile;

      const userRecord: UserRecord = { email: profile.value.email, roles: profile.value.roles };
      const insertPlanResult = planInsertUser(cap.repo, userRecord);
      if (insertPlanResult._tag === "Err") return insertPlanResult;

      const insertOutcome = await insertPlanResult.value.run();
      if (insertOutcome._tag === "Err") return insertOutcome;

      return ok({ token: loginOutcome.value.token, storedUserId: insertOutcome.value });
    }),
  );
};
