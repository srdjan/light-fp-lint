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

import { headerComments } from "./comments.ts";

/**
 * The contract a file is held to. `domain` is the strict default; `adapter` is
 * where effects are allowed to live; `prelude` defines `Result` and the effect
 * brands, so it may throw and cast.
 */
export type Layer = "domain" | "adapter" | "prelude";

export const LAYERS: readonly Layer[] = ["domain", "adapter", "prelude"];

const PRAGMA = /^\s*@light-fp\s+(\S+)/;

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

export const toPosix = (filename: string): string =>
  filename.replaceAll("\\", "/");

// Read per call, not once at module load. The editor's language server outlives
// any single project, so a root captured at import time goes stale the moment it
// serves a second workspace, and every file then resolves against the wrong root.
// This is the same staleness that rules out reading configuration from disk.
const currentRoot = (): string | undefined => {
  // deno-lint-ignore light-fp/no-throw -- Root discovery must tolerate hosts that deny cwd access.
  try {
    // deno-lint-ignore light-fp/no-ambient-effects -- The workspace root is what anchors an absolute lint path.
    return toPosix(Deno.cwd());
  } catch {
    return undefined;
  }
};

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

const pathWithoutDecoration = (filename: string): string =>
  toPosix(filename).split(/[?#]/, 1)[0];

const lintableStem = (filename: string): string | undefined => {
  const dot = filename.lastIndexOf(".");
  if (dot === -1) return undefined;
  return LINTABLE_EXTENSIONS.includes(filename.slice(dot + 1))
    ? filename.slice(0, dot)
    : undefined;
};

/**
 * True when a path names adapter-owned code. This is the single authority used
 * both to classify files and to enforce imports into adapter paths.
 */
export const isAdapterPath = (
  filename: string,
  root: string | undefined,
): boolean => {
  const segments = pathWithinRoot(pathWithoutDecoration(filename), root)
    .split("/")
    .filter(Boolean);
  const basename = segments.at(-1) ?? "";
  const stem = lintableStem(basename) ??
    (basename.includes(".") ? "" : basename);
  return stem === "main" || ADAPTER_SEGMENTS.includes(stem) ||
    segments.slice(0, -1).some((segment) => ADAPTER_SEGMENTS.includes(segment));
};

// Split the name at its extension rather than precomputing every marker and
// extension pair. Two literal arrays and no work at import time.
export const isTestFile = (filename: string): boolean => {
  const posix = toPosix(filename);
  const stem = lintableStem(posix);
  if (!stem) return false;
  return TEST_MARKERS.some((marker) => stem.endsWith(marker));
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

  for (const comment of headerComments(sourceCode, limit)) {
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

  if (isAdapterPath(filename, currentRoot())) return "adapter";

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
