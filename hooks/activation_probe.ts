// @light-fp domain
import type { MissingPort } from "../src/adapters/activation_probe.ts";

let sharedProbeState = 0;

export function ambientProbe(): number {
  return Date.now();
}

export function thrownProbe(): never {
  throw new Error("Light FP activation probe");
}

export function discardedProbe(): number {
  Promise.resolve(sharedProbeState);
  return sharedProbeState;
}

export type MutableProbe = { value: MissingPort };

export class ObjectProbe {}

export function unsafeProbe(value: unknown): string {
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

export function functionProbe(count: number = 1): number {
  return count;
}
