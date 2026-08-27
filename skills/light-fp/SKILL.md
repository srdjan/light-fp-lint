---
name: light-fp
description: Provides Light FP architecture and validation workflow guidance when editing or reviewing a Deno repository whose deno.json configures @srdjan/light-fp-lint. Do not use for repositories that do not configure this plugin.
---

# Light FP workflow

1. Inspect the repository's Deno configuration and each file's Light FP layer
   before editing.
2. Keep domain functions pure, with explicit inputs and outputs.
3. Put effects at adapter edges and inject the required capabilities.
4. Prefer readonly tagged unions and handle every variant exhaustively.
5. Validate external input at system boundaries.
6. Run `deno lint` on the work, then run the repository's standard check.

Treat the installed linter as the rule authority. Fix diagnostics in the design.
Do not relabel domain code as an adapter or add a suppression unless there is a
specific written reason for that boundary decision.
