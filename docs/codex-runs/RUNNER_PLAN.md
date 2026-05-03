# Codex Runner Plan

## Status

This is a planning document only.

- Codex execution is still disabled.
- Current automation only validates and reports runnable approved prompts.
- The future runner must consume detector JSON rather than scraping human-readable output.

## Current Foundation

The current foundation includes:

- flat prompt/result files under `docs/codex-runs/`;
- approved prompt detection through the dry-run detector;
- paired result-file skip behavior so completed prompts are not re-run;
- fixture-based detector tests;
- machine-readable JSON detector output;
- a manual full-cycle proof where an approved prompt became non-runnable after its paired result file was written.

## Runner Responsibilities

A future runner is responsible for:

- calling the detector in JSON mode;
- refusing to run if detector output contains validation errors;
- selecting at most one runnable prompt per execution in the first version;
- verifying the paired result file does not exist immediately before execution;
- checking out or creating the target branch from prompt frontmatter;
- feeding the prompt file to Codex;
- requiring Codex to write the paired result file;
- running verification commands from the prompt where feasible;
- committing code changes and the result file to the target branch;
- never creating the next official prompt file;
- never overwriting an existing result file.

## Non-Responsibilities

The runner must not:

- decide product direction;
- create next official prompt files;
- bypass ChatGPT or user approval;
- run draft, canceled, or example prompts;
- run if validation errors exist;
- push directly to `main`;
- silently ignore scope deviations;
- treat Codex self-review as final verification.

## Proposed Execution Flow

1. Trigger manually or from a workflow.
2. Run the detector with `--json`.
3. Validate that the detector reports zero errors.
4. Select zero or one runnable prompt.
5. Re-check that the paired result file is absent.
6. Prepare the target branch.
7. Invoke Codex with the prompt file.
8. Run verification commands from the prompt where feasible.
9. Ensure the paired result file exists.
10. Commit and push the target branch.
11. Stop.
12. ChatGPT Reviewer and the user review the result file and diff before any next prompt is created.

## Safety Gates

Required gates:

- detector JSON must have `errors: []`;
- the first executor version must require exactly one runnable prompt or stop;
- prompt status must be `approved`;
- `approved_at` must be non-null;
- `target_branch` must be allowed by policy: `workbench` for default configuration or `codex/<slice_id>` for optional future per-slice mode;
- target branch must not be `main` or `master`;
- paired result file must not exist before execution;
- paired result file must exist after execution;
- runner must fail closed on ambiguity;
- no OpenAI or Codex secret should be exposed in logs;
- no automatic merge;
- no automatic deployment unless explicitly added later.

## GitHub Actions Executor Option

A future GitHub Actions executor should be introduced carefully.

Recommended shape:

- start with `workflow_dispatch`;
- consider an optional push trigger only after manual execution is proven;
- keep permissions minimal;
- avoid recursive runs;
- use concurrency by `slice_id` or branch;
- consume detector JSON;
- commit only to the target branch;
- never run example prompts;
- never run when the paired result file exists;
- use the dry-run workflow as a prerequisite signal.

## Local Runner Option

A local runner may be safer as the first execution path.

It can:

- support a target repo node, primary worker, or secondary worker testing;
- run on a controlled machine with Codex CLI installed;
- avoid giving GitHub Actions direct Codex execution power at first;
- poll or be manually invoked;
- consume the same detector JSON;
- follow the same result-file guardrails.

## Local Runner Dry-Run

`scripts/codex-runs/local-runner-dry-run.mjs` is implemented as the first local runner safety layer. It remains dry-run only and non-mutating.

It:

- consumes detector structured output, the same state exposed through detector JSON;
- selects exactly one runnable prompt by default; zero prompts produce no plan, and multiple prompts fail closed unless explicitly reported with `--allow-multiple`;
- fails closed when detector validation errors or multiple runnable prompts are present;
- re-checks paired result-file absence before reporting a selected plan;
- prints the exact future execution plan;
- emits JSON intended for future orchestration and external dashboard integration;
- does not run Codex;
- does not call OpenAI APIs;
- does not create, modify, commit, or push files.

The dry-run validates the future execution plan shape without enabling execution.

## Explicit Slice Selection

`--slice-id <slice_id>` is implemented as a queue-control feature for detector, local runner dry-run, and local executor workflows.

Default behavior remains fail-closed when more than one runnable prompt exists. With an explicit safe slice id, the runner/executor can select one runnable prompt while still reporting the full runnable queue. The selector must match the protocol slice id pattern and must not contain shell-control characters. It fails clearly for missing, canceled, completed, invalid, or non-runnable prompts.

Explicit selection is not a permission override. It does not bypass branch policy, dirty-tree checks, docs-only scope, paired-result checks, artifact overwrite protections, Codex CLI or Node preflight, execution flags, or the `main`/`master` rejection.

## Detector, Runner, And Executor Roles

- Detector: validates prompt files and reports runnable approved prompts.
- Local runner dry-run: turns detector output into a non-mutating execution plan for one runnable prompt.
- Local executor skeleton: applies executor-specific gates to that plan, then stops before any Codex invocation.

## Local Executor Skeleton

`scripts/codex-runs/local-executor.mjs` is implemented to prove executor gates before adding execution power. It reuses the detector and local runner safety model, remains disabled by default, and is intentionally unimplemented for real Codex invocation.

The skeleton:

- validates detector errors, single-prompt selection, target branch scope, prompt existence, result-file scope, and paired result-file absence;
- prints the gated execution plan when exactly one runnable prompt is present;
- emits JSON for future automation and external dashboard integration;
- writes no files, commits nothing, and pushes nothing;
- does not invoke Codex;
- keeps Codex invocation disabled unless the explicit execution flags and all gates pass.

See `LOCAL_EXECUTOR_INVOCATION_DESIGN.md` for the design of the future guarded Codex invocation layer.

The next safety layer is fake Codex fixture mode: a disabled-by-default simulation path that writes only the selected prompt's paired result file so result-file enforcement can be tested before real docs-only Codex execution.

The command-builder-only layer now follows that fixture step. It constructs and validates future Codex CLI command objects using argument arrays, but it does not execute Codex.

Executor plans now include that command object as a non-executing preview when one runnable prompt is selected.

`GIT_EXECUTION_DESIGN.md` defines the future branch, dirty working tree, commit, push, and PR policies. default configuration uses `workbench` as the expected target branch; `codex/<slice_id>` remains optional future per-slice mode. Git automation remains unimplemented; the executor should add Git command previews and local status checks before receiving branch or commit authority.

The Git command-builder preview layer now exists as another non-mutating safety layer. It constructs and validates future Git command objects with `usesShell=false` and `willExecute=false`, but it does not run Git.

Executor plans now include that Git command preview alongside the Codex command preview when one runnable prompt is selected. Both previews are non-executing safety surfaces.

The local executor now also includes read-only Git status inspection. It reports the current branch, target branch match, dirty state, and dirty path count in human and JSON output. This inspection does not switch branches, create branches, commit, push, or run any mutating Git command.

The executor also reports `dirtyTreePolicy`. Clean working trees are eligible for future real execution; dirty working trees block future real execution and make fake fixture writes fail closed unless tests inject controlled clean fixture state.

The executor now also supports a real-execution readiness report. It summarizes detector, branch, dirty-tree, scope, CLI-availability, and command-preview gates for a possible future docs-only Codex run, but it remains checklist-only and never executes Codex or Git mutation.

The readiness report now includes a pre-live Codex CLI availability check. It runs only metadata-style CLI inspection such as `codex --version`, never `codex exec`, and blocks live execution if the CLI is unavailable or the check is skipped.

The executor now also reports a Node availability preflight for the Codex execution environment. It captures `process.execPath`, `process.version`, sanitized PATH information, and whether an explicit Node binary path can be passed into the Codex child environment. Live invocation blocks if that Node path cannot be determined.

`REAL_EXECUTION_ENABLEMENT_POLICY.md` is the policy gate for any real docs-only execution adapter use. It defines the first-pilot scope, required flags, review expectations, and forbidden behaviors while execution remains disabled by default.

The executor now has a minimal docs-only execution adapter. It evaluates `--enable-codex-execution` and `--docs-only` without invoking Codex, and actual invocation requires the additional `--run-codex-now` flag plus passing readiness, branch, dirty-tree, result-file, and scope gates.

The executor now also includes a docs-only prompt scope enforcer. It parses `Allowed Files / Areas`, accepts only explicit `docs/codex-runs/` paths for the first pilot, and reports a `scopePolicy` plus readiness check before any real execution can be considered.

The first live Codex pilot, slice-008, confirmed that the executor could invoke Codex and that Codex could write the paired result file. The result was `blocked` because `node` was not available on PATH inside the Codex execution shell. No app/runtime files were touched and no Git mutation occurred.

Before the next live pilot, review the Node preflight output and confirm the controlled Codex child environment prepends the parent Node binary directory when needed. Do not rely on ambient PATH inheritance alone.

The next safety layer is executor-owned verification. After Codex returns, the local executor can run a conservative allowlist of prompt verification commands from the parent environment and report stdout, stderr, exit code, duration, and pass/fail without giving Codex's internal shell responsibility for Node-based tests.

Executor-owned verification can now add a durable artifact as an opt-in follow-up. When requested, the executor writes `docs/codex-runs/<slice_id>-verification.json` after verification runs, keeps it separate from the paired result file, blocks overwrites, and performs no Git mutation.

The slice-017 attempt to prove the full durable artifact live path passed local readiness, but the live command was blocked by an external approval layer as high-risk external data export before Codex invocation. No result file or verification artifact was created, slice-017 was later canceled, and slice-018 records the diagnosis.

Before retrying that path, investigate whether command shape, prompt shape, artifact writing, or Codex invocation mode caused the classification. Consider a smaller live run without artifact writing, a manual Codex worker flow for docs-only artifacts, or a blocked-attempt artifact written by the executor when the local process starts and can observe the failure.

The executor now supports durable execution-attempt artifacts as a queue hygiene layer for blocked live attempts. When `--write-attempt-artifact` is supplied with an execution attempt, blocked preflight, failed Codex invocation, and missing-result outcomes can be recorded as `docs/codex-runs/<slice_id>-attempt-001.json` without consuming the prompt or overwriting the paired result file.

The next ledger layer is review summary packets. A local review summary builder reads the prompt, paired result file, verification artifact, and attempt artifacts for a slice, then produces JSON or markdown that ChatGPT/user can use to review final status and choose the next action.

## Recommended Rollout

Stage 1: docs-only runner plan.

Stage 2: local runner dry-run using JSON, no Codex execution.

Stage 3: Git command-builder previews, no Git mutation.

Stage 4: executor includes Git command previews and read-only local status checks, no Git mutation.

Stage 5: confirm Codex CLI availability and Node preflight success, then run one intentionally approved disposable docs-only pilot with all three execution flags after a clean readiness report.

Stage 6: enable executor-owned verification after Codex invocation, using allowlisted commands and no Git mutation.

Stage 7: write durable executor-owned verification artifacts for live runs that need reviewable parent-executor evidence.

Stage 8: write durable execution-attempt artifacts for blocked, failed, or non-result live attempts.

Stage 9: build review summary packets for completed, blocked, attempted, and canceled slices.

Stage 10: explicit slice selection for controlled queue handling when more than one runnable prompt exists.

Stage 11: local branch/commit support behind explicit flags.

Stage 12: GitHub Actions manual `workflow_dispatch` executor, still docs-only.

Stage 13: allow limited low-risk code slices.

Stage 14: integrate with external dashboard / a target repo orchestrator later.

## Failure Handling

- If detector errors exist, stop and report.
- If multiple runnable prompts exist, stop in v1 unless explicitly configured.
- If Codex fails, write or require a failed/blocked result file.
- If the result file is missing after execution, fail.
- If Codex modifies out-of-scope files, require the result file to list deviations.
- If verification fails, result status should be failed or blocked unless the reason is clearly documented.

## Open Questions

- Should the first executor be a local runner or GitHub Actions?
- Should Codex execution happen on a dedicated a target repo node?
- Should result files include command exit codes in a stricter schema?
- Should the runner create PRs automatically or only push branches?
- Should review be automatically requested for risky prompt categories?
- Should the detector allow queue ordering by slice number/date?
