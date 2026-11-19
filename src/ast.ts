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

const isPlainName = (text: string): boolean =>
  text.length > 0 &&
  [...text].every((char, index) =>
    (char >= "a" && char <= "z") || (char >= "A" && char <= "Z") ||
    char === "_" || char === "$" || (index > 0 && char >= "0" && char <= "9")
  );

const OPENERS = "[{(";
const CLOSERS = "]})";

/** The comma-separated slots of a list's inner text, split at depth zero. */
const topLevelSlots = (inner: string): readonly string[] => {
  const slots: string[] = [];
  let depth = 0;
  let start = 0;
  for (let index = 0; index < inner.length; index++) {
    const char = inner.charAt(index);
    if (OPENERS.includes(char)) depth++;
    if (CLOSERS.includes(char)) depth--;
    if (char === "," && depth === 0) {
      slots.push(inner.slice(start, index));
      start = index + 1;
    }
  }
  slots.push(inner.slice(start));
  return slots;
};

/**
 * The text between a leading `[` and the bracket that closes it. A type
 * annotation or a default value after the pattern is not part of it.
 */
const bracketInner = (text: string): string | undefined => {
  if (!text.startsWith("[")) return undefined;
  let depth = 0;
  for (let index = 0; index < text.length; index++) {
    const char = text.charAt(index);
    if (OPENERS.includes(char)) depth++;
    if (CLOSERS.includes(char)) depth--;
    if (depth === 0) return text.slice(1, index);
  }
  return undefined;
};

/**
 * The names one array-pattern slot declares, read from its source text: a
 * plain name, a rest name, a name with a default, or a nested array pattern.
 * An object pattern or any other shape yields no name, so a misread slot can
 * only add a report, never hide one.
 */
const slotNames = (slot: string): readonly string[] => {
  const text = slot.trim();
  if (text.startsWith("...")) return slotNames(text.slice(3));
  const nested = bracketInner(text);
  if (nested !== undefined) return topLevelSlots(nested).flatMap(slotNames);
  const equals = text.indexOf("=");
  const name = equals === -1 ? text : text.slice(0, equals).trim();
  return isPlainName(name) ? [name] : [];
};

/**
 * The names that a binding pattern declares. A default value, a property key,
 * and a type annotation declare no name.
 *
 * Deno 2.9.8 drops every array-pattern element from the first hole on:
 * `[a, , b]` arrives as `[a]` and `[, b]` as `[]`. When `textOf` is given,
 * the names in the dropped slots are read from the pattern's source text.
 */
export const patternNames = (
  node: SyntaxNode | null,
  textOf?: (pattern: Deno.lint.ArrayPattern) => string,
): readonly string[] => {
  if (!node) return [];
  if (node.type === "Identifier") return [node.name];
  if (node.type === "AssignmentPattern") return patternNames(node.left, textOf);
  if (node.type === "RestElement") return patternNames(node.argument, textOf);
  if (node.type === "ArrayPattern") {
    const kept = node.elements.flatMap((element) =>
      patternNames(element, textOf)
    );
    const inner = textOf === undefined
      ? undefined
      : bracketInner(textOf(node).trim());
    if (inner === undefined) return kept;
    const dropped = topLevelSlots(inner).slice(node.elements.length);
    return [...kept, ...dropped.flatMap(slotNames)];
  }
  if (node.type === "ObjectPattern") {
    return node.properties.flatMap((property) =>
      patternNames(
        property.type === "Property" ? property.value : property,
        textOf,
      )
    );
  }
  if (node.type === "TSParameterProperty") {
    return patternNames(node.parameter, textOf);
  }
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
export const localBindings = (
  sourceCode: Deno.lint.SourceCode,
): ReadonlySet<string> => {
  const names = new Set<string>();
  const visited = new Set<SyntaxNode>();
  const textOf = (pattern: Deno.lint.ArrayPattern): string =>
    sourceCode.getText(pattern);

  const addPattern = (node: SyntaxNode | null): void => {
    for (const name of patternNames(node, textOf)) names.add(name);
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

  visit(sourceCode.ast);
  return names;
};
