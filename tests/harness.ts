// @light-fp adapter -- a test helper: it drives the Deno lint API and throws
// assertion failures, which is what a test harness is for.
import plugin from "../src/mod.ts";

export const DOMAIN = "/repo/src/domain/sample.ts";
export const ADAPTER = "/repo/src/adapters/sample.ts";

const RULE_IDS = Object.keys(plugin.rules).toSorted();

export type Case = {
  /** What the case demonstrates, used as the failure message. */
  readonly name: string;
  readonly source: string;
  readonly filename?: string;
  /** Rule ids expected, in any order, without the `light-fp/` prefix. */
  readonly expect: readonly string[];
};

const run = (source: string, filename: string): readonly string[] =>
  Deno.lint
    .runPlugin(plugin, filename, source)
    .map((d) => d.id.replace(/^light-fp\//, ""));

/**
 * Runs a table of cases for one rule. Diagnostics from other rules are ignored,
 * so each table stays about its own rule, but the count within the rule is
 * asserted exactly: a case that fires twice is as wrong as one that never fires.
 */
export const check = (rule: string, cases: readonly Case[]) => {
  if (!RULE_IDS.includes(rule)) {
    throw new Error(
      `Unknown light-fp rule id "${rule}". Known rule ids: ${
        RULE_IDS.join(", ")
      }`,
    );
  }

  for (const testCase of cases) {
    const mismatched = testCase.expect.find((id) => id !== rule);
    if (mismatched) {
      throw new Error(
        `Case "${testCase.name}" belongs to light-fp/${rule} but expects light-fp/${mismatched}`,
      );
    }
  }

  for (const testCase of cases) {
    Deno.test(`${rule}: ${testCase.name}`, () => {
      const filename = testCase.filename ?? DOMAIN;
      const actual = run(testCase.source, filename).filter((id) => id === rule);
      if (actual.length === testCase.expect.length) return;
      throw new Error(
        `expected ${testCase.expect.length} light-fp/${rule} diagnostic(s), got ${actual.length}\n` +
          `file: ${filename}\n--- source ---\n${testCase.source}\n--- all diagnostics ---\n` +
          `${run(testCase.source, filename).join(", ") || "(none)"}`,
      );
    });
  }
};

/** Every diagnostic a file produces, for corpus-level assertions. */
export const diagnose = (
  source: string,
  filename: string,
): readonly Deno.lint.Diagnostic[] =>
  Deno.lint.runPlugin(plugin, filename, source);

export const fires = (rule: string, count = 1): readonly string[] =>
  Array(count).fill(rule);

export const silent: readonly string[] = [];

/** How many diagnostics from one rule a domain file with `source` produces. */
export const ruleCount = (rule: string, source: string): number =>
  diagnose(source, DOMAIN).filter((diagnostic) =>
    diagnostic.id === `light-fp/${rule}`
  ).length;

/** The result of type-checking `source` with `deno check`, without the project config. */
export const checkCompiler = async (
  source: string,
): Promise<{ readonly ok: boolean; readonly stderr: string }> => {
  const directory = await Deno.makeTempDir({ prefix: "light-fp-check-" });
  const path = `${directory}/fixture.ts`;
  try {
    await Deno.writeTextFile(path, source);
    const output = await new Deno.Command(Deno.execPath(), {
      args: ["check", "--cached-only", "--no-config", "--no-lock", path],
      stdout: "null",
      stderr: "piped",
    }).output();
    return {
      ok: output.success,
      stderr: new TextDecoder().decode(output.stderr),
    };
  } finally {
    await Deno.remove(directory, { recursive: true });
  }
};
