// Advanced orchestration example (after): composes branded effects from smaller domain modules.
// Benefits:
// - Orchestrator remains pure; it simply returns a branded `Onboarding` effect.
// - Composition uses `Result` for its declared failure paths.
// - Each capability stays behind a clear port, making the flow easy to test with fakes.
// - Auto-fix confidence: this import order and type usage line up with the plugin's fixes, so --fix confirms the setup.

import {
  brandWithCapability,
  err,
  ok,
  type Result,
  type WithCapability,
} from "./shared/primitives.ts";
import {
  type AuthError,
  type AuthPlan,
  type Credentials,
  type LoginPorts,
  planLogin,
} from "./auth_flow.good.ts";
import {
  type ApiError,
  type HttpCapability,
  type HttpEffect,
  planProfileFetch,
} from "./api_orchestration.good.ts";
import {
  type PersistenceError,
  planInsertUser,
  type UserRecord,
  type UserRepositoryPort,
} from "./persistence.good.ts";

type Profile = { readonly email: string; readonly roles: readonly string[] };

// A type guard narrows once, in one place, and gives the rest of the function a
// real type. A cast would assert the same thing without checking it.
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function decodeProfile(payload: unknown): Result<ApiError, Profile> {
  if (!isRecord(payload)) {
    return err({
      type: "UnexpectedResponse",
      message: "Profile payload missing",
    });
  }
  const email = payload["email"];
  const roles = payload["roles"];
  if (typeof email !== "string" || !email.includes("@")) {
    return err({
      type: "UnexpectedResponse",
      message: "Profile missing email",
    });
  }
  if (!Array.isArray(roles)) {
    return err({
      type: "UnexpectedResponse",
      message: "Profile missing roles",
    });
  }
  return ok({
    email: email,
    roles: roles.filter((role): role is string => typeof role === "string"),
  });
}

export type CompositeError = AuthError | ApiError | PersistenceError;

type OnboardingPorts = {
  readonly auth: LoginPorts;
  readonly http: HttpCapability;
  readonly repo: UserRepositoryPort;
};

type OnboardingSuccess = {
  readonly token: string;
  readonly storedUserId: number;
};

export type OnboardingEffect = WithCapability<
  "Onboarding",
  OnboardingPorts,
  Result<CompositeError, OnboardingSuccess>
>;

export function planOnboarding(
  ports: OnboardingPorts,
  credentials: Credentials,
): Result<CompositeError, OnboardingEffect> {
  const loginPlanResult = planLogin(ports.auth, credentials);
  if (loginPlanResult._tag === "Err") return loginPlanResult;
  const loginPlan: AuthPlan = loginPlanResult.value;

  return ok(
    brandWithCapability("Onboarding", ports, async (cap) => {
      const loginOutcome = await loginPlan.run();
      if (loginOutcome._tag === "Err") return loginOutcome;

      const profilePlanResult: Result<ApiError, HttpEffect> = planProfileFetch(
        cap.http,
        loginOutcome.value.token,
      );
      if (profilePlanResult._tag === "Err") return profilePlanResult;

      const profileResponse = await profilePlanResult.value.run();
      if (profileResponse._tag === "Err") return profileResponse;

      const profileJson = await profileResponse.value.json();
      const profile = decodeProfile(profileJson);
      if (profile._tag === "Err") return profile;

      const userRecord: UserRecord = {
        email: profile.value.email,
        roles: profile.value.roles,
      };
      const insertPlanResult = planInsertUser(cap.repo, userRecord);
      if (insertPlanResult._tag === "Err") return insertPlanResult;

      const insertOutcome = await insertPlanResult.value.run();
      if (insertOutcome._tag === "Err") return insertOutcome;

      return ok({
        token: loginOutcome.value.token,
        storedUserId: insertOutcome.value,
      });
    }),
  );
}
