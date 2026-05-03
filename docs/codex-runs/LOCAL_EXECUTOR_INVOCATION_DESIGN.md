# Local Executor Invocation Design

## Status

This is a design and implementation boundary document.

- Minimal docs-only Codex invocation is implemented behind explicit local executor flags.
- `local-executor.mjs` remains non-mutating by default.
- Codex execution remains disabled unless all execution flags and gates pass.

## Purpose

This document defines the future safe path from approved prompt to gated local executor, Codex invocation, paired result file, verification, and commit/push.

The goal is to design the invocation layer before giving the local executor any ability to run Codex.

## Current Safety Foundation

The current foundation is intentionally non-mutating:

- the detector validates prompt protocol and emits JSON;
- the local runner dry-run selects at most one runnable prompt;
- the local executor skeleton validates execution gates;
- no current script writes files, commits, pushes, or invokes Codex;
- paired result-file checks prevent duplicate automatic execution.

## Proposed Invocation Command Shape

A future executor may invoke Codex through a command shape similar to:

```text
codex exec --full-auto "$(cat <prompt-file>)"
```

The exact Codex CLI command may change. The implementation must isolate the command behind one small invocation function.

Safety requirements:

- never concatenate untrusted shell strings directly;
- prefer `spawn` or `execFile`-style argument arrays over shell interpolation;
- pass the prompt content or prompt path through explicit arguments;
- never log secrets, tokens, or private command environment values.

## Command Builder Layer

`scripts/codex-runs/codex-command-builder.mjs` constructs future Codex CLI command objects only.

- It does not execute commands.
- It represents commands as `executable` plus `args` arrays.
- Shell execution is forbidden.
- Prompt paths are passed by reference instead of embedding full prompt content.
- Prompt file paths are validated for `docs/codex-runs/` scope, `-prompt.md` suffix, and shell-control characters.
- The command object sets `usesShell=false` and `willExecute=false`.

This layer prepares the executor for a future invocation step, but it does not enable real Codex execution.

The local executor includes this command object in gated plans as a command preview. The preview is not execution: `usesShell=false` and `willExecute=false` remain required, and no Codex process is started.

## Real-Execution Readiness Report

The local executor includes a real-execution readiness report for future docs-only pilots.

- The report is checklist-only.
- It does not execute Codex.
- It does not run mutating Git commands, write files, commit, or push.
- It checks detector validation, single-prompt selection, branch policy, branch match, dirty-tree policy, and command preview validity.
- It checks Codex CLI availability with a metadata-only command before live execution can be considered.
- `safeToAttemptDocsOnlyRealExecution` remains `false` until real Codex execution is explicitly implemented and enabled.

The report is useful before a docs-only real Codex execution pilot because it shows which gates would block execution without granting execution authority.

Real invocation remains governed by `REAL_EXECUTION_ENABLEMENT_POLICY.md`. That policy requires explicit execution flags, docs-only scope, clean working tree, `workbench` branch match, result-file enforcement, and user approval before any first pilot can run.

## Explicit Slice Selection

The detector, local runner dry-run, and local executor support `--slice-id <slice_id>` as an explicit queue-control selector.

- Without `--slice-id`, default behavior remains fail-closed: zero runnable prompts produce no plan, exactly one runnable prompt can be selected automatically, and multiple runnable prompts block runner/executor planning.
- With `--slice-id`, one matching runnable prompt can be selected even if other runnable prompts exist.
- The selected slice id must match `YYYY-MM-DD-slice-NNN-short-name`; newline and shell-control characters are rejected.
- Selecting a canceled, completed, invalid, or missing prompt fails clearly.
- Selection never bypasses detector validation, target branch policy, dirty-tree policy, docs-only scope, paired-result checks, artifact overwrite rules, Codex CLI/Node preflight, or execution flags.
- Review summary building already uses exact slice id matching and does not do fuzzy or partial selection.

Examples:

```powershell
node scripts/codex-runs/detect-approved-prompts.mjs --slice-id <slice_id>
node scripts/codex-runs/local-runner-dry-run.mjs --slice-id <slice_id>
node scripts/codex-runs/local-executor.mjs --slice-id <slice_id> --readiness-report
node scripts/codex-runs/local-executor.mjs --slice-id <slice_id> --enable-codex-execution --docs-only --run-codex-now
```

## Execution Adapter

The local executor includes a real-execution adapter for gated docs-only invocation.

- `--enable-codex-execution` requests execution evaluation.
- `--docs-only` declares the first-pilot scope.
- `--run-codex-now` is required before Codex may be invoked.
- `--enable-codex-execution --docs-only` evaluates whether execution would be allowed, but it does not invoke Codex.
- All three flags are required for an intentional docs-only execution attempt.
- Any missing flag remains blocked or evaluation-only.
- The adapter validates the Codex command preview, then converts it to an actual invocation internally only after gates pass.
- Invocation uses Node built-ins with argument arrays and `shell: false`, not shell-interpolated strings.
- Tests use injected fake runners so they do not call real Codex.
- The adapter does not commit, push, merge, switch branches, or run Git mutation.

The adapter result is reported as `codexExecutionAdapter` in JSON output so operator intent, evaluation-only mode, and actual invocation intent remain explicit.

## Codex CLI Availability Check

The executor performs a pre-live Codex CLI availability check.

- The check runs `codex --version` by default.
- It uses Node built-ins and argument arrays with `shell: false`.
- It never runs `codex exec`.
- It never passes prompt content or prompt paths.
- It captures exit code plus bounded stdout/stderr previews.
- It supports injected fake runners in tests.
- `--skip-codex-cli-check` skips the metadata command but reports a warning and blocks execution readiness.

This check proves that the executable is reachable before a live docs-only pilot. It is not prompt execution.

## Execution Shell Environment Check

The first live Codex pilot for slice-008 reached Codex and produced the paired result file, but the result was blocked because `node` was not available on PATH inside the Codex execution shell. The harness invocation path worked; app/runtime code was untouched and no Git mutation occurred.

Before the next live run, the executor should preflight Node availability in the exact shell/context used for Codex execution. The implementation should prefer a known Node path or explicit environment contract over ambient PATH inheritance from the parent shell.

The executor now reports a Node availability preflight before any live invocation can proceed.

- The preflight captures `process.execPath`, `process.version`, a sanitized PATH preview, and whether an explicit Node binary path is available.
- The adapter builds a controlled child-process environment for Codex invocation.
- The controlled environment preserves the parent environment for Codex authentication and local CLI behavior, but reports only redacted or presence-only previews.
- When the Node binary directory from `process.execPath` is not already present in PATH, the adapter prepends it for the Codex child process.
- Secret-like environment values are redacted from previews and must not be logged.
- If the Node binary path cannot be determined, live execution is blocked before Codex is invoked.

This preflight still does not grant Git mutation authority. It only makes the Codex execution shell contract explicit before a guarded invocation.

## Prompt Scope Enforcement

The local executor includes a conservative prompt scope enforcer for docs-only readiness.

- It reads the selected prompt's `Allowed Files / Areas` section.
- It only passes explicit paths under `docs/codex-runs/`.
- It rejects broad scopes such as `docs`, `documentation`, repo root, `.` or `**`.
- It rejects `apps/`, `packages/`, `scripts/`, `.github/workflows/`, root package/config files, and any path outside `docs/codex-runs/`.
- Missing or empty allowed-file sections fail the docs-only scope check.
- False negatives are preferred over false positives.

The executor reports this as `scopePolicy` and includes a `docs-only scope` readiness check. This still does not execute Codex; it only proves whether the selected prompt is eligible for a future docs-only pilot.

## Execution Preconditions

Before invoking Codex, all of these must be true:

- detector errors are empty;
- exactly one runnable prompt exists;
- prompt status is `approved`;
- `approved_at` is non-null;
- paired result file does not exist;
- `target_branch` follows the allowed branch policy: `workbench` for default configuration or `codex/<slice_id>` for optional future per-slice mode;
- `target_branch` is not `main` or `master`;
- working tree state is acceptable for the configured mode;
- `dirtyTreePolicy.futureExecutionBlocked` is `false` before any future real Codex invocation;
- Codex CLI is installed and a version check passes;
- execution feature flag is explicitly enabled;
- user/operator has intentionally selected local executor execution.

## Scope Enforcement

Scope should be enforced conservatively.

- Prompt files declare `Allowed Files / Areas`.
- Codex must report deviations in the paired result file.
- The executor can check `git diff` paths after execution.
- The executor should fail or mark the result blocked if changed files are outside allowed scope.
- Docs-only prompts should not modify `apps/` or `packages/`.
- Future allowed-area parsing should prefer conservative false negatives over broad permission.

## Result File Enforcement

The paired result file is the execution receipt.

- Existing paired result file before execution blocks execution.
- Executor must require the paired result file after Codex returns.
- Missing result file is a hard failure.
- Result file must contain expected protocol frontmatter.
- Result status may be `completed`, `failed`, or `blocked`.
- A `failed` or `blocked` result still consumes the prompt and prevents automatic rerun unless ChatGPT Planner creates a new prompt.

## Fake Codex Fixture Mode

The local executor includes a fake Codex fixture mode for tests and local simulation.

- It is not real Codex execution.
- It exists to test result-file enforcement and runner mutation boundaries.
- It only writes the selected prompt's paired result file.
- It states in the result body that Codex execution was not invoked.
- It commits nothing and pushes nothing.
- It should be used on temporary fixtures or deliberately disposable prompts.

## Verification Handling

Verification is part of the execution record, not final approval.

- Executor should run prompt-listed verification commands when feasible.
- Command output should be summarized in the result file.
- Failing verification should prevent auto-approval.
- Failing verification may still produce a `failed` or `blocked` result file.
- Verification does not replace ChatGPT Reviewer or user review.

## Executor-Owned Verification

Native Windows Codex execution shells may not have the same Node availability as the parent executor process. For Windows pilots, Node-based harness verification should be owned by the local executor after Codex returns rather than relying on Codex's internal shell.

The `--run-verification-after-codex` flag enables this post-Codex verification path. It only runs after Codex was actually invoked. Without a Codex invocation, verification remains skipped.

The first implementation is intentionally conservative:

- verification commands are extracted from the selected prompt's `Verification Commands` section;
- only allowlisted commands are executed;
- Git mutation commands are rejected;
- shell control characters are rejected;
- commands are run with argument arrays and `shell: false`;
- stdout, stderr, exit code, duration, and pass/fail are captured in executor output;
- result files are not overwritten or appended by the executor verification step.

Executor-owned verification is evidence for ChatGPT/user review. It is not automatic approval, automatic retry, or Git mutation authority.

## Durable Verification Artifacts

Executor-owned verification can optionally write a durable per-slice artifact when `--write-verification-artifact` is supplied with `--run-verification-after-codex`.

- The artifact path is derived from the selected slice id as `docs/codex-runs/<slice_id>-verification.json`.
- The artifact is separate from the paired Codex result file.
- The executor must not append to or overwrite the paired result file when writing the artifact.
- The artifact write only happens after executor-owned verification actually runs.
- Existing artifact files block the write; there is no overwrite flag.
- The derived artifact path must stay under `docs/codex-runs/`.
- Artifact writing does not commit, push, switch branches, or perform Git mutation.

The durable artifact is intended to preserve parent-executor verification evidence for review without changing Codex's own execution receipt.

## Execution-Attempt Artifacts

The executor can optionally write durable attempt artifacts when `--write-attempt-artifact` is supplied with an execution attempt.

- Attempt artifact paths are derived from the selected slice id as `docs/codex-runs/<slice_id>-attempt-001.json`, then `attempt-002.json`, and so on.
- The executor scans existing attempt artifacts and writes the next available number.
- Existing attempt artifacts are never overwritten.
- Attempt artifacts stay under `docs/codex-runs/`.
- Attempt artifacts are separate from paired Codex result files and executor-owned verification artifacts.
- Attempt artifact writing does not commit, push, switch branches, merge, or perform Git mutation.

Attempt artifacts are intended for blocked, failed, or non-result execution attempts: local readiness blockers, failed Codex invocation, or a missing paired result file after Codex returns. If an external approval layer blocks the command before the local executor process starts, the executor cannot write an artifact; if the executor starts and observes an approval-layer-style rejection, it should record that rejection as an attempt artifact.

## Review Summary Packets

The ledger can build local review summary packets for ChatGPT/user review with `scripts/codex-runs/review-summary-builder.mjs`.

- Review summaries read existing prompt, result, verification, and attempt artifacts for one slice id.
- They summarize prompt status, result status, verification status, attempt history, changed files, known risks, and the recommended next action.
- JSON and markdown output are supported so the same evidence can be used by automation or by a human reviewer.
- `--write-review-summary` writes an optional durable markdown artifact at `docs/codex-runs/<slice_id>-review.md`.
- Existing review summary artifacts are not overwritten.
- Review summaries are separate from paired result files, verification artifacts, and attempt artifacts.
- Writing a review summary does not commit, push, switch branches, merge, or perform Git mutation.

This is a local ChatGPT/Codex ledger review helper. It is not a target repo orchestrator or external dashboard integration, and it does not replace human review.

## Approval-Layer Blocks

The slice-017 live command was ready according to local executor gates, but it was blocked before execution by an external approval layer as high-risk external data export. Codex was not invoked, and neither the paired result file nor the durable verification artifact was created. Slice-017 was later canceled; slice-018 records the diagnosis path.

This failure mode is distinct from local readiness failure and Codex runtime failure. The executor design should treat approval-layer rejection as a blocked attempt, avoid blind retries, and preserve the reason when the local process has enough context to write an execution-attempt artifact.

## Git Handling

Git behavior must stay branch-scoped and reviewable.

- Executor should operate on `target_branch`.
- For default configuration, real execution would happen on the approved `workbench` branch policy.
- Optional future per-slice branch mode may use `codex/<slice_id>`.
- Current executor output includes read-only Git status inspection for current branch, target branch match, dirty state, and dirty paths.
- Status inspection must not switch branches, create branches, commit, push, or run mutating Git commands.
- Branch creation from the current base is allowed only when safe.
- Executor must not push to `main`.
- Code changes and the paired result file should be committed together.
- Commit message should include `slice_id`.
- No automatic merge.
- PR creation can be added in a later stage.

Detailed branch handling, dirty working tree policy, commit boundaries, push rules, and PR staging are intentionally separated into `GIT_EXECUTION_DESIGN.md`. Those behaviors remain unimplemented; this invocation design only defines how Codex would be called after the relevant Git gates are proven.

## Failure Modes

All failure modes must fail closed and report clearly.

- Detector validation errors: stop before selection.
- Multiple runnable prompts: stop unless a safe explicit `--slice-id` selection is provided.
- Result file appears during execution race: stop and do not invoke Codex.
- Codex exits non-zero: record failed/blocked result when possible.
- Codex modifies out-of-scope files: fail or mark blocked with deviations.
- Verification command fails: fail or mark blocked unless explicitly documented.
- Result file missing: hard failure.
- Unsafe branch: stop before execution.
- Dirty working tree: stop unless the configured mode explicitly allows it.
- Network/API failure: fail closed and avoid retries that could duplicate work.
- Codex CLI missing: stop before execution.
- External approval layer rejects the live command: treat as blocked, do not retry automatically, and preserve the reason for review.

## Rollout Recommendation

Recommended staged rollout:

1. Keep the executor skeleton disabled.
2. Add command builder tests.
3. Add fake Codex fixture mode.
4. Add docs-only local execution behind an explicit flag.
5. Add branch/commit support.
6. Add PR support.
7. Consider GitHub Actions only after the local runner is trusted.

## Open Questions

- Should the first real executor run use Codex CLI or Codex App automation?
- Should execution happen on primary worker, a target repo, or a dedicated secondary worker node?
- Should local executor require a clean working tree?
- Should runner auto-create branches or require branch to already exist?
- Should allowed-file enforcement be hard fail or result-status failed?
- Should verification commands be executed by executor or left to Codex?
- Should external dashboard show pending/runnable prompts from detector JSON?
