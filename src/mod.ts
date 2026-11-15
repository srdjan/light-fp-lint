/**
 * A Deno lint plugin for Light Functional Programming in TypeScript.
 *
 * Every file resolves to one of three layers: `domain`, `adapter`, or
 * `prelude`. Domain files carry the strict contract - no module-scope work, no
 * ambient effects, no `throw`, no unchecked cast - and adapter files carry the
 * effects. A file opts out with a header pragma, `// @light-fp adapter`.
 *
 * Register the plugin in `deno.json` and the rules run with `deno lint`:
 *
 * ```json
 * {
 *   "lint": {
 *     "plugins": ["jsr:@srdjan/light-fp-lint"]
 *   }
 * }
 * ```
 *
 * The default export is the plugin object itself. Each rule is also exported by
 * name, together with layer resolution and the ratchet helpers, for tests that
 * drive the rules directly:
 *
 * ```ts
 * import plugin, { layerOf } from "@srdjan/light-fp-lint";
 *
 * const rules: readonly string[] = Object.keys(plugin.rules);
 * ```
 *
 * @module
 */
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
import { declarationForms } from "./rules/declaration_forms.ts";
import { functionForms } from "./rules/function_forms.ts";
import { lexicalForms } from "./rules/lexical_forms.ts";
import { moduleForms } from "./rules/module_forms.ts";
import { operatorForms } from "./rules/operator_forms.ts";
import { statementForms } from "./rules/statement_forms.ts";
import { recordForms } from "./rules/record_forms.ts";
import { requireIgnoreReason } from "./rules/require_ignore_reason.ts";

/**
 * The lint plugin, named `light-fp`. Reference it from the `lint.plugins` array
 * of a `deno.json` file, or pass it to `Deno.lint.runPlugin` in a test.
 */
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
    // Restrictions: zts-model-1 forms that apply to standard TypeScript.
    "module-forms": moduleForms,
    "lexical-forms": lexicalForms,
    "declaration-forms": declarationForms,
    "function-forms": functionForms,
    "statement-forms": statementForms,
    "operator-forms": operatorForms,
    "record-forms": recordForms,
    // Supporting: house style rather than soundness.
    "prefer-type-for-data": preferTypeForData,
    // Meta: keeps the escape hatches visible.
    "require-ignore-reason": requireIgnoreReason,
  },
};

export default plugin;

export {
  declarationForms,
  functionForms,
  layerBoundary,
  lexicalForms,
  moduleForms,
  noAmbientEffects,
  noDiscardedValues,
  noOo,
  noThrow,
  noUnsafeCast,
  operatorForms,
  preferTypeForData,
  pureModule,
  readonlyData,
  recordForms,
  requireIgnoreReason,
  statementForms,
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
