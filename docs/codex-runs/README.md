# Codex Run Ledger Protocol

This directory documents the default prompt/result ledger layout used by the `codex-run-ledger` package.

If you are new, start with the root `README.md` first. This file is the protocol-oriented reference.

By default, a target repository stores ledger files under:

```text
docs/codex-runs/
```

The path is configurable with `promptDir` in `codex-run-ledger.config.json`.

## Existing Repo Quickstart

Install and initialize from the repository you want to manage:

```sh
npm install --save-dev codex-run-ledger
npx codex-run-ledger init --target-repo <owner/repo>
```

For example, this repository would use `HiroakiLion/Codex-Run-Ledger`. This value is the target repository identifier that prompt frontmatter must match; it is not the npm package name.

## How Prompt Files Are Created

The ledger starts from saved files. `codex-run-ledger` detects and checks existing `*-prompt.md` files; it does not yet convert pasted chat text into a prompt file by itself.

Manual workflow:

1. Create `docs/codex-runs/<slice-id>-prompt.md`.
2. Paste the Codex-ready prompt.
3. Set `status: approved`.
4. Set `approved_at` to the approval timestamp.
5. Run `detect`, `dry-run`, and readiness checks.

Template command workflow:

```sh
npx codex-run-ledger prompt:new --slice-id <slice_id>
```

This writes a draft prompt file under the configured prompt directory and refuses to overwrite an existing prompt. Use `--stdout` to print the template instead of writing it. The command does not run Codex, commit, push, tag, release, deploy, or publish.

Agent-assisted workflow:

1. Paste the Codex-ready prompt into Codex.
2. Ask Codex to create the approved `docs/codex-runs/<slice-id>-prompt.md` file.
3. Ask Codex to run the ledger checks.
4. Ask Codex to execute the bounded slice.
5. Ask Codex to write the paired result file.

In all workflows, the saved prompt file is the durable instruction packet and the paired result file is the durable receipt.

Add one approved prompt under `docs/codex-runs/`, then run the non-mutating checks:

```sh
npx codex-run-ledger detect
npx codex-run-ledger dry-run --slice-id <slice_id>
npx codex-run-ledger executor --slice-id <slice_id> --readiness-report
```

Real Codex execution requires explicit opt-in flags after readiness passes. When Codex writes the paired `*-result.md`, the prompt is consumed and will not run again automatically.

Build a review summary after a result or attempt artifact exists:

```sh
npx codex-run-ledger review --slice-id <slice_id> --markdown
```

The review summary is the handoff packet. It should surface prompt/result status, changed files, commands run, verification evidence, unresolved risks, and the recommended next action before anyone creates the next slice.

For GPT review, use `REVIEW_PROTOCOL.md` with the approved prompt, paired result file, final diff, commits, and verification evidence. New prompt templates ask Codex to include a `Review Handoff` section in the result file and a one-line review handoff in the final chat response so the protocol is discoverable even when the review starts from pasted output.

## Core Idea

Each unit of work is represented by a prompt/result pair:

```text
YYYY-MM-DD-slice-NNN-short-name-prompt.md
YYYY-MM-DD-slice-NNN-short-name-result.md
```

The prompt is the approved instruction packet. The result is the durable receipt. A prompt with an existing paired result is considered consumed and must not be run again automatically.

The paired result file is written after execution regardless of how the prompt file was created. Manual prompt creation and Codex-agent prompt creation both end in the same review flow: inspect the prompt, inspect the result, inspect verification evidence, then decide the next slice.

## Useful Commands

```sh
npx codex-run-ledger prompt:new --slice-id <slice_id>
npx codex-run-ledger detect --json
npx codex-run-ledger dry-run --json
npx codex-run-ledger executor --readiness-report
npx codex-run-ledger review --slice-id <slice_id> --markdown
```

Typical first pass:

```sh
npx codex-run-ledger init --target-repo <owner/repo>
npx codex-run-ledger detect
npx codex-run-ledger dry-run --slice-id <slice_id>
npx codex-run-ledger executor --slice-id <slice_id> --readiness-report
```

Then review:

```sh
npx codex-run-ledger review --slice-id <slice_id> --markdown
```

and give the review packet plus context (`docs/codex-runs/REVIEW_PROTOCOL.md`, prompt file, result file, diff/commits, verification evidence) to GPT for the structured review pass.

For direct source usage:

```sh
node scripts/codex-runs/detect-approved-prompts.mjs --json
node scripts/codex-runs/local-runner-dry-run.mjs --json
node scripts/codex-runs/local-executor.mjs --readiness-report
node scripts/codex-runs/review-summary-builder.mjs --slice-id <slice_id> --markdown
```

## Safety Defaults

- Draft, canceled, malformed, and example prompts are skipped.
- `main` and `master` are forbidden execution targets by default.
- Multiple runnable prompts fail closed unless `--slice-id` selects one.
- Existing paired result files are never overwritten.
- Real Codex execution requires explicit flags and passing readiness gates.
- Git mutation is preview-only in this version.

See these references for the deeper details:

- `PROTOCOL.md` for prompt/result file rules.
- `CHATGPT_PROMPT_HELPERS.md` for planning and prompt-writing helpers.
- `FIRST_PROMPT_TEMPLATE.md` for a starter prompt file.
- `REVIEW_PROTOCOL.md` for generic GPT review of completed runs.
- `SMOKE_TEST_WORKFLOW.md` for a small end-to-end install and ledger test.
- `REAL_EXECUTION_ENABLEMENT_POLICY.md` for live execution gates.
- `RUNNER_PLAN.md` for the local runner roadmap.
- `GIT_EXECUTION_DESIGN.md` for Git safety design.
- `LOCAL_EXECUTOR_INVOCATION_DESIGN.md` for Codex invocation design.
- `RELEASE_CHECKLIST.md` for future tag, GitHub release, and npm publish preparation.

For ChatGPT planning prompts that help propose bounded autonomous slices before an official prompt is approved, see `CHATGPT_PROMPT_HELPERS.md`.

For a copy/paste prompt-file structure, see `FIRST_PROMPT_TEMPLATE.md`.

For a first install test in another repository, see `SMOKE_TEST_WORKFLOW.md`.

## Repository CI

The repository CI runs `npm test` and `npm pack --dry-run` for pull requests and pushes to `main`. It is intentionally verification-only: it does not publish to npm, create GitHub releases, push tags, or deploy anything.

## Release Preparation

Use `RELEASE_CHECKLIST.md` before any future public release or npm publish. The checklist is preparation-only; version bumps, tags, GitHub releases, and npm publishing are separate actions that require explicit human approval.
