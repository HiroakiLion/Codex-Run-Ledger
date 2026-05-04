---
codex_run_protocol: 1
slice_id: 2026-05-04-slice-002-prompt-new-and-0-2-0-polish
status: approved
owner: chatgpt-planner
target_repo: HiroakiLion/Codex-Run-Ledger
target_branch: codex/2026-05-04-slice-002-prompt-new-and-0-2-0-polish
result_file: docs/codex-runs/2026-05-04-slice-002-prompt-new-and-0-2-0-polish-result.md
created_at: 2026-05-04T10:00:00+09:00
approved_at: 2026-05-04T10:00:00+09:00
---

# Codex Slice Prompt: 2026-05-04-slice-002-prompt-new-and-0-2-0-polish

## Objective

Continue the first-use roadmap through the local 0.2.0 milestone by adding a safe prompt template command and polishing the supporting docs/review workflow.

Do not publish to npm. Do not create or push tags. Do not create a GitHub release. Do not deploy. Do not add executor Git mutation, production automation, schema-changing behavior, telemetry, hosted services, or broader real Codex execution.

## Scope

Implement a conservative `prompt:new` CLI command that helps users generate a valid Codex Run Ledger prompt file without executing anything.

The command should:

- create or print a starter `*-prompt.md` file;
- use the configured `promptDir`;
- use the configured `targetRepo` by default when available;
- default to `status: draft`;
- support explicitly approved prompts only when the user provides an approval timestamp;
- derive the paired `*-result.md` path;
- refuse to overwrite an existing prompt file;
- avoid Git, network, release, deploy, npm publish, and Codex execution behavior.

Also update docs and changelog to describe the command and the local 0.2.0 milestone shape.

## Subtask Commits

### Commit 1: Add Prompt New Command

Suggested commit message: `Add Prompt New Command`

Allowed files:

- `scripts/codex-runs/cli.mjs`
- `scripts/codex-runs/prompt-template.mjs`
- `scripts/codex-runs/prompt-template.test.mjs`
- `package.json`

Requirements:

- Add `codex-run-ledger prompt:new --slice-id <slice_id>` as a non-executing prompt-file helper.
- Support `--stdout` to print instead of writing.
- Support `--title`, `--target-repo`, `--target-branch`, `--owner`, `--status`, `--approved-at`, and `--config` if they fit existing patterns cleanly.
- Reject unsafe slice ids through existing normalization.
- Refuse overwrites.
- Add focused tests.

### Commit 2: Document Prompt New Workflow

Suggested commit message: `Document Prompt New Workflow`

Allowed files:

- `README.md`
- `docs/codex-runs/README.md`
- `docs/codex-runs/FIRST_PROMPT_TEMPLATE.md`
- `docs/codex-runs/SMOKE_TEST_WORKFLOW.md`
- `docs/codex-runs/CHATGPT_PROMPT_HELPERS.md`
- `CHANGELOG.md`

Requirements:

- Show exact PowerShell-friendly command examples.
- Clarify manual, `prompt:new`, and Codex-agent-assisted workflows.
- Explain that `prompt:new` creates prompt files only; it does not run Codex.
- Keep docs concise.

### Commit 3: Mark Local 0.2.0 Prep

Suggested commit message: `Prepare Local 0.2.0 Metadata`

Allowed files:

- `package.json`
- `CHANGELOG.md`
- `README.md`
- `docs/codex-runs/README.md`

Requirements:

- If appropriate, update local package metadata to `0.2.0` as unreleased local prep.
- Make it clear that publish, tag, GitHub release, and npm release still require explicit human approval.
- Do not create release automation.

## Safety

- Do not change prompt detection semantics.
- Do not change result consumption semantics.
- Do not broaden the executor.
- Do not add commit, push, merge, PR, tag, release, deploy, or npm publish behavior.
- Do not overwrite existing result files.
- Do not introduce hosted services, databases, telemetry, or external runtime services.
- Do not change package name, CLI aliases, repository URL, or license.

## Checks

Run before final report:

- `npm.cmd test`
- `npm.cmd pack --dry-run --cache .\.npm-cache`
- `git diff --check`
- `git status --short --branch`

Remove `.npm-cache` afterward if it is created.

## Push / Deploy / Tag

Push only if explicitly approved after verification passes.

No deploy. No tag. No GitHub release. No npm publish.

## Run Ledger Rules

- Do not overwrite an existing result file.
- Write the paired result file:
  `docs/codex-runs/2026-05-04-slice-002-prompt-new-and-0-2-0-polish-result.md`
- Result file must include summary, commits, files changed, commands run, verification, deviations, known issues, suggested next slice, and branch/commit info.

## Final Report

End with:

1. Summary of completed work.
2. Subtask commits created.
3. Files changed.
4. Verification commands and results.
5. Push status.
6. Confirmation that no deploy/tag/release/npm publish occurred.
7. Remaining risks or open decisions.
8. Recommended next parent slice.
