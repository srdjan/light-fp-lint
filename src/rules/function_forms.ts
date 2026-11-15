// @light-fp adapter -- a lint rule adapts Deno's visitor API: it reports through a
// void callback and is driven by mutation it does not own.
import { isDomain } from "../layer.ts";

type ParameterOwner =
  | Deno.lint.FunctionDeclaration
  | Deno.lint.FunctionExpression
  | Deno.lint.ArrowFunctionExpression
  | Deno.lint.TSDeclareFunction
  | Deno.lint.TSFunctionType
  | Deno.lint.TSMethodSignature
  | Deno.lint.TSCallSignatureDeclaration
  | Deno.lint.TSConstructSignatureDeclaration;

function isAnnotated(param: Deno.lint.Parameter): boolean {
  switch (param.type) {
    case "AssignmentPattern":
      return param.left.typeAnnotation !== undefined;
    case "TSParameterProperty":
      return true;
    default:
      return param.typeAnnotation !== undefined;
  }
}

/**
 * `light-fp/function-forms`: domain code declares each function with a name and
 * a full signature. Each call states its arguments one by one. A function
 * expression, a generator, a default, optional, or rest parameter, and a
 * call-site spread each hide part of a function's contract from its reader.
 */
export const functionForms: Deno.lint.Rule = {
  create(context) {
    if (!isDomain(context.filename, context.sourceCode)) return {};

    const reportParams = (node: ParameterOwner): void => {
      for (const param of node.params) {
        if (param.type === "AssignmentPattern") {
          context.report({
            node: param,
            message: "A default parameter hides a branch in the signature.",
            hint:
              "Accept `name: T | undefined` and resolve it in the body, for example `const resolved = name ?? fallback;`.",
          });
        } else if (param.type === "Identifier" && param.optional) {
          context.report({
            node: param,
            message: "An optional parameter lets a caller omit an argument.",
            hint: "Write `name: T | undefined`.",
          });
        } else if (param.type === "RestElement") {
          context.report({
            node: param,
            message:
              "A rest parameter collects an unknown number of arguments.",
            hint: "Accept an explicit array parameter.",
          });
        }
      }
    };

    const reportGenerator = (
      node: Deno.lint.FunctionDeclaration | Deno.lint.FunctionExpression,
    ): void => {
      context.report({
        node,
        message: "A generator keeps state between calls.",
        hint: "Return an array.",
      });
    };

    return {
      FunctionDeclaration(node) {
        reportParams(node);
        if (node.generator) reportGenerator(node);
        if (node.returnType === undefined || !node.params.every(isAnnotated)) {
          context.report({
            node,
            message:
              "A function declaration lacks a type on a parameter or on its return value.",
            hint: "Annotate each parameter and the return type.",
          });
        }
      },

      FunctionExpression(node) {
        reportParams(node);
        if (node.generator) {
          reportGenerator(node);
          return;
        }
        const parent = node.parent;
        if (parent.type === "VariableDeclarator") return;
        if (parent.type === "MethodDefinition") return;
        if (
          parent.type === "Property" &&
          (parent.method || parent.kind !== "init")
        ) {
          return;
        }
        context.report({
          node,
          message:
            "A function expression hides the function from a reader who scans for declarations.",
          hint:
            "Write a function declaration, or pass an arrow directly as a callback argument.",
        });
      },

      ArrowFunctionExpression: reportParams,
      TSDeclareFunction: reportParams,
      TSFunctionType: reportParams,
      TSMethodSignature: reportParams,
      TSCallSignatureDeclaration: reportParams,
      TSConstructSignatureDeclaration: reportParams,

      SpreadElement(node) {
        if (
          node.parent.type !== "CallExpression" &&
          node.parent.type !== "NewExpression"
        ) {
          return;
        }
        context.report({
          node,
          message: "A call-site spread passes an unknown number of arguments.",
          hint: "Pass positional arguments.",
        });
      },
    };
  },
};
