// @light-fp adapter -- measurement/experiment tooling for the rederive review; not shipped.
// Identifies the highest-complexity function per file. Run:
// deno test -A plans/hotspots.ts -- --out plans/hotspots.tsv
import { join } from "@std/path";
import {
  astChildren,
  countBranches,
  isFunctionNode,
  walkTypeScriptFiles,
} from "./ast_metrics.ts";

type NamedFn = Readonly<{
  name: string;
  complexity: number;
  loc: number;
  startLine: number;
}>;

const idName = (node: Deno.lint.Node): string | undefined => {
  const maybe = (node as unknown as Record<string, unknown>).id;
  return maybe && typeof maybe === "object" &&
      (maybe as Record<string, unknown>).type === "Identifier"
    ? (maybe as Record<string, unknown>).name as string
    : undefined;
};

const nameOf = (node: Deno.lint.Node): string => {
  if (node.type === "ArrowFunctionExpression") {
    return idName(node) ?? "(anonymous arrow)";
  }
  if (node.type === "FunctionExpression") return idName(node) ?? "(anonymous)";
  if (node.type === "MethodDefinition") {
    const key = node.key as unknown as Record<string, unknown>;
    if (typeof key.name === "string") return `method ${key.name}`;
    return "(anonymous method)";
  }
  if (node.type === "FunctionDeclaration") return idName(node) ?? "(anonymous)";
  return "(anonymous)";
};

Deno.test("hotspots: per-file worst functions", async () => {
  const rows: string[][] = [];
  for (const target of ["src", "hooks"]) {
    for await (const path of walkTypeScriptFiles(join(Deno.cwd(), target))) {
      if (
        path.includes("measure_branches.ts") || path.includes("hotspots.ts")
      ) {
        continue;
      }
      const source = await Deno.readTextFile(path);
      const lineOffsets: number[] = [0];
      for (let i = 0; i < source.length; i += 1) {
        if (source[i] === "\n") lineOffsets.push(i + 1);
      }
      const lineOf = (offset: number): number => {
        let lo = 0;
        let hi = lineOffsets.length;
        while (lo < hi) {
          const mid = (lo + hi) >> 1;
          if (lineOffsets[mid] <= offset) lo = mid + 1;
          else hi = mid;
        }
        return lo;
      };
      const named: NamedFn[] = [];
      Deno.lint.runPlugin(
        {
          name: "hotspots",
          rules: {
            probe: {
              create(context) {
                const visit = (node: Deno.lint.Node): void => {
                  if (isFunctionNode(node)) {
                    const complexity = 1 + countBranches(node);
                    named.push({
                      name: nameOf(node),
                      complexity,
                      loc: node.range[1] - node.range[0],
                      startLine: lineOf(node.range[0]),
                    });
                  }
                  for (const child of astChildren(node)) visit(child);
                };
                visit(context.sourceCode.ast);
                return {};
              },
            },
          },
        },
        path,
        source,
      );

      const sorted = named.toSorted((a, b) =>
        b.complexity - a.complexity || b.loc - a.loc
      ).slice(0, 3);
      for (const fn of sorted) {
        rows.push([
          path.replace(Deno.cwd() + "/", ""),
          fn.name,
          String(fn.complexity),
          String(fn.startLine),
        ]);
      }
    }
  }
  const out = Deno.args.includes("--out")
    ? Deno.args[Deno.args.indexOf("--out") + 1]
    : "plans/hotspots.tsv";
  const lines = [
    "file\tfunction\tcomplexity\tstart-line",
    ...rows.map((row) => row.join("\t")),
  ];
  await Deno.writeTextFile(join(Deno.cwd(), out), lines.join("\n") + "\n");
});
