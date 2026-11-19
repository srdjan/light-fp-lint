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
 * The member a member expression names statically: the property of a
 * non-computed `obj.name`, or a string-literal key of `obj["name"]`. A computed
 * member with a non-literal key names nothing this can know without running it.
 */
export const memberName = (
  node: Deno.lint.MemberExpression,
): string | undefined => {
  if (!node.computed) {
    return node.property.type === "Identifier" ? node.property.name : undefined;
  }
  return node.property.type === "Literal" &&
      typeof node.property.value === "string"
    ? node.property.value
    : undefined;
};

/**
 * The names that a binding pattern declares. A default value, a property key,
 * and a type annotation declare no name.
 */
export const patternNames = (node: SyntaxNode | null): readonly string[] => {
  if (!node) return [];
  if (node.type === "Identifier") return [node.name];
  if (node.type === "AssignmentPattern") return patternNames(node.left);
  if (node.type === "RestElement") return patternNames(node.argument);
  if (node.type === "ArrayPattern") {
    return node.elements.flatMap((element) => patternNames(element));
  }
  if (node.type === "ObjectPattern") {
    return node.properties.flatMap((property) =>
      patternNames(property.type === "Property" ? property.value : property)
    );
  }
  if (node.type === "TSParameterProperty") return patternNames(node.parameter);
  return [];
};

/**
 * True for a nonempty object pattern whose every property is a plain shorthand
 * identifier (`{ a, b }`). Renames, defaults, rest, nested, and computed
 * properties make the pattern not flat.
 */
export const isFlatShorthandObjectPattern = (
  node: Deno.lint.ObjectPattern,
): boolean =>
  node.properties.length > 0 &&
  node.properties.every((property) =>
    property.type === "Property" && property.kind === "init" &&
    !property.computed && !property.method && property.shorthand &&
    property.key.type === "Identifier" && property.value.type === "Identifier"
  );

/**
 * The names a file binds itself: imports, variable declarators, function and
 * class names, parameters, catch parameters, and enum, namespace, and import
 * alias names. A global name that appears here is shadowed, not ambient.
 */
export const localBindings = (ast: Deno.lint.Program): ReadonlySet<string> => {
  const names = new Set<string>();
  const visited = new Set<SyntaxNode>();

  const addPattern = (node: SyntaxNode | null): void => {
    for (const name of patternNames(node)) names.add(name);
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
      value.type === "ClassDeclaration" || value.type === "ClassExpression" ||
      value.type === "TSEnumDeclaration" ||
      value.type === "TSDeclareFunction" ||
      value.type === "TSImportEqualsDeclaration"
    ) {
      if (value.id) names.add(value.id.name);
    } else if (value.type === "TSModuleDeclaration") {
      if (value.id.type === "Identifier") names.add(value.id.name);
    } else if (value.type === "CatchClause") {
      addPattern(value.param);
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
