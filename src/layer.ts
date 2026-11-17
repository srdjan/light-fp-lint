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

/**
 * The contract a file is held to. `domain` is the strict default; `adapter` is
 * where effects are allowed to live; `prelude` defines `Result` and the effect
 * brands, so it may throw and cast.
 */
export type Layer = "domain" | "adapter" | "prelude";

/** A file path or an import specifier, as the linter receives it. */
export type FileName = string;

/** The yes-or-no answer to a question about a file name. */
export type Answer = boolean;

export const LAYERS: readonly Layer[] = ["domain", "adapter", "prelude"];

const PRAGMA_NAME = "@light-fp";

const ADAPTER_SEGMENTS: readonly string[] = [
  "adapters",
  "adapter",
  "infra",
  "scripts",
  "bin",
];

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

const TEST_MARKERS = ["_test", ".test", "_bench", ".bench"];

export function toPosix(filename: FileName): FileName {
  return filename.replaceAll("\\", "/");
}

/** True when an import specifier names a file by path, not by package. */
export function isRelativeSpecifier(specifier: FileName): Answer {
  return specifier.startsWith(".") || specifier.startsWith("/");
}

// Read per call, not once at module load. The editor's language server outlives
// any single project, so a root captured at import time goes stale the moment it
// serves a second workspace, and every file then resolves against the wrong root.
// This is the same staleness that rules out reading configuration from disk.
function currentRoot(): string | undefined {
  // deno-lint-ignore light-fp/no-throw -- Root discovery must tolerate hosts that deny cwd access.
  try {
    // deno-lint-ignore light-fp/no-ambient-effects light-fp/ambient-names -- The workspace root is what anchors an absolute lint path.
    return toPosix(Deno.cwd());
  } catch {
    return undefined;
  }
}

export function pathWithinRoot(
  filename: FileName,
  root: FileName | undefined,
): FileName {
  const posix = toPosix(filename);
  if (!root) return posix;

  const posixRoot = toPosix(root);
  const prefix = posixRoot.endsWith("/") ? posixRoot : `${posixRoot}/`;
  return posix.startsWith(prefix) ? posix.slice(prefix.length) : posix;
}

function pathWithoutDecoration(filename: string): string {
  return toPosix(filename).split("?")[0].split("#")[0];
}

function lintableStem(filename: string): string | undefined {
  const dot = filename.lastIndexOf(".");
  if (dot === -1) return undefined;
  return LINTABLE_EXTENSIONS.includes(filename.slice(dot + 1))
    ? filename.slice(0, dot)
    : undefined;
}

/**
 * True when a path names adapter-owned code. This is the single authority used
 * both to classify files and to enforce imports into adapter paths.
 */
export function isAdapterPath(
  filename: FileName,
  root: FileName | undefined,
): Answer {
  const segments = pathWithinRoot(pathWithoutDecoration(filename), root)
    .split("/")
    .filter(Boolean);
  const basename = segments.at(-1) ?? "";
  const stem = lintableStem(basename) ??
    (basename.includes(".") ? "" : basename);
  return stem === "main" || ADAPTER_SEGMENTS.includes(stem) ||
    segments.slice(0, -1).some((segment) => ADAPTER_SEGMENTS.includes(segment));
}

// Split the name at its extension rather than precomputing every marker and
// extension pair. Two literal arrays and no work at import time.
export function isTestFile(filename: FileName): Answer {
  const posix = toPosix(filename);
  const stem = lintableStem(posix);
  if (!stem) return false;
  return TEST_MARKERS.some((marker) => stem.endsWith(marker));
}

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

function isLayer(token: string): token is Layer {
  return LAYERS.some((layer) => layer === token);
}

// The token after `@light-fp`: leading whitespace, the name, whitespace, then
// the run of non-whitespace characters. `trim` strips what `\s` matches.
function pragmaToken(comment: string): string | undefined {
  const text = comment.trimStart();
  if (!text.startsWith(PRAGMA_NAME)) return undefined;
  const afterName = text.slice(PRAGMA_NAME.length);
  const afterGap = afterName.trimStart();
  if (afterGap.length === afterName.length || afterGap === "") return undefined;
  const characters = [...afterGap];
  const end = characters.findIndex((character) => character.trim() === "");
  return (end === -1 ? characters : characters.slice(0, end)).join("");
}

export function readPragma(sourceCode: Deno.lint.SourceCode): PragmaLookup {
  // A pragma only counts as a file header, so it has to precede any statement.
  const firstStatement = sourceCode.ast.body[0];
  const limit = firstStatement
    ? firstStatement.range[0]
    : Number.MAX_SAFE_INTEGER;

  for (const comment of sourceCode.getAllComments()) {
    if (comment.range[0] >= limit) break;
    const token = pragmaToken(comment.value);
    if (token === undefined) continue;
    return isLayer(token)
      ? { kind: "valid", layer: token, range: comment.range }
      : { kind: "invalid", token: token, range: comment.range };
  }
  return { kind: "none" };
}

/**
 * Resolve a file's layer. The default is `domain`, which is the strict layer, so
 * a file the conventions do not recognise fails closed. A gate that failed open
 * would disappear the moment someone renamed a directory, with no diagnostic.
 */
export function layerOf(
  filename: FileName,
  sourceCode: Deno.lint.SourceCode,
): Layer {
  const pragma = readPragma(sourceCode);
  if (pragma.kind === "valid") return pragma.layer;
  if (pragma.kind === "invalid") return "domain";

  if (isTestFile(filename)) return "adapter";

  if (isAdapterPath(filename, currentRoot())) return "adapter";

  return "domain";
}

/** True for files the strict domain rules apply to. */
export function isDomain(
  filename: FileName,
  sourceCode: Deno.lint.SourceCode,
): Answer {
  return layerOf(filename, sourceCode) === "domain";
}

/** The prelude defines Result and the effect brands, so it may throw and cast. */
export function isPrelude(
  filename: FileName,
  sourceCode: Deno.lint.SourceCode,
): Answer {
  return layerOf(filename, sourceCode) === "prelude";
}
