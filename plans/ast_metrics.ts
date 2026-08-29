// @light-fp adapter -- private AST measurement support; not shipped.
import { join } from "@std/path";

const BRANCH_TYPES = new Set([
  "IfStatement",
  "ConditionalExpression",
  "SwitchCase",
  "LogicalExpression",
  "ForStatement",
  "ForInStatement",
  "ForOfStatement",
  "WhileStatement",
  "DoWhileStatement",
  "CatchClause",
]);

const OPTIONAL_NODES = new Set([
  "OptionalCallExpression",
  "OptionalMemberExpression",
  "OptionalChainExpression",
]);

const FUNCTION_TYPES = new Set([
  "FunctionDeclaration",
  "FunctionExpression",
  "ArrowFunctionExpression",
  "MethodDefinition",
]);

export type BranchCountOptions = Readonly<{
  includeOptionalChains?: boolean;
}>;

export const astChildren = (
  node: Deno.lint.Node,
): readonly Deno.lint.Node[] => {
  const children: Deno.lint.Node[] = [];
  const prototype = Object.getPrototypeOf(node);
  for (const key of Object.getOwnPropertyNames(prototype)) {
    if (key === "constructor" || key === "parent") continue;
    const child: unknown = Reflect.get(node, key);
    if (Array.isArray(child)) {
      for (const item of child) {
        if (item && typeof item === "object" && "type" in item) {
          children.push(item as Deno.lint.Node);
        }
      }
    } else if (child && typeof child === "object" && "type" in child) {
      children.push(child as Deno.lint.Node);
    }
  }
  return children;
};

export const countBranches = (
  node: Deno.lint.Node,
  options: BranchCountOptions = {},
): number => {
  const current = Number(BRANCH_TYPES.has(node.type)) +
    Number(node.type === "IfStatement" && node.alternate !== null) +
    Number(
      options.includeOptionalChains === true && OPTIONAL_NODES.has(node.type),
    );
  return current + astChildren(node).reduce(
    (count, child) => count + countBranches(child, options),
    0,
  );
};

export const isFunctionNode = (node: Deno.lint.Node): boolean =>
  FUNCTION_TYPES.has(node.type);

export const walkTypeScriptFiles = async function* (
  directory: string,
): AsyncGenerator<string> {
  for await (const entry of Deno.readDir(directory)) {
    const path = join(directory, entry.name);
    if (entry.isDirectory) yield* walkTypeScriptFiles(path);
    else if (entry.name.endsWith(".ts")) yield path;
  }
};
