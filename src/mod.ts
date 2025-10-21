import { effectBrandOriginRule, noDirectEffectAssertionRule, resultTypeRule, interfaceVsTypeRule, immutabilityRule, noClassRule } from "./rules/core.ts";
import { importsBoundary } from "./rules/boundary.ts";
import { noTopLevelEffects } from "./rules/top_level_effects.ts";
import { noNew, noThis } from "./rules/no_new_this.ts";

const plugin: Deno.lint.Plugin = {
  name: "light-fp",
  rules: {
    "effect-brand-origin": effectBrandOriginRule,
    "no-direct-effect-assertion": noDirectEffectAssertionRule,
    "result-type-usage": resultTypeRule,
    "interface-vs-type": interfaceVsTypeRule,
    "readonly-data": immutabilityRule,
    "no-class": noClassRule,
    "imports-boundary": importsBoundary,
    "no-top-level-effects": noTopLevelEffects,
    "no-new": noNew,
    "no-this": noThis,
  },
};

export default plugin;
export {
  effectBrandOriginRule,
  noDirectEffectAssertionRule,
  resultTypeRule,
  interfaceVsTypeRule,
  immutabilityRule,
  noClassRule,
  importsBoundary,
  noTopLevelEffects,
  noNew,
  noThis,
};
