// @light-fp adapter -- measurement/experiment tooling for the rederive review; not shipped.
// Measurement helper: AST branch count per file, using the TypeScript AST that
// Deno exposes. Not part of the shipped plugin; lives under plans/ and is not
// published. Run: deno test -A plans/measure_branches.ts -- --out plans/measurements.tsv
//
// Counts decision points: if, else, ?:, switch cases, &&, ||, ??, for/while/
// do-while, catch, optional chaining, and early returns inside branches.
// Also computes per-function cyclomatic complexity and LOC.

import { join } from "@std/path";
import {
  astChildren,
  countBranches,
  isFunctionNode,
  walkTypeScriptFiles,
} from "./ast_metrics.ts";

const complexityOf = (node: Deno.lint.Node): number =>
  1 + countBranches(node, { includeOptionalChains: true });

const countLines = (source: string): number =>
  source.split("\n").filter((line) => line.trim().length > 0).length;

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
    if (isFunctionNode(node)) {
      functionCount += 1;
      maxComplexity = Math.max(maxComplexity, complexityOf(node));
    }
    for (const child of astChildren(node)) visit(child);
  };

  Deno.lint.runPlugin(
    {
      name: "measure",
      rules: {
        probe: {
          create(context) {
            branches = countBranches(context.sourceCode.ast, {
              includeOptionalChains: true,
            });
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
    for await (const path of walkTypeScriptFiles(join(Deno.cwd(), target))) {
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
    `TOTAL\t${totals.loc}\t${totals.branches}\t${totals.functions}\t-\t-`,
  );

  const out = Deno.args.includes("--out")
    ? Deno.args[Deno.args.indexOf("--out") + 1]
    : "plans/measurements.tsv";
  await Deno.writeTextFile(join(Deno.cwd(), out), lines.join("\n") + "\n");
});
