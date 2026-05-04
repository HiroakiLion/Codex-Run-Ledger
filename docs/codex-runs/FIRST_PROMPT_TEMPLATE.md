# First Prompt Template

Use this template when creating a first approved prompt file manually, or when asking Codex to create the file for you.

File path:

```text
docs/codex-runs/YYYY-MM-DD-slice-NNN-short-name-prompt.md
```

Replace every placeholder before setting `status: approved`.

```md
---
codex_run_protocol: 1
slice_id: YYYY-MM-DD-slice-NNN-short-name
status: draft
owner: chatgpt-planner
target_repo: owner/repo
target_branch: codex/YYYY-MM-DD-slice-NNN-short-name
result_file: docs/codex-runs/YYYY-MM-DD-slice-NNN-short-name-result.md
created_at: 2026-05-04T00:00:00+09:00
approved_at: null
---

# Codex Slice Prompt: YYYY-MM-DD-slice-NNN-short-name

## Objective

Describe the single bounded outcome Codex should complete.

## Scope

Describe what Codex may change.

## Out of Scope

- Anything unrelated to this slice.
- Deploys, tags, releases, and publishing unless explicitly approved.

## Allowed Files / Areas

- `README.md`
- `docs/codex-runs/`

## Required Changes

- List the specific changes Codex should make.

## Acceptance Criteria

- List the observable conditions that mean the slice is done.

## Verification Commands

- `npm.cmd test`
- `git diff --check`

## Deployment / Runtime Checks

None.

## Risk Level

Low.

## Review Requirement

Human review required before merge or release.

## Result File Instructions

Write the paired result file:

`docs/codex-runs/YYYY-MM-DD-slice-NNN-short-name-result.md`

Do not overwrite an existing result file.

## Commit / Push Instructions

Create focused subtask commits. Push only if explicitly approved.
```

Before running the slice, change:

```yaml
status: approved
approved_at: 2026-05-04T00:00:00+09:00
```

Then run:

```sh
npx codex-run-ledger detect
npx codex-run-ledger dry-run --slice-id YYYY-MM-DD-slice-NNN-short-name
npx codex-run-ledger executor --slice-id YYYY-MM-DD-slice-NNN-short-name --readiness-report
```

Future versions may add a `prompt:new` or `prompt:write` command to generate this structure. In this version, create the file manually or ask Codex to create it as an agent-assisted step.
