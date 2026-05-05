# Codex Run Ledger Review Protocol

Use this protocol when reviewing a completed Codex implementation run.

Before review, inspect these artifacts in this order:

1. `docs/codex-runs/REVIEW_PROTOCOL.md` (this protocol)
2. The generated review packet: `docs/codex-runs/{{SLICE_ID}}-review.md`
3. The approved prompt: `docs/codex-runs/{{SLICE_ID}}-prompt.md`
4. The paired result: `docs/codex-runs/{{SLICE_ID}}-result.md`
5. `git diff {{BASE_REF}}...{{HEAD_REF}}` and equivalent commit evidence

The reviewer compares:

1. The approved slice prompt.
2. The paired Codex result file.
3. The generated review packet.
4. The final Git diff, changed files, and commits.
5. Any verification output included in the result or durable artifacts.
6. Any project-specific safety or scope rules defined by the prompt.

The generated review packet is required for every completed slice and should be committed together with prompt/result artifacts.

This is a review pass only. Do not implement fixes while performing the review.

## Review Goal

Classify the completed run as one of:

- `approved`
- `approved_with_notes`
- `needs_fix`
- `blocked`
- `unsafe_or_out_of_scope`

A run may be approved when minor polish remains, but it must not violate the approved prompt, safety boundaries, allowed scope, or acceptance criteria.

## Inputs

Review:

- Slice prompt: `{{PROMPT_FILE_PATH}}`
- Slice result: `{{RESULT_FILE_PATH}}`

Inspect these commands or equivalent output when available:

```text
git status --short --branch
git log --oneline --decorate -10
git show --stat --oneline HEAD
git diff {{BASE_REF}}...{{HEAD_REF}} --stat
git diff {{BASE_REF}}...{{HEAD_REF}}
```

Also inspect:

- files listed in the result file
- changed files not mentioned in the result file
- each commit separately, if this is a multi-commit slice
- relevant files referenced by the prompt, result, or diff

## Classification Rules

Use `approved` when the run satisfies the prompt, acceptance criteria, scope rules, and verification expectations.

Use `approved_with_notes` when the run is acceptable, but has minor non-blocking issues, documentation gaps, polish issues, or follow-up suggestions.

Use `needs_fix` when the run is close, but requires a bounded fix before approval. Examples include a missed acceptance criterion, incomplete result file, minor build or test issue, unclear documentation, incorrect allowed-file change, or skipped verification without a good reason.

Use `blocked` when the run cannot be judged or cannot proceed because required information is missing or repository state is unclear. Examples include missing prompt/result files, ambiguous base/head refs, an uninspectable diff, or required verification that cannot be performed and is not acceptably explained.

Use `unsafe_or_out_of_scope` when the run violates explicit prompt boundaries, adds prohibited behavior, modifies unrelated areas, invents unauthorized architecture, or creates risky side effects.

## Required Review Packet Checks

- Confirm `{{SLICE_ID}}-review.md` exists for the slice and is from this review scope.
- Confirm the review packet references the same `-prompt.md` and `-result.md`.
- Confirm this packet is a handoff artifact and does not self-approve.
- Flag disallowed self-approval markers such as `review_status: approved` or `reviewer: chatgpt-self-review`.
- Confirm prompt scope matches changed files.
- Confirm result claims and command/verification evidence match actual run output or durable artifacts.
- Confirm base branch, working branch, review base ref, and latest pushed commit are present and coherent.
- Confirm environment block is present (or explicitly reported unavailable) and reflects execution context.
- Confirm push status is honest (`not pushed`, `pushed`, or `blocked by policy`) with evidence.
- Confirm skipped checks and runtime smoke gaps are explicitly listed.

## Hard Review Rules

Classify as `needs_fix`, `blocked`, or `unsafe_or_out_of_scope` if any of these are true:

- the prompt file is missing
- the result file is missing
- the result file overwrote an existing result artifact
- the prompt status was not approved, if the prompt uses approval frontmatter
- the slice ID in the result does not match the prompt
- files were modified outside the approved scope without a clear acceptable reason
- required acceptance criteria were skipped
- verification is claimed as passed but evidence is missing, vague, or contradictory
- behavior explicitly listed as out of scope was introduced
- the next official prompt was created automatically, unless explicitly allowed
- the run pushed, deployed, tagged, released, or claimed runtime success without evidence
- the result file omits important deviations, failures, risks, or skipped checks
- implementation contradicts the prompt safety boundary
- the final diff includes unrelated cleanup, broad refactors, or opportunistic changes not requested by the prompt

## Prompt Contract Review

Extract the contract from the approved prompt:

- objective
- allowed files or allowed areas
- explicitly forbidden files or areas
- in-scope behavior
- out-of-scope behavior
- acceptance criteria
- required verification
- deployment, release, push, or tag rules
- expected result file location
- expected result file format
- project-specific safety boundaries
- required commit structure, if any

Judge the run against that contract. Do not invent new requirements, and do not ignore requirements clearly stated in the prompt.

## Scope Review

For each changed file, check:

1. Was this file allowed by the prompt?
2. Was the change necessary for the objective?
3. Is the change minimal and focused?
4. Does it preserve unrelated behavior?
5. Does it introduce hidden side effects?
6. Does the result file accurately mention this file?
7. Does it match the requested commit or subtask, if commit structure was specified?

Unexpected files are not automatically fatal, but they require a clear explanation and must be directly relevant.

## Safety Review

Use the safety and out-of-scope rules from the prompt as the source of truth.

Pay special attention to risky categories when relevant:

- authentication or authorization
- secrets or credentials
- payments or billing
- trading, financial, or account mutation
- database schema changes
- persistence or state mutation
- backend endpoints
- network calls
- external service calls
- file generation or deletion
- local command execution
- worker, job, queue, or pipeline triggers
- deployment, release, tagging, or publishing behavior
- LLM, agent, model, GPU, or automation invocation
- scraping, proxy, VPN, or rate-limit-sensitive behavior
- security policy changes
- permissions changes
- destructive actions
- user data handling
- production configuration changes

If the prompt explicitly allowed one of these, judge whether it stayed inside the approved boundary. If the prompt explicitly forbade one of these and it appears in the diff, classify as `unsafe_or_out_of_scope`.

## Ledger / Harness Review

Check that the result file includes the sections required by the prompt.

If the prompt does not define result sections, check for at least:

- Summary
- Files Changed
- Commands Run
- Verification Results
- Deviations From Prompt
- Known Issues / Risks
- Review Handoff
- Commit / Branch Info

Also check:

- result frontmatter is present if required
- slice ID matches the prompt
- source prompt path matches the prompt
- status is appropriate
- branch is correct
- commit SHA is present if the run completed and was committed
- timestamps are present if required
- result does not claim more than was done
- skipped checks are clearly explained
- deviations from the prompt are clearly explained

## Implementation Review

Review the diff for correctness.

Check:

- Does the implementation satisfy the objective?
- Does it meet every acceptance criterion?
- Is it appropriately simple?
- Does it avoid broad redesign?
- Does it avoid unrelated cleanup?
- Does it preserve existing behavior?
- Are names, types, copy, and comments accurate?
- Are errors handled appropriately?
- Are edge cases handled at a level appropriate for the slice?
- Are tests or verification adequate for the scope?
- Does documentation match actual behavior?
- Are there misleading claims in UI, docs, comments, or result files?

## Verification Review

Classify each verification item as one of:

- `passed_with_evidence`
- `claimed_but_no_evidence`
- `failed`
- `skipped_with_reason`
- `skipped_without_reason`
- `not_applicable`

Do not accept vague statements like "tests passed" unless the result includes command names and outcomes.

If verification could not be run, judge whether the explanation is acceptable. If deployment, runtime checks, tagging, or release steps were required, verify that the result contains concrete evidence.

## Commit Review

If the prompt requested one commit per subtask, verify that commit history follows the requested structure.

For each relevant commit, check:

- commit SHA
- commit message
- files changed
- whether the commit matches the requested subtask
- whether the commit contains unrelated changes
- whether later commits undo or contradict earlier commits
- whether the result file accurately reports the commit

If the prompt did not require commit structure, judge the final diff as a whole.

## Output Format

Write the review as Markdown. Do not output full file contents.

Use this structure:

```text
---
codex_review_protocol: 1
slice_id: {{SLICE_ID}}
review_status: approved | approved_with_notes | needs_fix | blocked | unsafe_or_out_of_scope
reviewer: {{REVIEWER_ID}}
reviewed_at: ISO-8601 timestamp
prompt_file: {{PROMPT_FILE_PATH}}
result_file: {{RESULT_FILE_PATH}}
base_ref: {{BASE_REF}}
head_ref: {{HEAD_REF}}
---

# Review: {{SLICE_ID}}

## Verdict

Approved | Approved with notes | Needs fix | Blocked | Unsafe or out of scope

Brief explanation.

## Prompt Contract Summary

- Objective:
- In scope:
- Out of scope:
- Allowed files / areas:
- Required verification:
- Required result artifact:
- Special safety boundaries:

## Scope Compliance

- Allowed files changed:
- Unexpected files changed:
- Missing expected files:
- Out-of-scope behavior found:
- Scope verdict:

## Acceptance Criteria Check

| Criterion | Status | Notes |
|---|---|---|
| Criterion from prompt | pass/fail/unclear/not_applicable | Evidence |

## Safety Boundary Check

| Boundary | Status | Notes |
|---|---|---|
| Boundary from prompt | pass/fail/unclear/not_applicable | Evidence |

## Result File Review

- Prompt/result pairing:
- Frontmatter:
- Required sections:
- Accuracy of summary:
- Commands and verification reporting:
- Deviations/risk reporting:
- Missing or misleading claims:

## Implementation Review

- Correctness:
- Minimality:
- Existing behavior preservation:
- Documentation accuracy:
- UX/operator clarity, if applicable:
- Risks:

## Commit Review

### Commit: <sha> - <message>

- Files changed:
- Purpose:
- Issues:
- Verdict:

## Verification Review

| Command / Check | Status | Evidence |
|---|---|---|
| Command from prompt/result | passed_with_evidence/claimed_but_no_evidence/failed/skipped_with_reason/skipped_without_reason/not_applicable | Notes |

## Issues Found

### Blocking

- None, or list issues.

### Required Fixes

- None, or list issues.

### Non-blocking Notes

- None, or list notes.

## Recommended Next Action

approve and proceed | approve but track notes | request a fix slice | rerun verification | block merge/deploy/tag/release | revert unsafe changes

## Suggested Fix Prompt

If fixes are needed, provide one concise Codex prompt that only addresses the required fixes.

If no fixes are needed, write:

No fix prompt needed.
```

## Review Strictness

Be stricter about:

- scope creep
- hidden side effects
- misleading result files
- fake or vague verification
- unexpected file changes
- broad refactors
- production-affecting changes
- security-sensitive changes
- deployment, release, tag, or publish claims without evidence
- creating follow-up prompts or automation without permission

Be practical about:

- minor wording differences
- harmless documentation polish
- small implementation details that satisfy the intent
- skipped verification with a clear acceptable reason
- harmless files changed because of formatting or generated metadata, if clearly explained

## Generic Trigger

Use this when asking GPT to review a completed slice:

```text
Use the Codex Run Ledger Review Protocol.

Review this completed slice:

- Prompt: {{PROMPT_FILE_PATH}}
- Result: {{RESULT_FILE_PATH}}
- Slice ID: {{SLICE_ID}}
- Base ref: {{BASE_REF}}
- Head ref: {{HEAD_REF}}
- Reviewer ID: {{REVIEWER_ID}}

Inspect the final diff, changed files, commits, and verification evidence.

Return the review Markdown only.
```
