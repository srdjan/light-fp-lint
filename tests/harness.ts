// @light-fp adapter -- a test helper: it drives the Deno lint API and throws
// assertion failures, which is what a test harness is for.
import plugin from "../src/mod.ts";

export const DOMAIN = "/repo/src/domain/sample.ts";
export const ADAPTER = "/repo/src/adapters/sample.ts";

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
  for (const testCase of cases) {
    Deno.test(`${rule}: ${testCase.name}`, () => {
      const filename = testCase.filename ?? DOMAIN;
      const actual = run(testCase.source, filename).filter((id) => id === rule);
      const expected = testCase.expect.filter((id) => id === rule);
      if (actual.length === expected.length) return;
      throw new Error(
        `expected ${expected.length} light-fp/${rule} diagnostic(s), got ${actual.length}\n` +
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
