// Effect discipline core rules (extracted and adapted)
import type { TSESTree } from "npm:@typescript-eslint/types@6.21.0";
import { normalizeOptions, toPosix } from "../util/options.ts";
import { expressionContainsEffectAssertion, getCalleeName, typeContainsEffectBrand, unwrapExpression } from "../util/ast.ts";

export const effectBrandOriginRule: Deno.lint.RuleModule = {
  meta: { docs: { description: "Ensure effect brands originate from authorized helpers.", recommended: true } },
  create(context) {
    const rawOptions = context.options?.[0];
    const options = normalizeOptions(rawOptions);
    const filename = toPosix(context.filename ?? "");
    const brandedIdentifiers = new Set<string>();

    const isIgnoredFile = options.ignoreMatcher(filename);
    if (isIgnoredFile) return {};

    const checkInitializer = (node: TSESTree.Expression | null | undefined): boolean => {
      if (!node) return false;
      const unwrapped = unwrapExpression(node);
      const allowedFns = options.allowedBrandFunctions;
      if (unwrapped.type === "CallExpression") {
        const name = getCalleeName(unwrapped);
        if (name && allowedFns.has(name)) return true;
      }
      if (unwrapped.type === "Identifier" && brandedIdentifiers.has(unwrapped.name)) return true;
      if (unwrapped.type === "ConditionalExpression") {
        return checkInitializer(unwrapped.consequent) && checkInitializer(unwrapped.alternate);
      }
      return false;
    };

    const ensureInitializer = (
      node: TSESTree.Expression | null | undefined,
      typeAnnotation: TSESTree.TypeNode | null | undefined,
      reportNode: TSESTree.Node,
    ) => {
      if (!typeContainsEffectBrand(typeAnnotation, options.effectNames)) return;
      if (checkInitializer(node)) return;
      context.report({
        node: reportNode,
        message: "Effect brands must originate from approved helpers (brand()/brandWithCapability()/withCapability()).",
      });
    };

    type FunctionLike =
      | TSESTree.FunctionDeclaration
      | TSESTree.FunctionExpression
      | TSESTree.ArrowFunctionExpression
      | TSESTree.MethodDefinition;

    type FunctionStackItem = { returnType: TSESTree.TypeNode | null | undefined; };
    const scopeStack: FunctionStackItem[] = [];

    const enterFunction = (fn: FunctionLike) => {
      const anyFn = fn as any;
      const returnType =
        "returnType" in anyFn && anyFn.returnType ? anyFn.returnType.typeAnnotation :
        fn.type === "MethodDefinition" && (fn.value as any).returnType ? (fn.value as any).returnType.typeAnnotation :
        null;
      scopeStack.push({ returnType });
      // An arrow with an expression body carries no ReturnStatement, so the
      // visitor below never sees it. Check the body as the returned value.
      if (fn.type === "ArrowFunctionExpression" && fn.body.type !== "BlockStatement") {
        ensureInitializer(fn.body as TSESTree.Expression, returnType, fn.body);
      }
    };
    const exitFunction = () => { scopeStack.pop(); };

    const registerBranded = (name?: string) => { if (name) brandedIdentifiers.add(name); };

    const visitor: Deno.lint.RuleListener = {
      VariableDeclarator(node) {
        if (node.id.type === "Identifier") {
          const name = node.id.name;
          const init = (node as any).init as TSESTree.Expression | null | undefined;
          if (init && checkInitializer(init)) registerBranded(name);
          else if (init?.type === "Identifier" && brandedIdentifiers.has(init.name)) registerBranded(name);
          const typeAnn = node.id.typeAnnotation?.typeAnnotation ?? null;
          ensureInitializer(init ?? null, typeAnn, node.id);
        }
      },
      AssignmentExpression(node) {
        if ((node as any).left.type === "Identifier") {
          if (checkInitializer((node as any).right)) registerBranded(((node as any).left).name);
        }
      },
      ReturnStatement(node) {
        if (!node.argument) return;
        const frame = scopeStack.at(-1);
        if (!frame) return;
        if (!typeContainsEffectBrand(frame.returnType, options.effectNames)) return;
        const arg = node.argument as TSESTree.Expression;
        if (checkInitializer(arg)) return;
        context.report({ node, message: "Return effect-branded values via brand helpers or capability grants instead of raw expressions." });
      },
    };

    return {
      ...visitor,
      FunctionDeclaration: enterFunction, "FunctionDeclaration:exit": exitFunction,
      FunctionExpression: enterFunction, "FunctionExpression:exit": exitFunction,
      ArrowFunctionExpression: enterFunction, "ArrowFunctionExpression:exit": exitFunction,
      MethodDefinition: enterFunction, "MethodDefinition:exit": exitFunction,
    };
  },
};

export const noDirectEffectAssertionRule: Deno.lint.RuleModule = {
  meta: { docs: { description: "Disallow direct type assertions that add effect brands.", recommended: true } },
  create(context) {
    const rawOptions = context.options?.[0];
    const options = normalizeOptions(rawOptions);
    const filename = toPosix(context.filename ?? "");

    if (options.allowedAssertionMatcher(filename)) return {};
    if (options.ignoreMatcher(filename)) return {};

    const reportForgedBrand = (node: TSESTree.TSAsExpression | TSESTree.TSTypeAssertion) => {
      if (!expressionContainsEffectAssertion(node, options.effectNames)) return;
      context.report({
        node,
        message: "Do not forge an effect brand with a type assertion.",
        hint: "Build the value with brand(), brandWithCapability(), or withCapability() so the effect has a traceable origin.",
      });
    };

    return {
      TSAsExpression: reportForgedBrand,
      TSTypeAssertion: reportForgedBrand,
    };
  },
};

export const resultTypeRule: Deno.lint.RuleModule = {
  meta: { docs: { description: "Enforce Result<E,A> usage for effectful errors and forbid raw throws in domain code.", recommended: true } },
  create(context) {
    const rawOptions = context.options?.[0];
    const options = normalizeOptions(rawOptions);
    const filename = toPosix(context.filename ?? "");
    if (!options.domainMatcher(filename) || options.adapterMatcher(filename)) return {};

    const isAllowedThrowFile = options.allowedThrowMatcher(filename);
    const stack: Array<{ node: any; hasThrow: boolean; returnType: any; }> = [];

    const enterFn = (fn: any) => {
      const rt = fn.returnType?.typeAnnotation ?? (fn.type === "MethodDefinition" ? fn.value.returnType?.typeAnnotation : null);
      stack.push({ node: fn, hasThrow: false, returnType: rt });
    };
    const exitFn = () => {
      const frame = stack.pop(); if (!frame || !frame.hasThrow) return;
      const isResultType = (tn: any): boolean => {
        if (!tn) return false;
        if (tn.type === "TSTypeReference") {
          const n = tn.typeName;
          if (n.type === "Identifier" && n.name === "Result") return true;
          if (n.type === "TSQualifiedName" && n.right.type === "Identifier" && n.right.name === "Result") return true;
        }
        if (tn.type === "TSIntersectionType" || tn.type === "TSUnionType") return tn.types.some(isResultType);
        return false;
      };
      if (isResultType(frame.returnType)) return;
      const target = "id" in frame.node && frame.node.id ? frame.node.id : frame.node;
      context.report({ node: target, message: "Functions that throw in domain code must return Result<E, A>. Replace throws with branded effects and handleThrow()." });
    };

    return {
      ThrowStatement(node) {
        if (isAllowedThrowFile) return;
        context.report({ node, message: "Do not throw in domain code. Return Result<E, A> via handleThrow() or propagate Throw-branded effects." });
        const frame = stack.at(-1); if (frame) frame.hasThrow = true;
      },
      CallExpression(node) {
        const name = (node as any).callee?.type === "Identifier" ? (node as any).callee.name :
          ((node as any).callee?.type === "MemberExpression" && !(node as any).callee.computed && (node as any).callee.property.type === "Identifier")
            ? (node as any).callee.property.name : undefined;
        if (name === "handleThrow" && (node as any).parent?.type === "ExpressionStatement") {
          context.report({ node, message: "handleThrow() returns Result<E, A>; capture or return the value instead of ignoring it." });
        }
      },
      FunctionDeclaration: enterFn, "FunctionDeclaration:exit": exitFn,
      FunctionExpression: enterFn, "FunctionExpression:exit": exitFn,
      ArrowFunctionExpression: enterFn, "ArrowFunctionExpression:exit": exitFn,
      MethodDefinition: enterFn, "MethodDefinition:exit": exitFn,
    };
  },
};

export const interfaceVsTypeRule: Deno.lint.RuleModule = {
  meta: { docs: { description: "Prefer `type` for data structures and `interface` for capabilities.", recommended: true }, fixable: "code" },
  create(context) {
    const rawOptions = context.options?.[0];
    const options = normalizeOptions(rawOptions);
    const filename = toPosix(context.filename ?? "");
    if (options.ignoreMatcher(filename)) return {};

    return {
      TSInterfaceDeclaration(node) {
        const body = node.body.body;
        const capability = body.every((m: any) => {
          if (m.type === "TSPropertySignature") {
            const t = m.typeAnnotation?.typeAnnotation;
            const isFn = t?.type === "TSFunctionType" ||
              (t?.type === "TSTypeReference" && t.typeName.type === "Identifier" && String(t.typeName.name).endsWith("Capability"));
            return Boolean(m.readonly) && isFn;
          }
          return m.type === "TSMethodSignature" || m.type === "TSCallSignatureDeclaration";
        });
        if (capability) return;
        const src = context.sourceCode.getText(node);
        context.report({
          node,
          message: "Use `type` for data structures. Interfaces should describe readonly capability ports.",
          fix(fixer) {
            const replaced = src.replace(/^interface/, "type") + ";";
            return fixer.replaceText(node as any, replaced);
          },
        });
      },
      TSTypeAliasDeclaration(node) {
        if (node.typeAnnotation.type !== "TSTypeLiteral") return;
        const allFunctions = node.typeAnnotation.members.length > 0 &&
          node.typeAnnotation.members.every((m: any) => {
            if (m.type !== "TSPropertySignature") return false;
            const t = m.typeAnnotation?.typeAnnotation;
            return Boolean(m.readonly) && t?.type === "TSFunctionType";
          });
        if (!allFunctions) return;
        const src = context.sourceCode.getText(node);
        context.report({
          node,
          message: "Capabilities should be declared with `interface` so they can be augmented.",
          fix(fixer) {
            const replaced = src.replace(/^type\s+/, "interface ").replace(/=\s*{/, "{").replace(/;?\s*$/, "");
            return fixer.replaceText(node as any, replaced);
          },
        });
      },
    };
  },
};

export const immutabilityRule: Deno.lint.RuleModule = {
  meta: { docs: { description: "Require readonly properties and arrays in type literals representing data.", recommended: true } },
  create(context) {
    const rawOptions = context.options?.[0];
    const options = normalizeOptions(rawOptions);
    const filename = toPosix(context.filename ?? "");
    if (options.ignoreMatcher(filename)) return {};

    return {
      TSTypeAliasDeclaration(node) {
        if (node.typeAnnotation.type !== "TSTypeLiteral") return;
        for (const member of node.typeAnnotation.members as any[]) {
          if (member.type !== "TSPropertySignature") continue;
          if (!member.readonly) {
            context.report({ node: member.key, message: "All data properties must be marked readonly." });
          }
          const typeAnn = member.typeAnnotation?.typeAnnotation;
          if (!typeAnn) continue;
          if (typeAnn.type === "TSArrayType") {
            context.report({ node: member.key, message: "Use readonly arrays (readonly T[] or ReadonlyArray<T>) in data types." });
          } else if (typeAnn.type === "TSTypeOperator" && typeAnn.operator === "readonly") {
            continue;
          } else if (typeAnn.type === "TSTypeReference" && typeAnn.typeName.type === "Identifier" && typeAnn.typeName.name === "ReadonlyArray") {
            continue;
          } else if (typeAnn.type === "TSTupleType") {
            // simplistic check; see util for richer version if needed
          }
        }
      },
    };
  },
};

export const noClassRule: Deno.lint.RuleModule = {
  meta: { docs: { description: "Disallow classes in domain code; prefer algebraic data types and functions.", recommended: true } },
  create(context) {
    const rawOptions = context.options?.[0];
    const { domainMatcher, adapterMatcher, allowedThrowMatcher } = normalizeOptions(rawOptions);
    const filename = toPosix(context.filename ?? "");
    if (!domainMatcher(filename) || adapterMatcher(filename)) return {};
    return {
      ClassDeclaration(node) {
        if (allowedThrowMatcher(filename)) return;
        context.report({ node, message: "Classes are not allowed in domain code. Use modules, closures, or capability tokens." });
      },
      ClassExpression(node) {
        context.report({ node, message: "Classes are not allowed in domain code. Use modules, closures, or capability tokens." });
      },
    };
  },
};
