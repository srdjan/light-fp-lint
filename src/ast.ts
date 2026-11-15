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

export type SyntaxNode = Deno.lint.Node | Deno.lint.TSParameterProperty;

export const isNode = (value: unknown): value is SyntaxNode =>
  typeof value === "object" &&
  value !== null &&
  "type" in value &&
  typeof value.type === "string";

/**
 * The names a file binds itself: imports, variable declarators, function names,
 * and parameters. A global name that appears here is shadowed, not ambient.
 */
export const localBindings = (ast: Deno.lint.Program): ReadonlySet<string> => {
  const names = new Set<string>();
  const visited = new Set<SyntaxNode>();

  const addPattern = (node: SyntaxNode | null): void => {
    if (!node) return;
    if (node.type === "Identifier") {
      names.add(node.name);
      return;
    }
    if (node.type === "AssignmentPattern") {
      addPattern(node.left);
      return;
    }
    if (node.type === "RestElement") {
      addPattern(node.argument);
      return;
    }
    if (node.type === "ArrayPattern") {
      for (const element of node.elements) addPattern(element);
      return;
    }
    if (node.type === "ObjectPattern") {
      for (const property of node.properties) {
        addPattern(property.type === "Property" ? property.value : property);
      }
      return;
    }
    if (node.type === "TSParameterProperty") addPattern(node.parameter);
  };

  const visit = (value: unknown): void => {
    if (Array.isArray(value)) {
      for (const item of value) visit(item);
      return;
    }
    if (!isNode(value) || visited.has(value)) return;
    visited.add(value);

    if (
      value.type === "ImportSpecifier" ||
      value.type === "ImportDefaultSpecifier" ||
      value.type === "ImportNamespaceSpecifier"
    ) {
      names.add(value.local.name);
    } else if (value.type === "VariableDeclarator") {
      addPattern(value.id);
    } else if (value.type === "FunctionDeclaration") {
      if (value.id) names.add(value.id.name);
      for (const parameter of value.params) addPattern(parameter);
    } else if (
      value.type === "FunctionExpression" ||
      value.type === "ArrowFunctionExpression"
    ) {
      if (value.type === "FunctionExpression" && value.id) {
        names.add(value.id.name);
      }
      for (const parameter of value.params) addPattern(parameter);
    }

    for (const child of childValuesOf(value)) {
      visit(child);
    }
  };

  visit(ast);
  return names;
};
