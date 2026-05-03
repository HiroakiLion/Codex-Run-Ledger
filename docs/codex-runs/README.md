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

## Core Idea

Each unit of work is represented by a prompt/result pair:

```text
YYYY-MM-DD-slice-NNN-short-name-prompt.md
YYYY-MM-DD-slice-NNN-short-name-result.md
```

The prompt is the approved instruction packet. The result is the durable receipt. A prompt with an existing paired result is considered consumed and must not be run again automatically.

## Useful Commands

```sh
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
- `REAL_EXECUTION_ENABLEMENT_POLICY.md` for live execution gates.
- `RUNNER_PLAN.md` for the local runner roadmap.
- `GIT_EXECUTION_DESIGN.md` for Git safety design.
- `LOCAL_EXECUTOR_INVOCATION_DESIGN.md` for Codex invocation design.
- `RELEASE_CHECKLIST.md` for future tag, GitHub release, and npm publish preparation.

For ChatGPT planning prompts that help propose bounded autonomous slices before an official prompt is approved, see `CHATGPT_PROMPT_HELPERS.md`.

## Repository CI

The repository CI runs `npm test` and `npm pack --dry-run` for pull requests and pushes to `main`. It is intentionally verification-only: it does not publish to npm, create GitHub releases, push tags, or deploy anything.

## Release Preparation

Use `RELEASE_CHECKLIST.md` before any future public release or npm publish. The checklist is preparation-only; `v0.1.0` tagging, GitHub release creation, and npm publishing are separate actions that require explicit human approval.
