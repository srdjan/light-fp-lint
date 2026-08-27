import type { TSESTree } from "npm:@typescript-eslint/types@6.21.0";

export const isIdentifier = (n: TSESTree.Node | null | undefined): n is TSESTree.Identifier =>
  !!n && n.type === "Identifier";

export const getIdentifierName = (node: TSESTree.Expression | TSESTree.PrivateIdentifier) => {
  if (node.type === "Identifier") return node.name;
  if (node.type === "MemberExpression" && !node.computed && node.property.type === "Identifier") {
    return node.property.name;
  }
  return undefined;
};

export const getCalleeName = (expr: TSESTree.CallExpression): string | undefined => {
  const callee = expr.callee;
  if (callee.type === "Identifier") return callee.name;
  if (callee.type === "MemberExpression" && !callee.computed && callee.property.type === "Identifier") {
    return callee.property.name;
  }
  return undefined;
};

export const unwrapExpression = (expr: TSESTree.Expression): TSESTree.Expression => {
  if (expr.type === "TSNonNullExpression" || expr.type === "ChainExpression") {
    return unwrapExpression(expr.expression);
  }
  if (expr.type === "AwaitExpression" && expr.argument) {
    return unwrapExpression(expr.argument);
  }
  return expr;
};

export const isReadonlyArrayType = (typeNode: TSESTree.TypeNode): boolean => {
  if (typeNode.type === "TSArrayType") return false;
  if (typeNode.type === "TSTypeReference") {
    if (typeNode.typeName.type === "Identifier" && typeNode.typeName.name === "ReadonlyArray") return true;
    return false;
  }
  if (typeNode.type === "TSTypeOperator" && typeNode.operator === "readonly") {
    const inner = typeNode.typeAnnotation;
    if (inner.type === "TSArrayType" || inner.type === "TSTupleType") return true;
  }
  if (typeNode.type === "TSTupleType") {
    return typeNode.elementTypes.every((element) =>
      element.type === "TSRestType"
        ? isReadonlyArrayType(element.typeAnnotation)
        : element.type !== "TSArrayType"
    );
  }
  return true;
};

// `Effect<"IO", A>` and `WithCapability<"Console", C, A>` carry the brand as their
// first type argument. Only that position counts: a container such as
// `Result<E, Effect<"IO", A>>` holds a plan, it is not itself a branded value.
const firstTypeArgumentIsBrand = (
  typeNode: TSESTree.TSTypeReference,
  effectNames: ReadonlySet<string>,
): boolean => {
  const first = (typeNode as { typeArguments?: { params?: readonly TSESTree.TypeNode[] } }).typeArguments?.params?.[0];
  if (!first || first.type !== "TSLiteralType") return false;
  const literal = first.literal;
  return literal.type === "Literal" && typeof literal.value === "string" && effectNames.has(literal.value);
};

export const typeContainsEffectBrand = (
  typeNode: TSESTree.TypeNode | null | undefined,
  effectNames: ReadonlySet<string>,
): boolean => {
  if (!typeNode) return false;
  switch (typeNode.type) {
    case "TSTypeReference": {
      const typeName = typeNode.typeName;
      if (typeName.type === "Identifier" && effectNames.has(typeName.name)) return true;
      if (typeName.type === "TSQualifiedName" && typeName.right.type === "Identifier" && effectNames.has(typeName.right.name)) return true;
      if (firstTypeArgumentIsBrand(typeNode, effectNames)) return true;
      break;
    }
    case "TSIntersectionType":
      return typeNode.types.some((inner) => typeContainsEffectBrand(inner, effectNames));
    case "TSParenthesizedType":
      return typeContainsEffectBrand(typeNode.typeAnnotation, effectNames);
    case "TSTypeOperator":
      return typeContainsEffectBrand(typeNode.typeAnnotation, effectNames);
  }
  return false;
};

export const expressionContainsEffectAssertion = (
  node: TSESTree.Node,
  effectNames: ReadonlySet<string>,
): node is TSESTree.TSAsExpression | TSESTree.TSTypeAssertion => {
  if (node.type === "TSAsExpression" || node.type === "TSTypeAssertion") {
    return typeContainsEffectBrand(node.typeAnnotation, effectNames);
  }
  return false;
};
