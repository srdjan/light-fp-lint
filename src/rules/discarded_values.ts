// @light-fp adapter -- a lint rule adapts Deno's visitor API: it reports through a
// void callback and is driven by mutation it does not own.
import { childValuesOf, isNode, type SyntaxNode } from "../ast.ts";
import { layerOf } from "../layer.ts";

const FUNCTION_SCOPES = new Set([
  "FunctionDeclaration",
  "FunctionExpression",
  "ArrowFunctionExpression",
  "MethodDefinition",
]);

type UnitDeclaration = Readonly<{
  declaration: Deno.lint.FunctionDeclaration;
  owner: Deno.lint.BlockStatement;
}>;

const occurrenceName = (node: SyntaxNode): string | undefined => {
  const nodeType: string = node.type;
  if (nodeType !== "Identifier" && nodeType !== "JSXIdentifier") {
    return undefined;
  }
  return "name" in node && typeof node.name === "string"
    ? node.name
    : undefined;
};

const functionBodyOwner = (
  node: Deno.lint.FunctionDeclaration,
  sourceCode: Deno.lint.SourceCode,
): Deno.lint.BlockStatement | undefined => {
  const ancestors = sourceCode.getAncestors(node);
  const block = ancestors.at(-1);
  const owner = ancestors.at(-2);
  if (block?.type !== "BlockStatement" || owner === undefined) return undefined;
  if (
    owner.type !== "FunctionDeclaration" &&
    owner.type !== "FunctionExpression" &&
    owner.type !== "ArrowFunctionExpression"
  ) {
    return undefined;
  }
  return owner.body === block ? block : undefined;
};

// A `: void` helper is proven unit only when its own body never returns a
// value. Bare `return` and falling off the end both complete with `undefined`,
// but `return expr`, `return undefined`, and an unreachable valued return can
// carry a forwarded `Result` or `Promise` and must stay reported. Returns
// inside a nested callable body belong to that callable, not this one.
const bodyHasValuedReturn = (body: Deno.lint.BlockStatement): boolean => {
  const visited = new Set<SyntaxNode>();
  const visit = (value: unknown): boolean => {
    if (Array.isArray(value)) return value.some(visit);
    if (!isNode(value) || visited.has(value)) return false;
    visited.add(value);
    if (value.type === "ReturnStatement") {
      if (value.argument !== null) return true;
    }
    if (FUNCTION_SCOPES.has(value.type)) return false;
    return childValuesOf(value).some(visit);
  };
  return visit(body);
};

const unitDeclaration = (
  node: Deno.lint.FunctionDeclaration,
  sourceCode: Deno.lint.SourceCode,
): UnitDeclaration | undefined => {
  const body: Deno.lint.BlockStatement | null | undefined = node.body;
  if (
    body === null || body === undefined || node.declare || node.async ||
    node.generator || node.id === null
  ) {
    return undefined;
  }
  const returnType = node.returnType?.typeAnnotation.type;
  if (returnType === "TSVoidKeyword") {
    if (bodyHasValuedReturn(body)) return undefined;
  } else if (returnType !== "TSUndefinedKeyword") {
    return undefined;
  }
  const owner = functionBodyOwner(node, sourceCode);
  return owner === undefined ? undefined : { declaration: node, owner };
};

const directUnitCall = (
  occurrence: SyntaxNode,
  owner: Deno.lint.BlockStatement,
  sourceCode: Deno.lint.SourceCode,
): Deno.lint.CallExpression | undefined => {
  if (occurrence.type !== "Identifier") return undefined;
  const call = occurrence.parent;
  if (
    call.type !== "CallExpression" || call.callee !== occurrence ||
    call.optional
  ) {
    return undefined;
  }
  return sourceCode.getAncestors(occurrence).includes(owner) ? call : undefined;
};

const allowedUnitCalls = (
  ast: Deno.lint.Program,
  sourceCode: Deno.lint.SourceCode,
): ReadonlySet<Deno.lint.CallExpression> => {
  const declarations: UnitDeclaration[] = [];
  const occurrences = new Map<string, SyntaxNode[]>();
  const visited = new Set<SyntaxNode>();
  let hasDynamicScope = false;

  const visit = (value: unknown): void => {
    if (Array.isArray(value)) {
      for (const item of value) visit(item);
      return;
    }
    if (!isNode(value) || visited.has(value)) return;
    visited.add(value);

    const nodeType: string = value.type;
    const name = occurrenceName(value);
    if (name !== undefined) {
      const named = occurrences.get(name) ?? [];
      named.push(value);
      occurrences.set(name, named);
      if (name === "eval") hasDynamicScope = true;
    }
    if (nodeType === "WithStatement") hasDynamicScope = true;
    if (value.type === "FunctionDeclaration") {
      const candidate = unitDeclaration(value, sourceCode);
      if (candidate !== undefined) declarations.push(candidate);
    }

    for (const child of childValuesOf(value)) visit(child);
  };

  visit(ast);
  if (hasDynamicScope) return new Set();

  const allowed = new Set<Deno.lint.CallExpression>();
  for (const candidate of declarations) {
    const id = candidate.declaration.id;
    if (id === null) continue;
    const calls: Deno.lint.CallExpression[] = [];
    let valid = true;
    for (const occurrence of occurrences.get(id.name) ?? []) {
      if (occurrence === id) continue;
      const call = directUnitCall(occurrence, candidate.owner, sourceCode);
      if (call === undefined) {
        valid = false;
        break;
      }
      calls.push(call);
    }
    if (valid) {
      for (const call of calls) allowed.add(call);
    }
  }
  return allowed;
};

const isAllowedStatementExpression = (
  node: Deno.lint.Node,
  unitCalls: ReadonlySet<Deno.lint.CallExpression>,
): boolean =>
  node.type === "AssignmentExpression" ||
  node.type === "UpdateExpression" ||
  node.type === "YieldExpression" ||
  (node.type === "CallExpression" &&
    (node.callee.type === "Super" || unitCalls.has(node)));

const isDirective = (
  node: Deno.lint.ExpressionStatement,
  ancestors: readonly Deno.lint.Node[],
): boolean => {
  if (node.expression.type !== "Literal") return false;
  if (typeof node.expression.value !== "string") return false;
  const block = ancestors.at(-1);
  const owner = ancestors.at(-2);
  if (!block || block.type !== "BlockStatement" || !owner) return false;
  if (!FUNCTION_SCOPES.has(owner.type)) return false;
  const position = block.body.indexOf(node);
  return position >= 0 &&
    block.body.slice(0, position + 1).every((statement) =>
      statement.type === "ExpressionStatement" &&
      statement.expression.type === "Literal" &&
      typeof statement.expression.value === "string"
    );
};

/**
 * The unhandled-Result rule, made decidable by asking a syntactic question.
 *
 * "Is this a Result?" needs type information the linter does not have. "Is a
 * value being thrown away?" is pure syntax. One narrow exception is decidable
 * from checked source: a concrete nested function that explicitly returns
 * `undefined` promises no meaningful result. This says nothing about its
 * effects, termination, or ownership of values it mutates.
 */
export const noDiscardedValues: Deno.lint.Rule = {
  create(context) {
    if (layerOf(context.filename, context.sourceCode) === "adapter") return {};

    const unitCalls = allowedUnitCalls(
      context.sourceCode.ast,
      context.sourceCode,
    );

    return {
      ExpressionStatement(node) {
        // Module scope is pure-module's territory; this rule owns function bodies.
        const ancestors = context.sourceCode.getAncestors(node);
        const insideFunction = ancestors.some((ancestor) =>
          FUNCTION_SCOPES.has(ancestor.type)
        );
        if (!insideFunction) return;

        const expression = node.expression;

        // `void expr` is an explicit discard, which is still a discard.
        if (
          expression.type === "UnaryExpression" &&
          expression.operator === "void"
        ) {
          context.report({
            node,
            message: "The value this expression produces is discarded.",
            hint:
              "Assign it, return it, or match on its _tag. `void` hides the problem instead of solving it.",
          });
          return;
        }

        // Assignments and updates exist for their state transition. A directive
        // prologue is metadata, yield advances a generator, super() is required,
        // and a proven unit call has no meaningful result. Every other expression
        // makes a value and then silently loses it.
        if (isAllowedStatementExpression(expression, unitCalls)) return;
        if (isDirective(node, ancestors)) return;

        context.report({
          node,
          message: "The value this expression produces is discarded.",
          hint:
            "Assign it, return it, or match on its _tag. If nothing needs the value, the call does not belong in domain code.",
        });
      },
    };
  },
};
