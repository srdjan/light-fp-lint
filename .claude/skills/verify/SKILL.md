---
name: verify
description: Verifies a light-fp-lint change before each commit. Runs the full gate, and installs the Codex plugin into an empty Codex home when plugin files changed.
---

# Verify a light-fp-lint change

1. Run `deno task ci`. It must exit 0.

2. When the change touches `.codex-plugin/`, `.agents/`, `hooks/`, or `skills/`,
   install the plugin into an empty Codex home and run its Stop hook from the
   installed copy. Run this block as one shell command from the repository root:

   ```sh
   CODEX_HOME="$(mktemp -d)"; export CODEX_HOME
   codex plugin marketplace add "$PWD"
   codex plugin add light-fp@light-fp-local
   codex plugin list | grep 'light-fp@light-fp-local  installed, enabled'
   root="$CODEX_HOME/plugins/cache/light-fp-local/light-fp/$(jq -r .version deno.json)"
   cmd=$(jq -r '.hooks.Stop[0].hooks[0].command' "$root/hooks/hooks.json")
   probe="$(mktemp -d)"; mkdir -p "$probe/src/domain"
   printf '{ "lint": { "plugins": ["%s/src/mod.ts"] } }\n' "$PWD" > "$probe/deno.json"
   printf 'export const now = Date.now();\n' > "$probe/src/domain/a.ts"
   printf '{"hook_event_name":"Stop","cwd":"%s","stop_hook_active":false}' "$probe" |
     PLUGIN_ROOT="$root" sh -c "$cmd"
   ```

   The hook must print a JSON object with `"decision":"block"`. The empty
   `CODEX_HOME` keeps `~/.codex` unchanged. Remove `$CODEX_HOME` and `$probe`
   afterward.

3. Report the result of each step. When a step fails, follow the failing-checks
   rule in CLAUDE.md.
