// @light-fp adapter -- measurement/experiment tooling for the rederive review; not shipped.
// Identifies the highest-complexity function per file. Run:
// deno test -A plans/hotspots.ts -- --out plans/hotspots.tsv
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

const FUNCTION_TYPES = new Set([
  "FunctionDeclaration",
  "FunctionExpression",
  "ArrowFunctionExpression",
  "MethodDefinition",
]);

const children = (node: Deno.lint.Node): readonly Deno.lint.Node[] => {
  const out: Deno.lint.Node[] = [];
  const prototype = Object.getPrototypeOf(node);
  for (const key of Object.getOwnPropertyNames(prototype)) {
    if (key === "constructor" || key === "parent") continue;
    const child: unknown = Reflect.get(node, key);
    if (Array.isArray(child)) {
      for (const item of child) {
        if (item && typeof item === "object" && "type" in item) {
          out.push(item as Deno.lint.Node);
        }
      }
    } else if (child && typeof child === "object" && "type" in child) {
      out.push(child as Deno.lint.Node);
    }
  }
  return out;
};

const countBranches = (node: Deno.lint.Node): number => {
  let count = 0;
  const stack: Deno.lint.Node[] = [node];
  while (stack.length > 0) {
    const current = stack.pop()!;
    if (BRANCH_TYPES.has(current.type)) count += 1;
    if (current.type === "IfStatement" && current.alternate !== null) {
      count += 1;
    }
    for (const child of children(current)) stack.push(child);
  }
  return count;
};

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

const walk = async function* (dir: string): AsyncGenerator<string> {
  for await (const entry of Deno.readDir(dir)) {
    const path = join(dir, entry.name);
    if (entry.isDirectory) yield* walk(path);
    else if (entry.name.endsWith(".ts")) yield path;
  }
};

Deno.test("hotspots: per-file worst functions", async () => {
  const rows: string[][] = [];
  for (const target of ["src", "hooks"]) {
    for await (const path of walk(join(Deno.cwd(), target))) {
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
                  if (FUNCTION_TYPES.has(node.type)) {
                    const complexity = 1 + countBranches(node);
                    named.push({
                      name: nameOf(node),
                      complexity,
                      loc: node.range[1] - node.range[0],
                      startLine: lineOf(node.range[0]),
                    });
                  }
                  for (const child of children(node)) visit(child);
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
