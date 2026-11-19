// @light-fp adapter -- a lint rule adapts Deno's visitor API: it reports through a
// void callback and is driven by mutation it does not own.
import { localBindings, memberName } from "../ast.ts";
import { isDomain } from "../layer.ts";

/** The only global names that domain code may read without a binding. */
const ALLOWED_NAMES: readonly string[] = [
  "Array",
  "Boolean",
  "Date",
  "JSON",
  "Math",
  "Number",
  "Object",
  "String",
  "parseFloat",
  "parseInt",
  "undefined",
  "NaN",
  "Infinity",
  "Promise",
];

/**
 * Whether the identifier reads or writes a value. Declared names are in the
 * file's local bindings and need no check here. This function excludes the
 * other names that are not value references: member properties, keys, labels,
 * import and export names, meta properties, and every name inside a type.
 */
const isValueReference = (node: Deno.lint.Identifier): boolean => {
  const parent = node.parent;
  switch (parent.type) {
    case "MemberExpression":
      return parent.object === node || parent.computed;
    case "Property":
    case "PropertyDefinition":
    case "MethodDefinition":
      return parent.key !== node || parent.computed;
    case "ImportSpecifier":
    case "ImportDefaultSpecifier":
    case "ImportNamespaceSpecifier":
      return false;
    case "ExportSpecifier": {
      const declaration = parent.parent;
      return parent.local === node &&
        declaration.type === "ExportNamedDeclaration" &&
        declaration.source === null;
    }
    case "LabeledStatement":
    case "BreakStatement":
    case "ContinueStatement":
    case "MetaProperty":
      return false;
    case "TSAsExpression":
    case "TSSatisfiesExpression":
    case "TSNonNullExpression":
    case "TSTypeAssertion":
    case "TSInstantiationExpression":
    case "TSExportAssignment":
      return parent.expression === node;
    case "TSEnumMember":
      return parent.initializer === node;
    default:
      return !parent.type.startsWith("TS");
  }
};

/**
 * `light-fp/ambient-names`: a domain file reads only a closed set of global
 * names, and reads `JSON.parse` through no global at all. Every other unbound
 * name is a capability that the file must import or receive as a parameter.
 * `JSON.parse` returns `any`, which erases the type of the parsed value.
 */
export const ambientNames: Deno.lint.Rule = {
  create(context) {
    if (!isDomain(context.filename, context.sourceCode)) return {};

    const local = localBindings(context.sourceCode.ast);

    return {
      Identifier(node) {
        if (ALLOWED_NAMES.includes(node.name) || local.has(node.name)) return;
        if (!isValueReference(node)) return;
        context.report({
          node,
          message:
            `\`${node.name}\` is outside the closed set of global names that domain code may read.`,
          hint: "Import it, or receive it as a parameter from a port.",
        });
      },

      MemberExpression(node) {
        if (node.object.type !== "Identifier") return;
        if (node.object.name !== "JSON" || local.has("JSON")) return;
        if (memberName(node) !== "parse") return;
        context.report({
          node,
          message:
            "`JSON.parse` returns `any`, which erases the type of the parsed value.",
          hint:
            "Parse JSON in an adapter, and pass a validated value to the domain.",
        });
      },
    };
  },
};
