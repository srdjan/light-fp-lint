// @light-fp adapter -- shared traversal over the Deno lint AST.
//
// The lint API exposes each node's child fields on its prototype. A rule that
// needs to enumerate all of a node's children (rather than visit named node
// types) iterates those prototype property names. Two rules used to implement
// that walk separately with slightly different key filters; this module is the
// single authority for the walk.

const SKIPPED_KEYS = new Set([
  "constructor",
  "parent",
  "type",
  "range",
  "loc",
]);

/**
 * The child values reachable from an AST node, in prototype-key order. The
 * skipped keys are metadata, not children: `parent` would cycle back up the
 * tree, and `type`/`range`/`loc` are scalars or plain positions with no AST
 * children of their own.
 */
export const childValuesOf = (value: unknown): readonly unknown[] => {
  if (typeof value !== "object" || value === null) return [];
  const prototype = Object.getPrototypeOf(value);
  return Object.getOwnPropertyNames(prototype)
    .filter((key) => !SKIPPED_KEYS.has(key))
    .map((key) => Reflect.get(value, key));
};
