import { ADAPTER, check, fires, silent } from "./harness.ts";

check("module-forms", [
  {
    name: "a .js file",
    source: `export const a = 1;`,
    filename: "/repo/src/domain/sample.js",
    expect: fires("module-forms"),
  },
  {
    name: "a .jsx file",
    source: `export const a = 1;`,
    filename: "/repo/src/domain/sample.jsx",
    expect: fires("module-forms"),
  },
  {
    name: "a .mjs file",
    source: `export const a = 1;`,
    filename: "/repo/src/domain/sample.mjs",
    expect: fires("module-forms"),
  },
  {
    name: "a .cjs file",
    source: `const a = 1;`,
    filename: "/repo/src/domain/sample.cjs",
    expect: fires("module-forms"),
  },
  {
    name: "a .js file with a query is still a .js file",
    source: `export const a = 1;`,
    filename: "/repo/src/domain/sample.js?v=1",
    expect: fires("module-forms"),
  },
  {
    name: "a .tsx file is fine",
    source: `export const a = 1;`,
    filename: "/repo/src/domain/sample.tsx",
    expect: silent,
  },
  {
    name: "a .mts file is fine",
    source: `export const a = 1;`,
    filename: "/repo/src/domain/sample.mts",
    expect: silent,
  },
  {
    name: "a .cts file is fine",
    source: `export const a = 1;`,
    filename: "/repo/src/domain/sample.cts",
    expect: silent,
  },
  {
    name: "default import",
    source: `import x from "./x.ts";`,
    expect: fires("module-forms"),
  },
  {
    name: "default type import",
    source: `import type X from "./x.ts";`,
    expect: fires("module-forms"),
  },
  {
    name: "default part of a mixed import",
    source: `import x, { y } from "./x.ts";`,
    expect: fires("module-forms"),
  },
  {
    name: "namespace import",
    source: `import * as x from "./x.ts";`,
    expect: fires("module-forms"),
  },
  {
    name: "named imports are fine",
    source: `import { a, type B } from "./x.ts";`,
    expect: silent,
  },
  {
    name: "side-effect import of a package",
    source: `import "npm:polyfill";`,
    expect: fires("module-forms"),
  },
  {
    name: "empty named import of a package",
    source: `import {} from "npm:polyfill";`,
    expect: fires("module-forms"),
  },
  {
    name: "relative side-effect import belongs to layer-boundary",
    source: `import "./register.ts";`,
    expect: silent,
  },
  {
    name: "re-export of names",
    source: `export { x } from "./x.ts";`,
    expect: fires("module-forms"),
  },
  {
    name: "re-export of a type",
    source: `export type { X } from "./x.ts";`,
    expect: fires("module-forms"),
  },
  {
    name: "export all",
    source: `export * from "./x.ts";`,
    expect: fires("module-forms"),
  },
  {
    name: "export all as a namespace",
    source: `export * as ns from "./x.ts";`,
    expect: fires("module-forms"),
  },
  {
    name: "export of an imported name",
    source: `import { x } from "./x.ts";\nexport { x };`,
    expect: fires("module-forms"),
  },
  {
    name: "export of an imported type",
    source: `import type { X } from "./x.ts";\nexport type { X };`,
    expect: fires("module-forms"),
  },
  {
    name: "each imported name in one export list is reported",
    source: `import { a, b } from "./x.ts";\nexport { a, b };`,
    expect: fires("module-forms", 2),
  },
  {
    name: "export of a local declaration by name is fine",
    source: `const x = 1;\nexport { x };`,
    expect: silent,
  },
  {
    name: "export default of an expression",
    source: `export default 1;`,
    expect: fires("module-forms"),
  },
  {
    name: "export default of a function",
    source: `export default function f(): number {\n  return 1;\n}`,
    expect: fires("module-forms"),
  },
  {
    name: "export default of a class",
    source: `export default class {}`,
    expect: fires("module-forms"),
  },
  {
    name: "export of a local name as default",
    source: `const x = 1;\nexport { x as default };`,
    expect: fires("module-forms"),
  },
  {
    name: "named export declaration is fine",
    source: `export function f(): number {\n  return 1;\n}`,
    expect: silent,
  },
  {
    name: "dynamic import belongs to layer-boundary",
    source: `export const f = () => import("./x.ts");`,
    expect: silent,
  },
  {
    name: "adapter files are exempt",
    source: `import x from "./x.ts";\nexport default x;`,
    filename: ADAPTER,
    expect: silent,
  },
  {
    name: "prelude files are exempt",
    source: `// @light-fp prelude\nimport x from "./x.ts";\nexport default x;`,
    expect: silent,
  },
]);
