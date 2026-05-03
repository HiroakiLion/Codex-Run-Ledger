# Git Execution Design

## Status

This is a design document only.

- No Git automation is implemented in this slice.
- The local executor must not yet create branches, commit, push, or open PRs.
- Real Codex execution remains disabled and unimplemented.

## Purpose

This document defines the future safe path for Git operations around Codex runs:

approved prompt -> target branch -> Codex work -> paired result file -> verification -> commit -> optional push/PR later.

The design keeps Git mutation separate from prompt detection, command previews, fake fixture mode, and future Codex invocation so each step can be proven before it receives write authority.

## Current Safety Foundation

The current foundation is intentionally narrow:

- flat prompt/result files under `docs/codex-runs/`;
- detector JSON for validating prompt protocol and finding runnable approved prompts;
- local runner dry-run that selects at most one prompt and prints a plan;
- local executor skeleton that validates execution gates and stops before Codex invocation;
- fake fixture write mode that writes only the paired result file for disposable prompts or test fixtures;
- Codex command preview that builds non-executing command objects;
- no current Git mutation by the executor.

## Branch Rules

Future Git execution must keep branch behavior explicit and bounded.

- Executor must never work directly on `main` or `master`.
- `target_branch` comes from prompt frontmatter.
- For default configuration, `target_branch: workbench` is allowed and preferred.
- Optional future per-slice mode may use `target_branch: codex/<slice_id>`.
- `target_branch` must be either `workbench` or `codex/<slice_id>`.
- Executor should fail closed if branch identity is unsafe or ambiguous.
- Executor must not create or switch branches yet.
- Branch creation, when introduced later, should be explicit and logged.
- If the branch already exists, executor must verify it matches the expected slice context before reuse.
- If the branch does not exist, executor may create it from a known safe base in a future implementation.
- Branch base policy must be explicit before implementation.

The human working branch may be `main`, `workbench`, or another operator branch over time. The executor should not infer safety from the current branch name alone; it should use the prompt `target_branch`, the allowed branch policy, the configured base policy, and the dirty working tree policy.

## Working Tree Policy

The default policy should require a clean working tree before execution.

- Executor should detect uncommitted changes before running Codex.
- If uncommitted changes exist, fail closed unless an explicit future override is provided.
- Fake fixture mode should remain constrained and should not hide unrelated dirty changes.
- Executor should report dirty paths clearly.
- The paired result file itself may be an expected new file only during controlled execution.

This keeps operator work, manual experiments, and generated Codex changes from being mixed into the same commit by accident.

## Read-Only Git Status Inspection

The local executor may inspect Git status before any execution authority exists.

This inspection is read-only. It may run only:

- `git branch --show-current`
- `git status --porcelain=v1 --branch`

It must not switch branches, create branches, add files, commit, push, pull, merge, or rebase.

The current implementation reports the current branch, target branch match, dirty state, and dirty paths in executor output. `workbench` is the expected default configuration active branch. Dirty state is visible now as a warning surface; future real Codex execution should require a clean working tree before invocation.

## Dirty Working Tree Policy

The executor now reports a structured `dirtyTreePolicy`.

- Clean working tree: eligible for future real execution gates.
- Dirty working tree: blocks future real Codex execution.
- Dirty paths are reported explicitly.
- Fake fixture mode must not hide pre-existing dirty state.
- Fake fixture mode may write only the selected paired result file when the pre-execution tree is clean, or when tests inject controlled clean fixture state.
- This policy adds no branch creation, branch switching, commit, push, pull, merge, or rebase behavior.

Future real execution should treat `dirtyTreePolicy.futureExecutionBlocked=true` as a hard stop before invoking Codex.

The local executor readiness report includes these Git-facing checks: branch allowed, branch matches target, and working tree clean. The report is still non-mutating; it does not create or switch branches, commit, push, pull, merge, or rebase.

## Commit Boundary

The first commit-capable executor version should produce one commit per Codex run.

- Commit should include code changes plus the paired result file.
- Commit should not include unrelated files.
- Commit message should include `slice_id`.
- Suggested format:

```text
codex: complete <slice_id>
```

If verification fails, commit behavior should be decided explicitly later. The default recommendation is no auto-commit unless failure-result commits are intentionally allowed.

Failed or blocked result files may need a separate policy before automation. A failed/blocked result still consumes the prompt, but the team must decide whether that receipt should be committed automatically or left for operator inspection.

## Push Policy

Initial Git automation should not push.

- No push to `main` or `master`.
- Pushing should be disabled until branch and commit behavior is proven locally.
- The first push-capable version should require an explicit flag.
- Pushed branch must be the prompt `target_branch` only.
- Push output should not leak secrets.
- No force-push in the initial implementation.
- Force-push, if ever allowed, requires a separate explicit policy.

## PR Policy

PR creation is a later-stage capability, not part of the initial executor.

- First executor versions should only prepare local branch/commit state.
- No automatic merge.
- Human and ChatGPT review remain required before merge.

Later PR creation should include:

- prompt file link/path;
- result file link/path;
- verification summary;
- changed files summary;
- risk and Reviewer requirement note.

## Result File And Git Interaction

The paired result file is part of the Codex run artifact and should be committed with the changes it describes.

- Existing paired result file blocks execution.
- Missing paired result file after Codex execution is a failure.
- Failed or blocked result files still consume the prompt and prevent automatic rerun.
- Rerun requires a new prompt/slice, not overwriting the result file.

The result file and code changes should move together so reviewers can inspect what Codex did and what it claimed in the same branch diff.

## Verification And Git

Verification should happen before commit when feasible.

- Verification command outcomes should be recorded in the paired result file.
- Executor should not pretend failed verification is success.
- If verification fails after code changes, future policy must decide whether to commit the failed state or leave the working tree for operator inspection.
- The first implementation should prefer fail-closed behavior and no auto-push.

Verification is evidence for review, not a replacement for ChatGPT/user review.

## Git Command Builder Preview

The Git command builder mirrors the Codex command builder approach.

`scripts/codex-runs/git-command-builder.mjs` constructs Git command previews only.

It:

- builds command objects only;
- uses `executable` plus `args` arrays;
- forbids shell execution;
- avoids `child_process`;
- executes no commands;
- keeps push preview-only and excludes push by default;
- sets `usesShell=false` and `willExecute=false` on the plan and every command;
- validates branch names and run file paths;
- previews status, checkout, add, commit, and optional push commands without executing them;
- includes tests proving the builder does not execute anything.

This layer exists before any executor code receives real Git mutation authority.

The local executor now includes this Git command preview in gated plans when one runnable prompt is selected. The preview is not execution: `usesShell=false` and `willExecute=false` remain required, no Git process is started, and push remains excluded unless explicitly previewed by builder options. For `workbench`, the preview must not imply creating a per-slice branch.

## Failure Modes

All failure modes should fail closed and report clearly.

- Target branch is `main` or `master`: stop before branch operations.
- Target branch is not `workbench` or `codex/<slice_id>`: stop before branch operations.
- Dirty working tree: stop unless an explicit future override is configured.
- Branch already exists but points to unexpected state: stop and report the mismatch.
- Result file already exists: stop; prompt is already consumed.
- Result file missing after execution: stop and report a hard failure.
- Unrelated files changed: stop or require explicit operator handling.
- Verification fails: stop before auto-approval and follow the future failure-result policy.
- Commit fails: stop and preserve working tree for inspection.
- Push fails: stop; do not retry destructively.
- Network failure: stop and report.
- Credentials missing: stop and report without printing secret values.
- Multiple runnable prompts: stop in the first executor version.

## Recommended Rollout

1. Docs-only Git execution design.
2. Git command builder preview with tests, no execution.
3. Executor includes Git command previews in plan output.
4. Local-only branch/status checks, no mutation.
5. Local branch creation behind explicit flag.
6. Local commit behind explicit flag.
7. Push behind explicit flag.
8. PR creation later.
9. external dashboard integration later.

## Open Questions

- Should executor require a clean working tree always?
- Should failed/blocked result files be committed automatically?
- Should branch base for future per-slice mode be `main`, current `HEAD`, `workbench`, or an explicit base ref?
- Should executor create target branch or require it to exist?
- Should push be local-only at first or remote push with explicit flag?
- Should PR creation be handled by local executor, GitHub Actions, or external dashboard?
- Should Reviewer-required prompts block push/PR until reviewed?
