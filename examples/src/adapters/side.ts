// Adapter-side demo script that wires the domain plans together.
// Run with: `deno run -A examples/src/adapters/side.ts`
// Shows how adapters execute the branded effects emitted by the domain.

import { planOnboarding } from "../domain/effect_composition.good.ts";
import type { Credentials } from "../domain/auth_flow.good.ts";
import { authPorts } from "./auth.ts";
import { httpCapability } from "./http.ts";
import { inMemoryRepo } from "./persistence.ts";

const onboardingPorts = {
  auth: authPorts,
  http: httpCapability,
  repo: inMemoryRepo,
};

const demoCredentials: Credentials = { email: "admin@example.com", password: "SuperSecurePass12" };

async function main() {
  const plan = planOnboarding(onboardingPorts, demoCredentials);
  if (plan._tag === "Err") {
    console.error("Domain rejected request", plan.error);
    return;
  }

  const outcome = await plan.value.run();
  if (outcome._tag === "Err") {
    console.error("Adapters reported failure", outcome.error);
    return;
  }

  console.log("Onboarding plan executed successfully", outcome.value);
}

// Auto-fix benefit: adding `--fix` keeps import order stable and removes unused ports automatically.
main();

