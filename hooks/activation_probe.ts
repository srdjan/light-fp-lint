// @light-fp domain
import type { MissingPort } from "../src/adapters/activation_probe.ts";

let sharedProbeState = 0;

export const ambientProbe = (): number => Date.now();

export const thrownProbe = (): never => {
  throw new Error("Light FP activation probe");
};

export const discardedProbe = (): number => {
  Promise.resolve(sharedProbeState);
  return sharedProbeState;
};

export type MutableProbe = { value: MissingPort };

export class ObjectProbe {}

export const unsafeProbe = (value: unknown): string => value as string;

export interface DataProbe {
  readonly value: string;
}

export default "Light FP activation probe";

export const escapeProbe = "a\qb";

export const commentLikeProbe = "// deno-lint-ignore light-fp/no-throw";

// deno-lint-ignore light-fp/no-throw
export const missingReasonProbe = 0;
