---
codex_run_protocol: 1
slice_id: 2026-05-05-slice-004-prevent-review-self-approval
status: approved
owner: chatgpt-planner
target_repo: HiroakiLion/Codex-Run-Ledger
target_branch: codex/2026-05-05-slice-004-prevent-review-self-approval
result_file: docs/codex-runs/2026-05-05-slice-004-prevent-review-self-approval-result.md
created_at: 2026-05-05T10:00:00+09:00
approved_at: 2026-05-05T10:02:00+09:00
---

# Codex Slice Prompt: Prevent Review Packet Self-Approval

## Goal

Prevent Codex-generated review packets in `codex-run-ledger` from self-approving.

The review summary and docs guidance should clearly identify packets as handoff artifacts and
explicitly instruct that they cannot be treated as final approvals.

## Scope

- `scripts/codex-runs/review-summary-builder.mjs`
- `scripts/codex-runs/review-summary-builder.test.mjs`
- `scripts/codex-runs/prompt-template.mjs`
- `scripts/codex-runs/prompt-template.test.mjs`
- `docs/codex-runs/FIRST_PROMPT_TEMPLATE.md`
- `docs/codex-runs/README.md`
- `docs/codex-runs/REVIEW_PROTOCOL.md`
- `README.md`
- `CHANGELOG.md`
- `package.json` (version bump for slice)

## Out of Scope

- Runtime execution transport changes.
- Branch/commit/merge/push behavior.
- New automation or publish/release gating beyond this patch.

## Allowed Files / Areas

- `README.md`
- `CHANGELOG.md`
- `package.json`
- `scripts/codex-runs/`
- `docs/codex-runs/`

## Required Changes

1. Update review summary generation to avoid any generated signal that could be interpreted as self-approval.
2. Update templates and docs so generated review packets are explicitly handoff-only.
3. Update tests around review summary behavior and template output.
4. Bump package version for release-prep and add changelog entry.

## Acceptance Criteria

- `npm test` passes.
- `npm pack --dry-run` passes.
- Generated review packet status text and docs explicitly avoid self-approval semantics.
- README/docs mention review packets are handoff-only.

## Verification Commands

- `git diff --check`
- `npm test`
- `npm pack --dry-run`

## Deployment / Runtime Checks

None.

## Risk Level

Low.

## Review Requirement

Human review required before merge or release.
The generated review packet is a human-handoff artifact, not a final approval.
Do not self-approve this packet (avoid `review_status: approved` or `reviewer: chatgpt-self-review`).

## Result File Instructions

Write the paired result file:

`docs/codex-runs/2026-05-05-slice-004-prevent-review-self-approval-result.md`

Create and commit the paired review packet:

`docs/codex-runs/2026-05-05-slice-004-prevent-review-self-approval-review.md`

Do not overwrite an existing result file.
Do not overwrite an existing review packet file.

The result file must include a `Review Handoff` section with:

- Review protocol: `docs/codex-runs/REVIEW_PROTOCOL.md`
- Prompt file: `docs/codex-runs/2026-05-05-slice-004-prevent-review-self-approval-prompt.md`
- Result file: `docs/codex-runs/2026-05-05-slice-004-prevent-review-self-approval-result.md`
- Review packet: `docs/codex-runs/2026-05-05-slice-004-prevent-review-self-approval-review.md`
- Base ref used for review, if known
- Head ref or final commit SHA, if known
- Verification commands and outcomes
- Skipped checks, deviations, risks, unresolved issues

## Final Response Requirement

In the final chat response, include this one-line review handoff:

`Review handoff: run codex-run-ledger review --slice-id 2026-05-05-slice-004-prevent-review-self-approval --write-review-summary --markdown`
`Then run protocol checks using docs/codex-runs/REVIEW_PROTOCOL.md.`

Add: review packets are handoff artifacts, not approvals.
