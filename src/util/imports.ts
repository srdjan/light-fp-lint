export const ensureImport = (context: Deno.lint.RuleContext, name: string, from: string) => {
  const src = context.sourceCode.text;
  const re = new RegExp(`(^|\n)\s*import\s*\{[^}]*\b${name}\b[^}]*\}\s*from\s*["']${from}["']\s*;?`);
  if (re.test(src)) return null;
  return { range: [0, 0], text: `import { ${name} } from "${from}";\n` };
};
