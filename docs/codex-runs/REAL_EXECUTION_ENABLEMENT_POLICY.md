# Real Execution Enablement Policy

## Status

- Policy plus guarded adapter implementation.
- Real Codex execution is implemented only behind explicit local executor flags.
- Real Codex execution remains disabled unless all execution flags and gates pass.
- Real Git automation remains preview-only/read-only.
- The current readiness report correctly blocks unless execution is explicitly requested, docs-only scoped, and intentionally run.

## Purpose

This policy defines when and how the local executor may eventually move from preview-only behavior to a tightly scoped real docs-only Codex execution pilot.

It is a gate before implementation. It does not grant the executor permission to run Codex, mutate Git state, or bypass user approval.

## Current Required Preconditions

Before any real docs-only execution attempt, all of these gates must pass:

- detector validation has zero errors;
- exactly one runnable approved prompt exists, or a specific runnable prompt is selected with `--slice-id`;
- selected prompt targets `workbench`;
- current branch is `workbench`;
- branch allowed is true;
- branch matches target is true;
- working tree is clean;
- paired result file does not already exist;
- Codex command preview is valid;
- Codex CLI availability check passes;
- Node is available in the same shell and environment context that will run Codex;
- Git command preview is valid;
- prompt docs-only scope enforcer passes;
- prompt risk level is low/docs-only;
- prompt allowed files are under `docs/codex-runs/`;
- no app/runtime files are in scope;
- user explicitly approves the execution attempt.

## Allowed First Execution Scope

The first real execution pilot may allow only:

- docs-only prompts;
- files under `docs/codex-runs/`;
- paired result file creation;
- optional documentation edits only if explicitly allowed by the prompt;
- `target_branch: workbench`;
- no app/runtime changes;
- no package changes;
- no migrations;
- no auth/security/session/token/permission changes;
- no deployment changes.

## Forbidden Until Later

These remain forbidden until a later policy and implementation explicitly allow them:

- app/runtime code changes;
- package/shared type changes;
- database migrations/schema changes;
- auth/security/session/OAuth/token/permission changes;
- GitHub Actions executor;
- automatic commits;
- automatic pushes;
- automatic merges;
- automatic PR creation;
- running multiple prompts;
- running on `main` or `master`;
- running with dirty worktree;
- running without user approval.

## Execution Flag Policy

Future real execution must require explicit flags.

- `--enable-codex-execution` requests execution evaluation.
- `--docs-only` declares the first-pilot scope.
- `--run-codex-now` is required before the executor may invoke Codex.
- Without all three flags, the executor must stay preview/evaluation-only.
- Either `--enable-codex-execution` or `--docs-only` alone is insufficient.
- Passing `--enable-codex-execution --docs-only` without `--run-codex-now` evaluates the gates but does not invoke Codex.
- Flags must never bypass dirty-tree, branch, result-file, or scope gates.
- Flags must never bypass the Codex CLI availability gate.
- `--slice-id` may resolve multiple-runnable queue ambiguity, but it must never bypass detector validation, branch, dirty-tree, docs-only scope, paired-result, artifact overwrite, or execution-flag gates.

The execution adapter validates the command preview and can invoke Codex only after all three flags and all readiness gates pass. It uses argument arrays, not shell interpolation, and the executor still does not commit, push, merge, or switch branches.

## Codex CLI Availability Policy

Before any live docs-only pilot, the executor must prove that the local `codex` executable is available.

- The check must use a metadata-only command such as `codex --version`.
- The check must not run `codex exec`.
- The check must not pass prompt content or prompt file paths.
- The check must use argument arrays with `shell: false`.
- If the check fails or is skipped, live execution is blocked.
- `--skip-codex-cli-check` may be used for diagnostics or tests, but skipped checks are not execution-ready.

## Execution Environment Preflight

The first live Codex execution pilot, slice-008, proved that the executor could invoke Codex and that Codex could write the paired result file, but the result was blocked because `node` was not available on PATH inside the Codex execution shell. App/runtime code was untouched and no Git mutation occurred.

Future real execution must verify Node availability in the same shell/context Codex will use. Do not assume the parent shell PATH and the Codex execution shell PATH are identical.

The executor must run a Node availability preflight before live execution:

- capture the parent executor `process.execPath`;
- capture the parent executor `process.version`;
- report sanitized PATH preview information;
- determine whether an explicit Node binary path is available;
- fail closed if the Node binary path cannot be determined.

The Codex invocation adapter must use an explicit environment contract:

- pass a controlled `env` object to the Codex child process;
- preserve necessary parent environment variables for local CLI behavior;
- prepend the directory of `process.execPath` to PATH when it is missing;
- never print secret-like environment values in previews or logs;
- prefer presence-only environment previews over arbitrary environment value previews.

The preflight is a live-execution gate. Two-flag evaluation reports the preflight result but does not invoke Codex; three-flag execution must require the preflight to pass before invocation.

## Result File Policy

The paired result file is mandatory execution evidence.

- Paired result file is required after execution.
- Missing result file is failure.
- Existing result file before execution blocks execution.
- Result file must include protocol frontmatter.
- Failed or blocked result still consumes the prompt.
- Result files must not be overwritten.
- Rerun requires a new prompt/slice.

## Scope Enforcement Policy

The executor should enforce scope conservatively.

- Executor must parse or conservatively inspect `Allowed Files / Areas` before real execution.
- The prompt scope enforcer must pass before any docs-only execution attempt.
- First real execution should allow only `docs/codex-runs/` paths.
- The first pilot must reject `apps/`, `packages/`, `scripts/`, `.github/workflows/`, root package/config files, broad repo scopes, and wildcard scopes.
- After execution, changed files must be checked.
- Any out-of-scope change blocks success and must be reported.
- Docs-only pilot must fail if `apps/` or `packages/` are touched.

## Git Policy For First Pilot

The first pilot must not grant Git mutation authority to the executor.

- No branch creation.
- No branch switching.
- No commit.
- No push.
- No merge.
- Executor may inspect status before and after execution.
- Operator/ChatGPT handles commit/merge/push after review.

## Verification Policy

Verification should provide evidence, not automatic approval.

- Prompt-listed verification commands should run only if safe and docs-only.
- Focused harness tests may be run after execution.
- On Windows, executor-owned verification from the parent local executor environment is the preferred strategy for Node-based checks.
- Codex internal testing is optional evidence; executor verification is authoritative for harness checks when available.
- Verification results must be reflected in executor output and may be reflected in future verification artifacts or result-file append policy.
- Failed verification does not auto-approve anything.
- Executor-owned verification must use allowlisted commands, reject Git mutation, and avoid shell interpolation.
- Live runs should prefer durable executor-owned verification artifacts when available by using `--run-verification-after-codex --write-verification-artifact`.
- Durable verification artifacts must be separate from Codex result files, must be derived from the selected slice id, must stay under `docs/codex-runs/`, and must not overwrite existing artifacts.
- Live execution attempts should prefer durable attempt artifacts for blocked, failed, or non-result attempts by using `--write-attempt-artifact`.
- Attempt artifacts must be separate from Codex result files and verification artifacts, must be derived from the selected slice id, must stay under `docs/codex-runs/`, and must not overwrite existing artifacts.
- After a result, verification artifact, or attempt artifact exists, ChatGPT/user review should prefer a review summary packet before creating the next prompt or checkpointing broader changes.
- Review summary packets must read existing artifacts only, keep optional durable review artifacts under `docs/codex-runs/`, and must not modify result, verification, or attempt artifacts.

## Human Review Policy

Human review remains required.

- ChatGPT/user review remains required after execution.
- Readiness report does not equal approval.
- Codex self-report is not final truth.
- Codex must not create the next official prompt.

## Approval-Layer Block Policy

The slice-017 durable verification artifact live-run attempt passed local harness readiness, but the live command was not executed because the external approval layer rejected it as high-risk external data export. No result file or verification artifact was created; slice-017 was later canceled, and slice-018 tracks this diagnosis.

Live Codex invocation may be blocked by approval layers even when local gates pass. Treat that rejection as a first-class blocked state, do not retry blindly, and investigate whether the command shape, prompt shape, artifact write, or Codex invocation mode triggered the classification. If the local executor process starts and can observe the rejection, it should write a durable attempt artifact. If the external approval layer blocks the command before the local process starts, the executor cannot write one. Smaller live runs without artifact writing or a manual Codex worker flow may be safer next steps.

## Rollout Steps

Recommended staged rollout:

1. Policy document.
2. Command adapter tests with no execution.
3. Explicit docs-only execution adapter behind flags.
4. Consume one disposable docs-only prompt.
5. Verify result and changed files.
6. Manual review.
7. Checkpoint commit/merge/push.
8. Only then consider broader docs-only prompts.

## Open Questions

- Should the first real execution use `codex exec` directly or a wrapper script?
- Should prompt content be passed by file reference or embedded prompt text?
- Should verification commands be run by Codex, executor, or both?
- Should the executor create failed result files when Codex fails before writing one?
- Should changed-file enforcement be implemented before or after first docs-only execution?
- Should commits remain manual until several docs-only executions succeed?
