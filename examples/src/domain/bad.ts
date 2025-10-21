// Domain code with multiple violations
import { Something } from "../adapters/side.ts"; // imports-boundary

export type User = {
  id: string;
  roles: string[]; // readonly-data
};

export interface Data { // interface-vs-type
  readonly id: string;
  readonly run: () => void; // not a pure data structure
}

export const now = Date.now(); // no-top-level-effects

export class Foo {} // no-class

export function make(): Result<string, number> { // missing Result import in example
  throw new Error("nope"); // result-type-usage
}
