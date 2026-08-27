// @light-fp adapter -- the plugin's composition root.
import { layerBoundary } from "./rules/layer_boundary.ts";
import { pureModule } from "./rules/pure_module.ts";
import { noAmbientEffects } from "./rules/ambient_effects.ts";
import { noThrow } from "./rules/no_throw.ts";
import { noDiscardedValues } from "./rules/discarded_values.ts";
import { readonlyData } from "./rules/readonly_data.ts";
import { noOo } from "./rules/no_oo.ts";
import { noUnsafeCast } from "./rules/no_unsafe_cast.ts";
import { preferTypeForData } from "./rules/prefer_type_for_data.ts";
import { requireIgnoreReason } from "./rules/require_ignore_reason.ts";

const plugin: Deno.lint.Plugin = {
  name: "light-fp",
  rules: {
    // Core: what a domain file is guaranteed to be.
    "layer-boundary": layerBoundary,
    "pure-module": pureModule,
    "no-ambient-effects": noAmbientEffects,
    "no-throw": noThrow,
    "no-discarded-values": noDiscardedValues,
    "readonly-data": readonlyData,
    "no-oo": noOo,
    "no-unsafe-cast": noUnsafeCast,
    // Supporting: house style rather than soundness.
    "prefer-type-for-data": preferTypeForData,
    // Meta: keeps the escape hatches visible.
    "require-ignore-reason": requireIgnoreReason,
  },
};

export default plugin;

export {
  layerBoundary,
  noAmbientEffects,
  noDiscardedValues,
  noOo,
  noThrow,
  noUnsafeCast,
  preferTypeForData,
  pureModule,
  readonlyData,
  requireIgnoreReason,
};
export { type Layer, layerOf } from "./layer.ts";
export {
  type Baseline,
  compare,
  type CountDiagnostics,
  explain,
  type FileDelta,
  measure,
  type Verdict,
} from "./ratchet.ts";
