# light-fp-lint: all-spread ordered-merge allowance — owner handoff

STATUS: DONE. The three accepted postimages landed as commit `908b151`
(`fix(rules): allow all-spread ordered merges`). Nothing remains to apply or
commit. The sections below record the state at handoff.

FINAL ACCEPTED by lint-policy (m_2265).

## state at handoff

- Parameter unit: LANDED as commit `0de414ce08c59fb9eff28b5842a30c0fc820f515`
  (message "handoff"); its four postimages are committed and are NOT part of
  this commit.
- Current HEAD: `0de414ce08c59fb9eff28b5842a30c0fc820f515` (main), with only the
  three files below modified and the two untracked handoff files present.

## three paths, pre/post hashes

| path                       | preimage (base)                                                  | accepted postimage                                               |
| -------------------------- | ---------------------------------------------------------------- | ---------------------------------------------------------------- |
| src/rules/record_forms.ts  | 59eb06d5ecbd08af7fe2161877c37dd78d9225c9775f5dd08eaaf16471f76df6 | bb4f1137d1f6626a31eafd38efc8ba59466eb654f2acbf420c59023190af94d2 |
| tests/record_forms_test.ts | 130e93de11a51032f97f7e69a687a23b8318e5cec9477951bf95481c8ca61e53 | a708f7a0011bfdd2e2c538ade3d2d499f78020d279666f6e5202e6f7998bd672 |
| README.md                  | 51a1f81be6915672d698778f956cc8f05bb448c6d3f33ee1c32907056ba13126 | 7f81ca89118ae023c82a5a86878d7ce3f0a9b3f22ad55ad392f845d66cc65af4 |

## patch

SHA-256 `6fc38328891c8027aa3d6bee55e7b5e2ac8d81fa9281bfff25a9e5e964cc9ddb` (273
lines). Already applied via normal file edits; kept for reference/recovery only
— do NOT re-apply.

## normal-hook local commit command (done)

From the sibling checkout, stage ONLY the three files (exclude the untracked
handoff files and every unrelated file), then commit so the normal pre-commit
hook runs:

    git add src/rules/record_forms.ts tests/record_forms_test.ts README.md
    git commit -m 'fix(rules): allow all-spread ordered merges'

## receipts

Live: fmt --check rc 0 (98 files); deno check --cached-only src tests tools rc
0; deno lint rc 0 (64 files); targeted tests/record_forms_test.ts = 54 passed /
0 failed. Full suite 964/0 reused from the identical scratch snapshot (source
logic unchanged); not a fresh full-hook rerun.

## limits

No push, publication, version bump, pin/activation, or merge. Stage only the
three files above.
