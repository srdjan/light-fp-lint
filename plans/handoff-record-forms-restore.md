# light-fp-lint: record-forms all-spread restoration — owner handoff

STATUS: DONE. The three accepted postimages landed as commit `671716f`
(`fix(rules): restore all-spread ordered merges`). Nothing remains to apply or
commit. The sections below record the state at handoff.

FINAL ACCEPTED by lint-policy (m_2432) on committed base
`9c4d7cfb2312928b47268e67f3a57bdb528bc6cb`.

## state at handoff

- HEAD: `9c4d7cfb2312928b47268e67f3a57bdb528bc6cb` (v0.10.0, clean, main).
- The three paths below are unchanged at their base preimages.

## three paths, pre/post hashes

| path                       | preimage (base)                                                  | accepted postimage                                               |
| -------------------------- | ---------------------------------------------------------------- | ---------------------------------------------------------------- |
| src/rules/record_forms.ts  | a1ef4378f6094a81bf58ea12bd74f482b0f3b8daa0cb382648ef85bd462b9477 | bb4f1137d1f6626a31eafd38efc8ba59466eb654f2acbf420c59023190af94d2 |
| tests/record_forms_test.ts | 5289202719e265bcf707ef4ef72293bc1bc9e6ad9b034f19cd39e366a1c44486 | 4dd1ff23b143dfb3f7b3a075f16193ac03ef0603da3b5ac40f03fdef45ca94cc |
| README.md                  | e6a624e0bdde1dfbd3f05d973dba0c1f18e31fa7dee5dbbc41cc482f181327f2 | 6faf3fbe6891fd6169dc0044e62ad92ed190de7e71b7fdce732ac446be99e804 |

## patch

- `plans/handoff-record-forms-restore.patch`, SHA-256
  `72308866f37fe01e86aa01caf0171f5c352ec563b9d5a36a46e41a0236280c2a`.
- Verified: forward-applies from the three preimages to exactly the three
  postimages, and `git apply --check` passes on the clean base.
- Already applied as commit `671716f`; kept for reference/recovery only — do NOT
  re-apply.

## apply + commit (shortest invocation) (done)

```sh
cd /Users/srdjans/Code/light-fp-lint
git apply plans/handoff-record-forms-restore.patch
git add src/rules/record_forms.ts tests/record_forms_test.ts README.md
git commit -m 'fix(rules): restore all-spread ordered merges'
```

The `.githooks/pre-commit` hook is enabled (`core.hooksPath=.githooks`) and runs
`deno task ci` on the staged snapshot: `fmt --check`, `check src tests tools`,
`lint`, `publish --dry-run --allow-dirty`, then the full test suite. It must
exit 0 for the commit to land; do not run `deno task ci` separately (the hook is
the gate, and a separate run would duplicate the full suite).

## reviewed test evidence (scratch run, not the commit hook)

- `deno test --cached-only -A tests/record_forms_test.ts`: 59 passed / 0 failed
  (rc 0), including the compiler TS2698/TS2322 and operand/getter order checks.
- `deno fmt --check`: 98 files, rc 0.
- `deno check --cached-only src tests tools`: rc 0.
- `deno lint`: 64 files, rc 0.
- `deno task ci` on this exact candidate is the remaining required gate; it is
  not yet evidenced here and must exit 0 via the hook. The historical 964/0
  count is not current-base CI evidence.

## limits

No push, publication, version bump, downloads, merge, or Metadoor
pin/activation. Stage only the three files above; leave this handoff file and
the patch untracked.
