import { globToRegExp } from "https://deno.land/std@0.224.0/path/glob_to_regexp.ts";

export type GlobMatcher = (filename: string) => boolean;

export type LightFpRuleOptions = {
  readonly effectIdentifiers?: readonly string[];
  readonly allowedBrandFunctions?: readonly string[];
  readonly allowedBrandAssertionPaths?: readonly string[];
  readonly adapterGlobs?: readonly string[];
  readonly domainGlobs?: readonly string[];
  readonly ignoreGlobs?: readonly string[];
  readonly allowedThrowPaths?: readonly string[];
};

export const DEFAULT_OPTIONS: Required<LightFpRuleOptions> = {
  effectIdentifiers: ["IO", "Console", "FS", "Clock", "Env", "Throw", "State"],
  allowedBrandFunctions: [
    "brand",
    "brandWithCapability",
    "withCapability",
    "withIOCapability",
    "withConsoleCapability",
    "withClockCapability",
    "withEnvCapability",
    "map",
    "chain",
    "zip",
    "mapArray",
    "raise",
    "handleThrow",
  ],
  allowedBrandAssertionPaths: ["**/src/effect-brands.ts"],
  adapterGlobs: ["**/src/adapters/**/*.ts"],
  domainGlobs: ["**/src/**/*.ts", "**/tests/**/*.ts"],
  ignoreGlobs: ["**/tests/**/*.ts"],
  allowedThrowPaths: ["**/src/effect-brands.ts", "**/tests/**/*.ts"],
};

export const toPosix = (filename: string): string => filename.replaceAll("\\", "/");

export const compileMatcher = (globs: readonly string[]): GlobMatcher => {
  const regs = globs.map((g) => globToRegExp(g, { extended: true, globstar: true }));
  return (filename: string) => {
    const n = toPosix(filename);
    return regs.some((r) => r.test(n));
  };
};

export type NormalizedOptions = {
  effectNames: ReadonlySet<string>;
  allowedBrandFunctions: ReadonlySet<string>;
  allowedAssertionMatcher: GlobMatcher;
  adapterMatcher: GlobMatcher;
  domainMatcher: GlobMatcher;
  ignoreMatcher: GlobMatcher;
  allowedThrowMatcher: GlobMatcher;
};

export const normalizeOptions = (raw?: LightFpRuleOptions): NormalizedOptions => {
  const merged: Required<LightFpRuleOptions> = {
    effectIdentifiers: raw?.effectIdentifiers ?? DEFAULT_OPTIONS.effectIdentifiers,
    allowedBrandFunctions: raw?.allowedBrandFunctions ?? DEFAULT_OPTIONS.allowedBrandFunctions,
    allowedBrandAssertionPaths: raw?.allowedBrandAssertionPaths ?? DEFAULT_OPTIONS.allowedBrandAssertionPaths,
    adapterGlobs: raw?.adapterGlobs ?? DEFAULT_OPTIONS.adapterGlobs,
    domainGlobs: raw?.domainGlobs ?? DEFAULT_OPTIONS.domainGlobs,
    ignoreGlobs: raw?.ignoreGlobs ?? DEFAULT_OPTIONS.ignoreGlobs,
    allowedThrowPaths: raw?.allowedThrowPaths ?? DEFAULT_OPTIONS.allowedThrowPaths,
  };
  return {
    effectNames: new Set(merged.effectIdentifiers),
    allowedBrandFunctions: new Set(merged.allowedBrandFunctions),
    allowedAssertionMatcher: compileMatcher(merged.allowedBrandAssertionPaths),
    adapterMatcher: compileMatcher(merged.adapterGlobs),
    domainMatcher: compileMatcher(merged.domainGlobs),
    ignoreMatcher: compileMatcher(merged.ignoreGlobs),
    allowedThrowMatcher: compileMatcher(merged.allowedThrowPaths),
  };
};
