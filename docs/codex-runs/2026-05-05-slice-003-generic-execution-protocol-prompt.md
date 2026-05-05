---
codex_run_protocol: 1
slice_id: 2026-05-05-slice-003-generic-execution-protocol
status: approved
owner: chatgpt-planner
target_repo: HiroakiLion/Codex-Run-Ledger
target_branch: codex/2026-05-05-slice-003-generic-execution-protocol
result_file: docs/codex-runs/2026-05-05-slice-003-generic-execution-protocol-result.md
created_at: 2026-05-05T00:00:00+09:00
approved_at: 2026-05-05T08:58:00+09:00
---

# Codex Slice Prompt: Generic Execution Protocol

## Goal

Add generic execution protocol template support to ledger init and scaffold a repo-ready execution policy document for new repositories.

## Flow

1. Implement init behavior to create `docs/codex-runs/EXECUTION_PROTOCOL.md` during initialization.
2. Keep overwrite behavior consistent: do not overwrite existing protocol files unless `--force` is used.
3. Update docs so the protocol is discoverable and the repo-specific override path is documented.
4. Add/adjust tests for init creation and preservation.
5. Update changelog/version for a patch release.
6. Run project checks and summarize evidence in result/review files.

## Required Changes

- `scripts/codex-runs/init.mjs`:
  - Add generic execution protocol template creation and preservation behavior.
  - Keep existing `REVIEW_PROTOCOL.md` behavior unchanged.
  - Load `docs/codex-runs/EXECUTION_PROTOCOL.md` template and write it during init.
- `docs/codex-runs/EXECUTION_PROTOCOL.md`:
  - Add new generic execution protocol document with safe defaults.
  - Include default branch expectations, flow, artifact names, safety rules, and repo-specific override recommendation.
- `docs/codex-runs/README.md`, `docs/codex-runs/SMOKE_TEST_WORKFLOW.md`, `README.md`:
  - Reference the generated execution protocol and repo-specific override convention.
- `scripts/codex-runs/init.test.mjs`:
  - Cover default creation and preserve existing behavior for `EXECUTION_PROTOCOL.md`.
- `CHANGELOG.md`, `package.json`:
  - Version bump to next patch.
  - Add release notes for this scope.

## Constraints

- Do not broaden runtime execution behavior.
- No deploy/tag/release/publish.
- Do not modify unrelated code paths.

## Verification Commands

- `npm test`
- `node scripts/codex-runs/cli.mjs init --target-repo HiroakiLion/Codex-Run-Ledger`
- `node scripts/codex-runs/cli.mjs init --target-repo HiroakiLion/Codex-Run-Ledger --force`
- `git diff --check`
- `git status --short --branch`

## Risk Level

Low.

## Result File Instructions

Write:

- `docs/codex-runs/2026-05-05-slice-003-generic-execution-protocol-result.md`
- `docs/codex-runs/2026-05-05-slice-003-generic-execution-protocol-review.md`

Result and review packets should include what changed, checks run, verification outcomes, deviations, risks, and next slice suggestion.

## Commit / Push Instructions

- Commit with a focused message:
  - `feat: add generic execution protocol to ledger init`
- Push only if explicitly approved.

