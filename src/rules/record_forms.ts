// @light-fp adapter -- a lint rule adapts Deno's visitor API: it reports through a
// void callback and is driven by mutation it does not own.
import { localBindings } from "../ast.ts";
import { isDomain } from "../layer.ts";

const OBJECT_MEMBERS: readonly string[] = ["assign", "freeze", "isFrozen"];

const memberName = (node: Deno.lint.MemberExpression): string | undefined => {
  if (!node.computed) {
    return node.property.type === "Identifier" ? node.property.name : undefined;
  }
  return node.property.type === "Literal" &&
      typeof node.property.value === "string"
    ? node.property.value
    : undefined;
};

/**
 * `light-fp/record-forms`: domain code builds each record literal from explicit
 * `key: value` fields and at most one leading spread. An object literal made
 * only of spreads is an ordered merge. The merge reads each operand and its
 * properties in source order, and a later overlapping field wins. It does not
 * guarantee disjoint fields. Each refused form hides a field name, mutates a
 * record in place, or mixes an explicit field with a late spread, so the field
 * order decides the result.
 */
export const recordForms: Deno.lint.Rule = {
  create(context) {
    if (!isDomain(context.filename, context.sourceCode)) return {};

    const local = localBindings(context.sourceCode.ast);

    return {
      Property(node) {
        if (node.parent.type !== "ObjectExpression") return;
        if (node.shorthand) {
          context.report({
            node,
            message: "A shorthand property hides its field name.",
            hint: "Write `{ value: value }`.",
          });
        } else if (node.method) {
          context.report({
            node,
            message: "A method property is not a plain data field.",
            hint:
              "Write a field that holds an arrow, such as `{ run: (x: T): R => ... }`.",
          });
        } else if (node.computed) {
          context.report({
            node,
            message: "A computed key makes the field name a runtime value.",
            hint:
              "Use a literal field name, or build the record with `Object.fromEntries`.",
          });
        } else if (
          node.key.type === "Literal" && typeof node.key.value === "number"
        ) {
          context.report({
            node,
            message: "A numeric key becomes a string key at run time.",
            hint: "Use a string key, or an array for dense indices.",
          });
        }
      },

      SpreadElement(node) {
        const parent = node.parent;
        if (parent.type !== "ObjectExpression") return;
        if (parent.properties[0] === node) return;
        // A literal made only of spreads is an ordered merge: later spreads
        // win by definition, with no explicit field to overwrite silently.
        // An object-literal operand is an explicit field in disguise.
        if (
          parent.properties.every((property) =>
            property.type === "SpreadElement" &&
            property.argument.type !== "ObjectExpression"
          )
        ) {
          return;
        }
        context.report({
          node,
          message:
            "A spread after another member lets field order decide the result.",
          hint: "Write one leading spread, such as `{ ...base, x: 1 }`.",
        });
      },

      MemberExpression(node) {
        if (node.object.type !== "Identifier") return;
        if (node.object.name !== "Object" || local.has("Object")) return;
        const member = memberName(node);
        if (member === undefined || !OBJECT_MEMBERS.includes(member)) return;
        context.report({
          node,
          message: `\`Object.${member}\` mutates or freezes a record in place.`,
          hint: "Use object spread, such as `{ ...base, key: value }`.",
        });
      },
    };
  },
};
