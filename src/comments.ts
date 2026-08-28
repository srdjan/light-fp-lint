// @light-fp adapter -- Deno 2.2 exposes source text in the CLI but not through
// runPlugin, so this boundary turns that host limitation into explicit data.
export type SourceComment = Readonly<{
  readonly value: string;
  readonly range: Deno.lint.Range;
}>;

import { childValuesOf } from "./ast.ts";

const BLOCKED_NODE_TYPES: readonly string[] = [
  "Literal",
  "TemplateLiteral",
  "TemplateElement",
  "JSXText",
];

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isRange = (value: unknown): value is Deno.lint.Range =>
  Array.isArray(value) && value.length === 2 &&
  value.every((offset) => Number.isInteger(offset));

const collectBlockedRanges = (
  ranges: Deno.lint.Range[],
  value: unknown,
): Deno.lint.Range[] => {
  if (Array.isArray(value)) {
    return value.reduce(collectBlockedRanges, ranges);
  }
  if (!isRecord(value)) return ranges;
  if (
    typeof value.type === "string" &&
    BLOCKED_NODE_TYPES.includes(value.type) && isRange(value.range)
  ) {
    ranges[ranges.length] = value.range;
    return ranges;
  }
  return childValuesOf(value).reduce(collectBlockedRanges, ranges);
};

type SourceText =
  | Readonly<{ _tag: "Available"; text: string }>
  | Readonly<{ _tag: "Unavailable" }>;

const sourceTextOf = (sourceCode: Deno.lint.SourceCode): SourceText => {
  try {
    return { _tag: "Available", text: sourceCode.text };
  } catch {
    return { _tag: "Unavailable" };
  }
};

const scanText = (
  text: string,
  blocked: readonly Deno.lint.Range[],
): readonly SourceComment[] => {
  const comments: SourceComment[] = [];
  let blockedIndex = 0;
  let index = 0;

  while (index < text.length) {
    const range = blocked[blockedIndex];
    if (range && index >= range[1]) {
      blockedIndex += 1;
      continue;
    }
    if (range && index >= range[0]) {
      index = range[1];
      blockedIndex += 1;
      continue;
    }

    const next = text[index + 1];
    if (text[index] === "/" && next === "/") {
      const start = index;
      index += 2;
      const valueStart = index;
      while (index < text.length && text[index] !== "\n") index += 1;
      comments[comments.length] = {
        value: text.slice(valueStart, index),
        range: [start, index],
      };
      continue;
    }
    if (text[index] === "/" && next === "*") {
      const start = index;
      index += 2;
      const valueStart = index;
      while (
        index < text.length &&
        !(text[index] === "*" && text[index + 1] === "/")
      ) index += 1;
      const valueEnd = index;
      index = Math.min(index + 2, text.length);
      comments[comments.length] = {
        value: text.slice(valueStart, valueEnd),
        range: [start, index],
      };
      continue;
    }
    index += 1;
  }

  return comments;
};

/** Comment token fallback for Deno 2.2, which predates getAllComments(). */
export const scanComments = (
  sourceCode: Deno.lint.SourceCode,
): readonly SourceComment[] => {
  const source = sourceTextOf(sourceCode);
  if (source._tag === "Unavailable") return [];
  return scanText(
    source.text,
    collectBlockedRanges([], sourceCode.ast).toSorted((left, right) =>
      left[0] - right[0]
    ),
  );
};

/** Header-only path for layer resolution, before any executable token starts. */
export const headerComments = (
  sourceCode: Deno.lint.SourceCode,
  limit: number,
): readonly SourceComment[] => {
  if (limit === 0) return [];
  const source = sourceTextOf(sourceCode);
  return source._tag === "Available"
    ? scanText(source.text.slice(0, limit), [])
    : [];
};

export const commentsOf = (
  sourceCode: Deno.lint.SourceCode,
): readonly SourceComment[] => {
  if (
    "getAllComments" in sourceCode &&
    typeof sourceCode.getAllComments === "function"
  ) return sourceCode.getAllComments();
  return scanComments(sourceCode);
};
