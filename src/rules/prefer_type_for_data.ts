// @light-fp adapter -- a lint rule adapts Deno's visitor API: it reports through a
// void callback and is driven by mutation it does not own.
import { isDomain } from "../layer.ts";

const isFunctionMember = (member: Deno.lint.Node): boolean => {
  if (
    member.type === "TSMethodSignature" ||
    member.type === "TSCallSignatureDeclaration"
  ) return true;
  if (member.type !== "TSPropertySignature") return false;
  return member.typeAnnotation?.typeAnnotation.type === "TSFunctionType";
};

/**
 * An interface whose members are all functions describes a capability port, which
 * is what interfaces are for here. One that carries data should be a type, so it
 * composes into unions and intersections.
 */
export const preferTypeForData: Deno.lint.Rule = {
  create(context) {
    if (!isDomain(context.filename, context.sourceCode)) return {};

    return {
      TSInterfaceDeclaration(node) {
        const members = node.body.body;
        if (members.length === 0) return;
        if (members.every(isFunctionMember)) return;

        // `extends` has no type-alias equivalent that preserves the same
        // declaration-merging behavior, so report it without offering a rewrite.
        const extendsClause = node.extends ?? [];
        if (extendsClause.length > 0) {
          context.report({
            node: node.id,
            message: "An interface holding data should be a type.",
            hint:
              "Replace `extends` with an intersection: `type A = B & { ... }`.",
          });
          return;
        }

        context.report({
          node: node.id,
          message: "An interface holding data should be a type.",
          hint:
            "Interfaces here describe capability ports; data is a `type` so it composes into unions.",
          fix: (fixer) => {
            const text = context.sourceCode.getText(node);
            const opening = text.indexOf("{");
            if (opening === -1) return [];
            // `interface Name<T> {` becomes `type Name<T> = {`, and the
            // declaration gains the trailing semicolon a type alias needs.
            const head = text.slice(0, opening).replace(
              /^interface\s+/,
              "type ",
            ).trimEnd();
            const body = text.slice(opening);
            return fixer.replaceText(node, `${head} = ${body};`);
          },
        });
      },
    };
  },
};
