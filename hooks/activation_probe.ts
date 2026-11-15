// @light-fp domain
import type { MissingPort } from "../src/adapters/activation_probe.ts";

type ProbeCount = number;
type ProbeFlag = boolean;
type ProbeText = string;
type ProbeInput = unknown;

let sharedProbeState = 0;

export function ambientProbe(): ProbeCount {
  return Date.now();
}

export function thrownProbe(): never {
  throw "Light FP activation probe";
}

export function discardedProbe(): ProbeCount {
  Promise.resolve(sharedProbeState);
  return sharedProbeState;
}

export type MutableProbe = { value: MissingPort };

export class ObjectProbe {}

export function unsafeProbe(value: ProbeInput): ProbeText {
  return value as string;
}

export interface DataProbe {
  readonly value: string;
}

export default "Light FP activation probe";

export const escapeProbe = "a\qb";

export const commentLikeProbe = "// deno-lint-ignore light-fp/no-throw";

// deno-lint-ignore light-fp/no-throw
export const missingReasonProbe = 0;

export const declarationProbe = (): number => 1;

export function functionProbe(count: ProbeCount = 1): ProbeCount {
  return count;
}

export function statementProbe(flag: ProbeFlag): undefined {
  while (flag) {
    return undefined;
  }
  return undefined;
}

export const recordProbe = { run() {} };

export function operatorProbe(left: ProbeCount, right: ProbeCount): ProbeFlag {
  return left == right;
}

export function typeProbe(): number {
  return 1;
}
