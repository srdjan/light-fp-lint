// Layer resolution.
//
// Deno lint plugins cannot receive options: `lint.plugins` accepts strings only,
// and RuleContext has no `options` field. Every decision a rule makes must come
// from the file itself. A file's layer therefore comes from its own name and its
// own first comment, which makes the choice per-file, versioned, and grep-able:
//
//   grep -rn "@light-fp adapter" src/
//
// lists every file that opted out of strictness. No glob configuration can.

export type Layer = "domain" | "adapter" | "prelude";

export const LAYERS: readonly Layer[] = ["domain", "adapter", "prelude"];

const PRAGMA = /^\s*@light-fp\s+(\S+)/;

const ADAPTER_SEGMENTS = new Set([
  "adapters",
  "adapter",
  "infra",
  "scripts",
  "bin",
]);

const ADAPTER_BASENAMES = new Set(["main.ts"]);

const LINTABLE_EXTENSIONS = [
  "ts",
  "tsx",
  "mts",
  "cts",
  "js",
  "jsx",
  "mjs",
  "cjs",
];

const TEST_SUFFIXES = ["_test", ".test", "_bench", ".bench"].flatMap(
  (marker) => LINTABLE_EXTENSIONS.map((extension) => `${marker}.${extension}`),
);

export const toPosix = (filename: string): string =>
  filename.replaceAll("\\", "/");

const currentRoot = (): string | undefined => {
  // deno-lint-ignore light-fp/no-throw -- Root discovery must tolerate hosts that deny cwd access.
  try {
    // deno-lint-ignore light-fp/no-ambient-effects -- Reading cwd once anchors absolute lint paths to the workspace.
    return toPosix(Deno.cwd());
  } catch {
    return undefined;
  }
};

const ROOT = currentRoot();

export const pathWithinRoot = (
  filename: string,
  root: string | undefined,
): string => {
  const posix = toPosix(filename);
  if (!root) return posix;

  const posixRoot = toPosix(root);
  const prefix = posixRoot.endsWith("/") ? posixRoot : `${posixRoot}/`;
  return posix.startsWith(prefix) ? posix.slice(prefix.length) : posix;
};

const segmentsOf = (filename: string): readonly string[] =>
  pathWithinRoot(filename, ROOT).split("/").filter(Boolean);

export const isTestFile = (filename: string): boolean => {
  const posix = toPosix(filename);
  return TEST_SUFFIXES.some((suffix) => posix.endsWith(suffix));
};

/** The pragma token found before the first statement, valid or not. */
export type PragmaLookup =
  | { readonly kind: "none" }
  | {
    readonly kind: "valid";
    readonly layer: Layer;
    readonly range: Deno.lint.Range;
  }
  | {
    readonly kind: "invalid";
    readonly token: string;
    readonly range: Deno.lint.Range;
  };

const isLayer = (token: string): token is Layer =>
  LAYERS.some((layer) => layer === token);

export const readPragma = (sourceCode: Deno.lint.SourceCode): PragmaLookup => {
  // A pragma only counts as a file header, so it has to precede any statement.
  const firstStatement = sourceCode.ast.body[0];
  const limit = firstStatement
    ? firstStatement.range[0]
    : Number.MAX_SAFE_INTEGER;

  for (const comment of sourceCode.getAllComments()) {
    if (comment.range[0] >= limit) break;
    const match = PRAGMA.exec(comment.value);
    if (!match) continue;
    const token = match[1];
    return isLayer(token)
      ? { kind: "valid", layer: token, range: comment.range }
      : { kind: "invalid", token, range: comment.range };
  }
  return { kind: "none" };
};

/**
 * Resolve a file's layer. The default is `domain`, which is the strict layer, so
 * a file the conventions do not recognise fails closed. A gate that failed open
 * would disappear the moment someone renamed a directory, with no diagnostic.
 */
export const layerOf = (
  filename: string,
  sourceCode: Deno.lint.SourceCode,
): Layer => {
  const pragma = readPragma(sourceCode);
  if (pragma.kind === "valid") return pragma.layer;
  if (pragma.kind === "invalid") return "domain";

  if (isTestFile(filename)) return "adapter";

  const segments = segmentsOf(filename);
  const basename = segments.at(-1) ?? "";
  if (ADAPTER_BASENAMES.has(basename)) return "adapter";
  if (segments.slice(0, -1).some((segment) => ADAPTER_SEGMENTS.has(segment))) {
    return "adapter";
  }

  return "domain";
};

/** True for files the strict domain rules apply to. */
export const isDomain = (
  filename: string,
  sourceCode: Deno.lint.SourceCode,
): boolean => layerOf(filename, sourceCode) === "domain";

/** The prelude defines Result and the effect brands, so it may throw and cast. */
export const isPrelude = (
  filename: string,
  sourceCode: Deno.lint.SourceCode,
): boolean => layerOf(filename, sourceCode) === "prelude";
