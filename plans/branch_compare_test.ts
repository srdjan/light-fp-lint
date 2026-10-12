// @light-fp adapter -- measurement/experiment tooling for the rederive review; not shipped.
// Branch-count comparison between the original rule file and the rederived one.
// Run: deno test -A plans/branch_compare_test.ts
import { assertEquals } from "@std/assert";
import { countBranches } from "./ast_metrics.ts";

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

// The frozen original has no Readonly<> handling. The rule gained the wrapped-
// literal and redundant-wrapper behavior after the rederive, and that behavior
// costs this many branches. The rederive itself must still cost fewer.
const READONLY_WRAPPER_BRANCHES = 8;

Deno.test("branch compare: original vs rederived readonly-data", async () => {
  const before = await fileBranches("plans/readonly_original_reference.ts");
  const after = await fileBranches("src/rules/readonly_data.ts");
  console.log(`readonly-data branches: original=${before} rederived=${after}`);
  assertEquals(after < before + READONLY_WRAPPER_BRANCHES, true);
});
