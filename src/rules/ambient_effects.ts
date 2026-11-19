// @light-fp adapter -- a lint rule adapts Deno's visitor API: it reports through a
// void callback and is driven by mutation it does not own.
import { localBindings, memberName } from "../ast.ts";
import { layerOf } from "../layer.ts";

/** Ambient objects the domain must never reach. */
const AMBIENT_OBJECTS: Readonly<Record<string, string>> = {
  Deno: "a Runtime capability",
  process: "a Runtime capability",
  window: "a Browser capability",
  document: "a Dom capability",
  navigator: "a Browser capability",
  localStorage: "a Storage capability",
  sessionStorage: "a Storage capability",
  globalThis: "an explicit capability",
  console: "a Logger capability",
};

/** Free functions that are effects on their own. */
const AMBIENT_CALLS: Readonly<Record<string, string>> = {
  fetch: "an Http capability",
  alert: "a Prompt capability",
  confirm: "a Prompt capability",
  prompt: "a Prompt capability",
  setTimeout: "a Scheduler capability",
  setInterval: "a Scheduler capability",
  clearTimeout: "a Scheduler capability",
  clearInterval: "a Scheduler capability",
  queueMicrotask: "a Scheduler capability",
  requestAnimationFrame: "a Scheduler capability",
  addEventListener: "an Events capability",
  removeEventListener: "an Events capability",
};

/** `object.property` pairs that are effects. The rest of each object is fine. */
const AMBIENT_MEMBERS: Readonly<
  Record<string, Readonly<Record<string, string>>>
> = {
  Date: { now: "a Clock capability" },
  Math: { random: "a Random capability" },
  performance: { now: "a Clock capability" },
  crypto: {
    randomUUID: "a Random capability",
    getRandomValues: "a Random capability",
  },
};

/** Constructors that reach the outside world. */
const AMBIENT_CONSTRUCTORS: Readonly<Record<string, string>> = {
  WebSocket: "a Socket capability",
  Worker: "a Worker capability",
  XMLHttpRequest: "an Http capability",
  EventSource: "an Events capability",
  BroadcastChannel: "a Channel capability",
};

const nameOf = (node: Deno.lint.Node | null | undefined): string | undefined =>
  node && node.type === "Identifier" ? node.name : undefined;

const firstCapability = (
  capabilities: Readonly<Record<string, string>> | undefined,
): string | undefined => capabilities && Object.values(capabilities)[0];

const capabilityOf = (name: string): string | undefined =>
  AMBIENT_OBJECTS[name] ??
    AMBIENT_CALLS[name] ??
    firstCapability(AMBIENT_MEMBERS[name]) ??
    AMBIENT_CONSTRUCTORS[name];

/**
 * `light-fp/no-ambient-effects`: a domain file reaches no ambient effect
 * directly. Reports a closed set of unshadowed names - objects such as `Deno`,
 * `process`, and `console`, free functions such as `fetch` and the timers,
 * members such as `Date.now` and `Math.random`, and constructors such as
 * `new Date()` and `new WebSocket` - and names the capability to inject
 * instead.
 */
export const noAmbientEffects: Deno.lint.Rule = {
  create(context) {
    if (layerOf(context.filename, context.sourceCode) === "adapter") return {};

    const local = localBindings(context.sourceCode);

    const report = (node: Deno.lint.Node, what: string, capability: string) => {
      context.report({
        node,
        message:
          `${what} is an ambient effect and does not belong in domain code.`,
        hint: `Take ${capability} as a parameter and call it through the port.`,
      });
    };

    const unboundNameOf = (
      node: Deno.lint.Node | null | undefined,
    ): string | undefined => {
      const name = nameOf(node);
      return name && !local.has(name) ? name : undefined;
    };

    const isAliasPosition = (node: Deno.lint.Identifier): boolean => {
      const parent = context.sourceCode.getAncestors(node).at(-1);
      if (!parent) return false;
      if (parent.type === "VariableDeclarator") return parent.init === node;
      if (parent.type === "AssignmentExpression") return parent.right === node;
      if (parent.type === "ExportDefaultDeclaration") {
        return parent.declaration === node;
      }
      if (parent.type === "ExportSpecifier") {
        const declaration = context.sourceCode.getAncestors(parent).at(-1);
        if (
          declaration?.type === "ExportNamedDeclaration" &&
          declaration.source !== null
        ) return false;
        return parent.local === node;
      }
      return false;
    };

    return {
      MemberExpression(node) {
        const object = unboundNameOf(node.object);
        if (!object) return;

        const ambient = AMBIENT_OBJECTS[object];
        if (ambient) {
          report(node, `\`${object}\``, ambient);
          return;
        }

        const members = AMBIENT_MEMBERS[object];
        if (!members) return;
        const property = memberName(node);
        if (!property) return;
        const capability = members[property];
        if (capability) report(node, `\`${object}.${property}()\``, capability);
      },

      CallExpression(node) {
        const callee = unboundNameOf(node.callee);
        if (!callee) return;
        const capability = AMBIENT_CALLS[callee];
        if (capability) report(node, `\`${callee}()\``, capability);
      },

      Identifier(node) {
        if (local.has(node.name) || !isAliasPosition(node)) return;
        const capability = capabilityOf(node.name);
        if (capability) report(node, `\`${node.name}\``, capability);
      },

      NewExpression(node) {
        const callee = unboundNameOf(node.callee);
        if (!callee) return;

        // `new Date(ms)` is a pure conversion. `new Date()` reads the clock.
        if (callee === "Date") {
          if (node.arguments.length === 0) {
            report(node, "`new Date()`", "a Clock capability");
          }
          return;
        }

        const capability = AMBIENT_CONSTRUCTORS[callee];
        if (capability) report(node, `\`new ${callee}()\``, capability);
      },
    };
  },
};
