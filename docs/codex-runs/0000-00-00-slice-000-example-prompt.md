---
codex_run_protocol: 1
slice_id: 0000-00-00-slice-000-example
status: canceled
owner: chatgpt-planner
target_repo: example-repo
target_branch: codex/0000-00-00-slice-000-example
result_file: docs/codex-runs/0000-00-00-slice-000-example-result.md
created_at: 1970-01-01T00:00:00Z
approved_at: null
---

# Codex Slice Prompt: 0000-00-00-slice-000-example

EXAMPLE ONLY - DO NOT RUN.

This file demonstrates the required prompt format. It is canceled, uses fake scope, and must never be executed by Codex or automation.

For a copy/paste starter prompt, see `FIRST_PROMPT_TEMPLATE.md`. For an end-to-end install test, see `SMOKE_TEST_WORKFLOW.md`.

## Objective

Demonstrate the shape of a Codex slice prompt without requesting any real repository change.

## Scope

Example-only documentation shape under `docs/codex-runs/`.

## Out of Scope

- Application runtime code.
- GitHub Actions automation.
- Any real deployment.
- Any real branch, commit, or push.

## Allowed Files / Areas

Example-only files under `docs/codex-runs/`.

## Required Changes

No real changes. This example exists only to demonstrate prompt structure.

## Acceptance Criteria

- The file is clearly marked as example-only.
- The frontmatter status is `canceled`.
- The prompt contains every required section.

## Verification Commands

Example only:

```powershell
git diff --check
```

## Deployment / Runtime Checks

None. This example is not deployable and must not be run.

## Risk Level

Low if treated as documentation only. Invalid if executed.

## Review Requirement

Not required for this example because it is not runnable and does not change runtime behavior.

## Result File Instructions

If this were a real approved prompt, Codex would write:

`docs/codex-runs/0000-00-00-slice-000-example-result.md`

Because this is an example, Codex must not execute it. In real use, the paired result file consumes the prompt so it will not run again automatically.

The result file should include a `Review Handoff` section pointing to:

- Review protocol: `docs/codex-runs/REVIEW_PROTOCOL.md`
- Prompt file: `docs/codex-runs/0000-00-00-slice-000-example-prompt.md`
- Result file: `docs/codex-runs/0000-00-00-slice-000-example-result.md`
- Final diff, commits, verification evidence, skipped checks, deviations, and risks

## Final Response Requirement

In a real run, the final chat response should include:

`Review handoff: use docs/codex-runs/REVIEW_PROTOCOL.md with this slice's prompt, result file, final diff, commits, and verification evidence.`

## Commit / Push Instructions

Do not create a real branch, commit, or push from this example prompt.
