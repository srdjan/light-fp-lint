// A domain file that breaks most of the rules at once. Each trailing comment
// names the rule that reports the same line. The paired good examples in this
// directory show the same work done in the style the gate enforces.
//
// Do not run `deno lint --fix` over this file: the readonly and type-alias
// violations are fixable, and fixing them would delete what the file is for.

import { Something } from "../adapters/side.ts"; // layer-boundary

export type User = {
  id: string; // readonly-data
  roles: string[]; // readonly-data, twice: the property and the array
};

export interface Data { // prefer-type-for-data: it carries data, so it is a type
  readonly id: string;
  readonly run: () => undefined;
}

export const now = Date.now(); // no-ambient-effects, pure-module

let requestCount = 0; // pure-module: module-level mutable state

export class Foo {} // no-oo

export function make(): number { // type-forms: a raw number in an exported signature
  throw new Error("nope"); // no-throw
}

export const record = (input: unknown) => { // declaration-forms: an exported function is a const binding
  Something.send(input); // no-discarded-values
  return input as Foreign; // no-unsafe-cast: Foreign is not declared here
};

export const pattern = "\\d+"; // fine: an escaped backslash
export const label = "a\qb"; // lexical-forms: \q is not an allowed escape

export const fields = { pattern }; // record-forms: a shorthand property

export default make; // module-forms: a default export
