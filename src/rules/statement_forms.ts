// @light-fp adapter -- a lint rule adapts Deno's visitor API: it reports through a
// void callback and is driven by mutation it does not own.
import {
  childValuesOf,
  isFlatShorthandObjectPattern,
  isNode,
  memberName,
  patternNames,
  type SyntaxNode,
} from "../ast.ts";
import { isDomain } from "../layer.ts";

const MUTATING_METHODS: readonly string[] = [
  "push",
  "pop",
  "shift",
  "unshift",
  "splice",
  "sort",
  "reverse",
  "fill",
  "copyWithin",
  "set",
  "add",
  "delete",
  "clear",
];

const LIVE_MESSAGE =
  "A loop body changes the collection that the loop iterates.";
const LIVE_HINT = "Read one collection and build the changed one separately.";

/** An identifier, or a chain of non-computed member reads such as `state.items`. */
const isReadChain = (node: Deno.lint.Node): boolean =>
  node.type === "Identifier" ||
  (node.type === "MemberExpression" && !node.computed &&
    isReadChain(node.object));

/** The identifier at the root of a read chain. */
const rootOf = (node: Deno.lint.Node): Deno.lint.Node =>
  node.type === "MemberExpression" ? rootOf(node.object) : node;

/** True when one of the binding patterns `patterns` declares `name`. */
const binds = (
  patterns: readonly (SyntaxNode | null)[],
  name: string,
): boolean => patterns.some((pattern) => patternNames(pattern).includes(name));

/**
 * The statements of a scope, with each exported declaration unwrapped. A
 * switch body is one scope, so a case sees the declarations of every case.
 */
const statementsOf = (node: SyntaxNode): readonly Deno.lint.Node[] => {
  if (node.type === "SwitchCase") {
    return node.parent.cases.flatMap((switchCase) => switchCase.consequent);
  }
  if (
    node.type !== "BlockStatement" && node.type !== "Program" &&
    node.type !== "TSModuleBlock"
  ) {
    return [];
  }
  return node.body.map((statement) =>
    statement.type === "ExportNamedDeclaration" && statement.declaration
      ? statement.declaration
      : statement
  );
};

type Binding = {
  readonly alias: Deno.lint.Node | undefined;
  readonly member?: string;
};

const isFunction = (
  node: SyntaxNode,
): node is
  | Deno.lint.FunctionDeclaration
  | Deno.lint.FunctionExpression
  | Deno.lint.ArrowFunctionExpression =>
  node.type === "FunctionDeclaration" ||
  node.type === "FunctionExpression" ||
  node.type === "ArrowFunctionExpression";

/**
 * The binding of `name` that `scope` declares. `alias` is the read chain of a
 * `const` bound to one, and undefined for any other binding. The result is
 * undefined when `scope` does not bind `name`. A `var` in a nested block
 * counts only in that block, not in the whole function: Deno's recommended
 * `no-var` rule refuses `var`.
 */
const bindingIn = (scope: SyntaxNode, name: string): Binding | undefined => {
  const other: Binding = { alias: undefined };
  if (isFunction(scope)) {
    return binds([scope.id, ...scope.params], name) ? other : undefined;
  }
  if (scope.type === "ClassExpression") {
    return binds([scope.id], name) ? other : undefined;
  }
  if (scope.type === "CatchClause") {
    return binds([scope.param], name) ? other : undefined;
  }
  const head =
    scope.type === "ForOfStatement" || scope.type === "ForInStatement"
      ? scope.left
      : scope.type === "ForStatement"
      ? scope.init
      : null;
  if (head?.type === "VariableDeclaration") {
    return binds(head.declarations.map((declarator) => declarator.id), name)
      ? other
      : undefined;
  }
  for (const statement of statementsOf(scope)) {
    if (statement.type === "VariableDeclaration") {
      for (const declarator of statement.declarations) {
        if (
          declarator.id.type === "Identifier" && declarator.id.name === name
        ) {
          const init = declarator.init;
          return statement.kind === "const" && init !== null &&
              isReadChain(init)
            ? { alias: init }
            : other;
        }
        if (
          declarator.id.type === "ObjectPattern" &&
          statement.kind === "const" && declarator.init !== null &&
          isReadChain(declarator.init) &&
          isFlatShorthandObjectPattern(declarator.id) &&
          declarator.id.properties.some((property) =>
            property.type === "Property" &&
            property.value.type === "Identifier" &&
            property.value.name === name
          )
        ) {
          return { alias: declarator.init, member: name };
        }
        if (binds([declarator.id], name)) return other;
      }
    }
    if (
      (statement.type === "FunctionDeclaration" ||
        statement.type === "ClassDeclaration" ||
        statement.type === "ImportDeclaration") &&
      binds(
        statement.type === "ImportDeclaration"
          ? statement.specifiers.map((specifier) => specifier.local)
          : [statement.id],
        name,
      )
    ) {
      return other;
    }
  }
  return undefined;
};

/** The nearest binding of `name` above `node`, with the scope that declares it. The result is undefined for a free name. */
const bindingOf = (
  node: SyntaxNode,
  name: string,
): (Binding & { readonly scope: SyntaxNode }) | undefined => {
  if (
    node.type === "Program" || node.type === "Line" || node.type === "Block"
  ) {
    return undefined;
  }
  const binding = bindingIn(node.parent, name);
  return binding === undefined
    ? bindingOf(node.parent, name)
    : { ...binding, scope: node.parent };
};

/**
 * A read chain after `const` aliases are followed: the scope that declares
 * its root, undefined for a free name, and the chain text from that root.
 */
type Place = { readonly scope: SyntaxNode | undefined; readonly text: string };

const samePlace = (a: Place | undefined, b: Place): boolean =>
  a !== undefined && a.scope === b.scope && a.text === b.text;

/** Alias hops followed before the rule stops, so a cycle of names ends. */
const MAX_ALIAS_HOPS = 8;

const containsJump = (value: unknown): boolean => {
  if (Array.isArray(value)) return value.some(containsJump);
  if (!isNode(value)) return false;
  if (value.type === "BreakStatement" || value.type === "ContinueStatement") {
    return true;
  }
  return childValuesOf(value).some(containsJump);
};

const alwaysReturns = (node: Deno.lint.Node): boolean => {
  if (node.type === "ReturnStatement") return true;
  if (node.type === "BlockStatement") {
    const last = node.body.at(-1);
    return last !== undefined && alwaysReturns(last);
  }
  if (node.type === "IfStatement") {
    return node.alternate !== null && alwaysReturns(node.consequent) &&
      alwaysReturns(node.alternate);
  }
  return false;
};

const isReturnTerminating = (node: Deno.lint.SwitchStatement): boolean => {
  const finalCase = node.cases.at(-1);
  if (finalCase === undefined || finalCase.consequent.length === 0) {
    return false;
  }
  if (containsJump(node.cases)) return false;
  return node.cases.every((switchCase) => {
    const finalStatement = switchCase.consequent.at(-1);
    return finalStatement === undefined || alwaysReturns(finalStatement);
  });
};

/**
 * `light-fp/statement-forms`: domain code branches with `if`, a lookup, or a
 * return-terminating `switch`, and iterates a finite collection with `for...of`.
 * Fallthrough switches, unbounded loops, labels, and loops that change their
 * own collection hide the control flow from the reader.
 */
export const statementForms: Deno.lint.Rule = {
  create(context) {
    if (!isDomain(context.filename, context.sourceCode)) return {};

    const textOf = (node: Deno.lint.Node): string =>
      context.sourceCode.getText(node);

    /** The place that a read chain names. The result is undefined for any other expression and past the hop limit. */
    const placeOf = (
      node: Deno.lint.Node,
      hops: number,
    ): Place | undefined => {
      const root = rootOf(node);
      if (hops === 0 || !isReadChain(node) || root.type !== "Identifier") {
        return undefined;
      }
      const text = textOf(node);
      const binding = bindingOf(root, root.name);
      if (binding?.alias === undefined) return { scope: binding?.scope, text };
      const aliased = placeOf(binding.alias, hops - 1);
      const member = binding.member === undefined ? "" : `.${binding.member}`;
      return aliased === undefined ? undefined : {
        scope: aliased.scope,
        text: aliased.text + member + text.slice(textOf(root).length),
      };
    };

    /** True when `node` sits in the body of a `for...of` over `place`. */
    const isInLoopOver = (
      node: Deno.lint.Node | Deno.lint.TSParameterProperty,
      place: Place,
    ): boolean => {
      if (
        node.type === "Program" || node.type === "Line" ||
        node.type === "Block"
      ) {
        return false;
      }
      const parent = node.parent;
      if (
        parent.type === "ForOfStatement" && parent.body === node &&
        samePlace(placeOf(parent.right, MAX_ALIAS_HOPS), place)
      ) {
        return true;
      }
      return isInLoopOver(parent, place);
    };

    const reportLive = (
      node: Deno.lint.Node,
      target: Deno.lint.Node,
    ): void => {
      const place = placeOf(target, MAX_ALIAS_HOPS);
      if (place === undefined || !isInLoopOver(node, place)) return;
      context.report({ node, message: LIVE_MESSAGE, hint: LIVE_HINT });
    };

    const reportMemberWrite = (
      node: Deno.lint.Node,
      target: Deno.lint.Node,
    ): void => {
      if (target.type === "MemberExpression") reportLive(node, target.object);
    };

    return {
      LabeledStatement(node) {
        context.report({
          node,
          message: "A label makes `break` and `continue` jump across loops.",
          hint:
            "Use a conditional, or move the loop into a function and return.",
        });
      },

      SwitchStatement(node) {
        if (isReturnTerminating(node)) return;
        context.report({
          node,
          message: "A `switch` has fallthrough or a non-returning case.",
          hint:
            "End every case group with an unconditional return, or use `if`/`else`.",
        });
      },

      WhileStatement(node) {
        context.report({
          node,
          message: "A `while` loop has no bound on its iterations.",
          hint: "Iterate a finite collection with `for...of`.",
        });
      },

      DoWhileStatement(node) {
        context.report({
          node,
          message: "A `do...while` loop has no bound on its iterations.",
          hint: "Iterate a finite collection with `for...of`.",
        });
      },

      ForStatement(node) {
        context.report({
          node,
          message: "A C-style `for` loop manages its own counter.",
          hint:
            "Iterate the collection with `for...of`, or the indices with `for (const i of xs.keys())`.",
        });
      },

      ForInStatement(node) {
        context.report({
          node,
          message:
            "A `for...in` loop walks inherited keys in an unspecified order.",
          hint: "Write `for (const key of Object.keys(record))`.",
        });
      },

      CallExpression(node) {
        const callee = node.callee;
        if (callee.type !== "MemberExpression") return;
        const name = memberName(callee);
        if (name === undefined || !MUTATING_METHODS.includes(name)) return;
        reportLive(node, callee.object);
      },

      AssignmentExpression(node) {
        reportMemberWrite(node, node.left);
      },

      UpdateExpression(node) {
        reportMemberWrite(node, node.argument);
      },

      UnaryExpression(node) {
        if (node.operator === "delete") reportMemberWrite(node, node.argument);
      },
    };
  },
};
