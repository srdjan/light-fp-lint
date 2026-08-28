// @light-fp adapter -- measurement/experiment tooling for the rederive review; not shipped.
// Measurement helper: AST branch count per file, using the TypeScript AST that
// Deno exposes. Not part of the shipped plugin; lives under plans/ and is not
// published. Run: deno test -A plans/measure_branches.ts -- --out plans/measurements.tsv
//
// Counts decision points: if, else, ?:, switch cases, &&, ||, ??, for/while/
// do-while, catch, optional chaining, and early returns inside branches.
// Also computes per-function cyclomatic complexity and LOC.

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

const countBranches = (node: Deno.lint.Node): number => {
  let count = 0;

  const walk = (current: Deno.lint.Node): void => {
    if (BRANCH_TYPES.has(current.type)) count += 1;
    if (OPTIONAL_NODES.has(current.type)) count += 1;
    if (current.type === "IfStatement" && current.alternate !== null) {
      count += 1; // the else arm
    }

    const prototype = Object.getPrototypeOf(current);
    for (const key of Object.getOwnPropertyNames(prototype)) {
      if (key === "constructor" || key === "parent") continue;
      const child: unknown = Reflect.get(current, key);
      if (Array.isArray(child)) {
        for (const item of child) {
          if (item && typeof item === "object" && "type" in item) {
            walk(item as Deno.lint.Node);
          }
        }
      } else if (child && typeof child === "object" && "type" in child) {
        walk(child as Deno.lint.Node);
      }
    }
  };

  walk(node);
  return count;
};

const complexityOf = (node: Deno.lint.Node): number => 1 + countBranches(node);

const isFunction = (node: Deno.lint.Node): boolean =>
  FUNCTION_TYPES.has(node.type);

const countLines = (source: string): number =>
  source.split("\n").filter((line) => line.trim().length > 0).length;

const walk = async function* (dir: string): AsyncGenerator<string> {
  for await (const entry of Deno.readDir(dir)) {
    const path = join(dir, entry.name);
    if (entry.isDirectory) yield* walk(path);
    else if (entry.name.endsWith(".ts")) yield path;
  }
};

type Row = Readonly<{
  file: string;
  loc: number;
  branches: number;
  functions: number;
  maxComplexity: number;
  avgComplexity: number;
}>;

const measureFile = (path: string, source: string): Row => {
  const loc = countLines(source);
  let branches = 0;
  let maxComplexity = 0;
  let functionCount = 0;

  const visit = (node: Deno.lint.Node): void => {
    if (isFunction(node)) {
      functionCount += 1;
      maxComplexity = Math.max(maxComplexity, complexityOf(node));
    }
    const prototype = Object.getPrototypeOf(node);
    for (const key of Object.getOwnPropertyNames(prototype)) {
      if (key === "constructor" || key === "parent") continue;
      const child: unknown = Reflect.get(node, key);
      if (Array.isArray(child)) {
        for (const item of child) {
          if (item && typeof item === "object" && "type" in item) {
            visit(item as Deno.lint.Node);
          }
        }
      } else if (child && typeof child === "object" && "type" in child) {
        visit(child as Deno.lint.Node);
      }
    }
  };

  Deno.lint.runPlugin(
    {
      name: "measure",
      rules: {
        probe: {
          create(context) {
            branches = countBranches(context.sourceCode.ast);
            visit(context.sourceCode.ast);
            return {};
          },
        },
      },
    },
    path,
    source,
  );

  return {
    file: path.replace(Deno.cwd() + "/", ""),
    loc,
    branches,
    functions: functionCount,
    maxComplexity,
    avgComplexity: functionCount === 0
      ? 0
      : Number((1 + branches / functionCount).toFixed(1)),
  };
};

Deno.test("measure: dump AST branch table", async () => {
  const rows: Row[] = [];
  for (const target of ["src", "tests", "hooks", "examples"]) {
    for await (const path of walk(join(Deno.cwd(), target))) {
      if (path.includes("measure_branches.ts")) continue;
      rows.push(measureFile(path, await Deno.readTextFile(path)));
    }
  }
  rows.sort((a, b) => a.file.localeCompare(b.file));

  const lines = [
    "file\tloc\tbranches\tfunctions\tmax-complexity\tavg-complexity",
    ...rows.map((row) =>
      [
        row.file,
        row.loc,
        row.branches,
        row.functions,
        row.maxComplexity,
        row.avgComplexity,
      ].join("\t")
    ),
  ];

  const totals = rows.reduce(
    (acc, row) => ({
      loc: acc.loc + row.loc,
      branches: acc.branches + row.branches,
      functions: acc.functions + row.functions,
    }),
    { loc: 0, branches: 0, functions: 0 },
  );
  lines.push(
    `TOTAL\t${totals.loc}\t${totals.branches}\t${totals.functions}\t\t`,
  );

  const out = Deno.args.includes("--out")
    ? Deno.args[Deno.args.indexOf("--out") + 1]
    : "plans/measurements.tsv";
  await Deno.writeTextFile(join(Deno.cwd(), out), lines.join("\n") + "\n");
});
