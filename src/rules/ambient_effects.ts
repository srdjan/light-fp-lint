// @light-fp adapter -- a lint rule adapts Deno's visitor API: it reports through a
// void callback and is driven by mutation it does not own.
import { isDomain } from "../layer.ts";

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

const propertyName = (node: Deno.lint.MemberExpression): string | undefined => {
  if (node.computed) return undefined;
  return node.property.type === "Identifier" ? node.property.name : undefined;
};

export const noAmbientEffects: Deno.lint.Rule = {
  create(context) {
    if (!isDomain(context.filename, context.sourceCode)) return {};

    const report = (node: Deno.lint.Node, what: string, capability: string) => {
      context.report({
        node,
        message:
          `${what} is an ambient effect and does not belong in domain code.`,
        hint: `Take ${capability} as a parameter and call it through the port.`,
      });
    };

    return {
      MemberExpression(node) {
        const object = nameOf(node.object);
        if (!object) return;

        const ambient = AMBIENT_OBJECTS[object];
        if (ambient) {
          report(node, `\`${object}\``, ambient);
          return;
        }

        const members = AMBIENT_MEMBERS[object];
        if (!members) return;
        const property = propertyName(node);
        if (!property) return;
        const capability = members[property];
        if (capability) report(node, `\`${object}.${property}()\``, capability);
      },

      CallExpression(node) {
        const callee = nameOf(node.callee);
        if (!callee) return;
        const capability = AMBIENT_CALLS[callee];
        if (capability) report(node, `\`${callee}()\``, capability);
      },

      NewExpression(node) {
        const callee = nameOf(node.callee);
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
