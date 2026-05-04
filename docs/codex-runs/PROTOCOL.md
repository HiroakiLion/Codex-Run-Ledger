Version: 0.1
Status: Draft Protocol

# Codex Run Ledger Protocol

## Purpose

Codex Run Ledger is a Git-backed protocol for controlled Codex execution. It coordinates four responsibilities:

- Planner: creates an approved prompt file after human approval.
- Operator: selects which runnable prompt, if any, should be attempted.
- Worker: follows one prompt and writes the paired result file.
- Reviewer: reviews the result, diff, verification evidence, and next action.

The protocol is append-friendly and audit-oriented. Prompts and results should not be overwritten to retry work; create a new slice instead.

## File Naming

Prompt and result files use flat names under the configured `promptDir`, defaulting to `docs/codex-runs/`:

```text
YYYY-MM-DD-slice-NNN-short-name-prompt.md
YYYY-MM-DD-slice-NNN-short-name-result.md
```

Rules:

- `YYYY-MM-DD` is the approval date.
- `NNN` is zero-padded.
- `short-name` uses lowercase kebab-case.
- `slice_id` equals the filename base without `-prompt.md` or `-result.md`.
- The paired result path is derived by replacing `-prompt.md` with `-result.md`.
- Example files must never be executable, regardless of frontmatter status.

## Prompt Frontmatter

```yaml
---
codex_run_protocol: 1
slice_id: YYYY-MM-DD-slice-NNN-short-name
status: draft | approved | canceled
owner: chatgpt-planner
target_repo: HiroakiLion/Codex-Run-Ledger
target_branch: workbench
result_file: docs/codex-runs/YYYY-MM-DD-slice-NNN-short-name-result.md
created_at: ISO-8601 timestamp
approved_at: ISO-8601 timestamp or null
---
```

Rules:

- Codex may only run prompts with `status: approved`.
- `approved_at` must be non-null when status is `approved`.
- `approved_at` must be `null` when status is `draft` or `canceled`.
- `target_repo` must be present and can be pinned with `targetRepo` in config. Prefer a repository identifier such as `owner/repo`, not the npm package name.
- `target_branch` must match configured branch policy.
- `main` and `master` are forbidden by default.
- `result_file` must equal the paired result path.

## Prompt Body

Every prompt should include:

```markdown
# Codex Slice Prompt: <slice_id>

## Objective

## Scope

## Out of Scope

## Allowed Files / Areas

## Required Changes

## Acceptance Criteria

## Verification Commands

## Deployment / Runtime Checks

## Risk Level

## Review Requirement

## Result File Instructions

## Commit / Push Instructions
```

See `FIRST_PROMPT_TEMPLATE.md` for a copy/paste starter file.

## Result Frontmatter

```yaml
---
codex_run_protocol: 1
slice_id: YYYY-MM-DD-slice-NNN-short-name
status: completed | failed | blocked
owner: codex-worker
source_prompt: docs/codex-runs/YYYY-MM-DD-slice-NNN-short-name-prompt.md
branch: workbench
commit_sha: null-or-sha
started_at: ISO-8601 timestamp
completed_at: ISO-8601 timestamp
---
```

## Result Body

Every result should include:

```markdown
# Codex Slice Result: <slice_id>

## Summary

## Files Changed

## Commands Run

## Verification Results

## Deployment / Runtime Results

## Deviations From Prompt

## Known Issues / Risks

## Suggested Next Slice

## Commit / Branch Info
```

## Review Packet

After a result, attempt artifact, or verification artifact exists, reviewers can build a review packet with:

```sh
npx codex-run-ledger review --slice-id <slice_id> --markdown
```

The packet should make these items easy to scan:

- prompt status and result status;
- prompt, result, verification, and attempt artifact paths;
- changed files;
- commands run;
- verification evidence;
- known issues or risks;
- recommended next action.

The review packet is not a new approval step by itself. It is the evidence bundle used by ChatGPT or a human reviewer before deciding whether to retry, stop, or plan the next slice.

## Execution Rules

- Do not run draft, canceled, malformed, or example prompts.
- Do not run a prompt if its paired result already exists.
- Do not overwrite result, verification, attempt, or review artifacts.
- Do not run multiple prompts by accident; use `--slice-id` for explicit selection.
- Do not create the next official prompt as part of a worker run.
- If work cannot complete, write or require a `failed` or `blocked` result where possible.
- If changes exceed the prompt scope, document the deviation.
- Verification evidence supports review; it is not automatic approval.

## Config

Default config shape:

```json
{
  "protocolVersion": 1,
  "promptDir": "docs/codex-runs",
  "targetRepo": "HiroakiLion/Codex-Run-Ledger",
  "stableTargetBranches": ["workbench"],
  "sliceBranchPrefix": "codex/",
  "forbiddenTargetBranches": ["main", "master"],
  "docsOnlyAllowedRoots": ["docs/codex-runs/"]
}
```

If `targetRepo` is omitted, prompt files still require a non-empty `target_repo`, but it is not pinned to one value.
