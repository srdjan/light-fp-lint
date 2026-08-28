// @light-fp adapter -- measurement/experiment tooling for the rederive review; not shipped.
// Branch-count comparison between the original rule file and the rederived one.
// Run: deno test -A plans/branch_compare_test.ts
import { assertEquals } from "@std/assert";

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

const countBranches = (node: Deno.lint.Node): number => {
  let count = 0;
  const walk = (current: Deno.lint.Node): void => {
    if (BRANCH_TYPES.has(current.type)) count += 1;
    if (current.type === "IfStatement" && current.alternate !== null) {
      count += 1;
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

const fileBranches = async (path: string): Promise<number> => {
  const source = await Deno.readTextFile(path);
  let branches = 0;
  Deno.lint.runPlugin(
    {
      name: "probe",
      rules: {
        probe: {
          create(context) {
            branches = countBranches(context.sourceCode.ast);
            return {};
          },
        },
      },
    },
    path,
    source,
  );
  return branches;
};

Deno.test("branch compare: original vs rederived readonly-data", async () => {
  const before = await fileBranches("plans/readonly_original_reference.ts");
  const after = await fileBranches("src/rules/readonly_data.ts");
  console.log(`readonly-data branches: original=${before} rederived=${after}`);
  assertEquals(after < before, true);
});
