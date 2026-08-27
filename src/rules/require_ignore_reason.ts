// @light-fp adapter -- a lint rule adapts Deno's visitor API: it reports through a
// void callback and is driven by mutation it does not own.
const IGNORE_LINE = /^deno-lint-ignore\s+(.*)$/;
const IGNORE_FILE = /^deno-lint-ignore-file\s*(.*)$/;

const MIN_REASON = 10;

const namesLightFp = (rules: string): boolean =>
  /\blight-fp\/[a-z-]+/.test(rules);

/**
 * Split a suppression into the rules it names and the reason after `--`.
 * Rule names contain hyphens, so the split is on the `--` separator itself and
 * never on a single hyphen.
 */
const splitReason = (
  body: string,
): { readonly rules: string; readonly reason: string } => {
  const at = body.indexOf("--");
  if (at === -1) return { rules: body.trim(), reason: "" };
  return { rules: body.slice(0, at).trim(), reason: body.slice(at + 2).trim() };
};

/**
 * A strict gate survives only if its holes stay visible. Every light-fp
 * suppression carries a reason, and the file-wide off switch is not available at
 * all: a whole file leaves the gate through a layer pragma or through
 * `lint.exclude`, both of which one grep can enumerate.
 */
export const requireIgnoreReason: Deno.lint.Rule = {
  create(context) {
    return {
      Program() {
        for (const comment of context.sourceCode.getAllComments()) {
          const text = comment.value.trim();

          const fileMatch = IGNORE_FILE.exec(text);
          if (fileMatch) {
            const { rules } = splitReason(fileMatch[1]);
            if (rules.length > 0 && !namesLightFp(rules)) continue;
            context.report({
              range: comment.range,
              message:
                "A whole file cannot opt out of light-fp rules this way.",
              hint:
                "Declare the layer instead (`// @light-fp adapter`), or exclude the file in deno.json. Both are grep-able.",
            });
            continue;
          }

          const match = IGNORE_LINE.exec(text);
          if (!match) continue;
          const { rules, reason } = splitReason(match[1]);
          if (!namesLightFp(rules)) continue;

          if (/\brequire-ignore-reason\b/.test(rules)) {
            context.report({
              range: comment.range,
              message:
                "This rule exists to keep suppressions visible, so it cannot suppress itself.",
              hint: "Give the neighbouring suppression a reason instead.",
            });
            continue;
          }

          if (reason.length >= MIN_REASON) continue;
          context.report({
            range: comment.range,
            message: "A light-fp suppression needs a reason.",
            hint:
              "Write `-- why this is safe here`, so the next reader can judge whether it still is.",
          });
        }
      },
    };
  },
};
