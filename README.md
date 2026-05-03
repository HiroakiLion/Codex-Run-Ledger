# Codex Run Ledger

A Git-backed prompt/result ledger for reliable, reviewable, and traceable autonomous Codex runs.

It helps you make Codex runs more reliable, reviewable, and traceable:

- write one approved `*-prompt.md` file for the work;
- let Codex work from that prompt;
- keep one paired `*-result.md` file as the receipt;
- review the prompt, result, verification, and diff before deciding what comes next.

No database. No server. No hosted dependency. Just files in your repo.

## Install

```sh
npm install --save-dev codex-run-ledger
```

Initialize the ledger:

```sh
npx codex-run-ledger init --target-repo your-repo-name
```

This creates:

```text
codex-run-ledger.config.json
docs/codex-runs/README.md
```

The generated config starts like this:

```json
{
  "targetRepo": "your-repo-name",
  "promptDir": "docs/codex-runs"
}
```

You can also copy `codex-run-ledger.config.example.json` manually if you prefer.

## Quick Start In An Existing Repo

From the repository you want to manage:

```sh
npm install --save-dev codex-run-ledger
npx codex-run-ledger init --target-repo your-repo-name
```

Create one approved `*-prompt.md` file under `docs/codex-runs/`, then inspect it before any execution:

```sh
npx codex-run-ledger detect
npx codex-run-ledger dry-run --slice-id <slice_id>
npx codex-run-ledger executor --slice-id <slice_id> --readiness-report
```

After Codex writes the paired `*-result.md`, build a review packet:

```sh
npx codex-run-ledger review --slice-id <slice_id> --markdown
```

Real Codex execution is gated behind explicit opt-in flags. A prompt is considered consumed once its paired result file exists.

## Basic Workflow

1. Ask ChatGPT to propose the next Codex slices.
2. Pick one slice.
3. Save it as an approved prompt under `docs/codex-runs/`.
4. Run the ledger checks.
5. Let Codex execute only when the readiness report is clean.
6. Review the result before creating the next prompt.

## ChatGPT Planning Prompt

Use this to decide what Codex should do next:

```text
Analyze the current repo, roadmap, open ledger artifacts, and recent state. Identify where we are now, then propose 3-5 next autonomous Codex parent slices that are big enough for 1-2 hours of work but still safely bounded.

For each option, include slice name, goal, scope, why now, why not now, risk level, expected files/areas, verification/deploy needs, likely tag name if applicable, and whether the slice needs extra review.

Use our standard parent-slice flow when judging whether a slice is well shaped: clear parent goal -> subtask commits -> verification -> push workbench/main if allowed -> deploy/restart if applicable -> create/push tag if applicable -> final report.

End with your recommended next slice and the reason it should go first.

Do not write an official Codex Run Ledger prompt yet. First present the options and recommend one. After I approve one option, wait for my confirmation before writing the full Codex-ready parent-slice prompt.
```

After choosing a slice, use [the parent-slice prompt helper](docs/codex-runs/CHATGPT_PROMPT_HELPERS.md#write-a-codex-ready-parent-slice-prompt) to turn it into a Codex-ready prompt with subtask commits, safety constraints, verification, deploy/tag rules, and final report format.

## Commands

Find approved prompts that are ready to run:

```sh
npx codex-run-ledger detect
```

Preview what would happen:

```sh
npx codex-run-ledger dry-run --slice-id <slice_id>
```

Check whether execution is safe to attempt:

```sh
npx codex-run-ledger executor --slice-id <slice_id> --readiness-report
```

Run Codex only after you intentionally opt in:

```sh
npx codex-run-ledger executor \
  --slice-id <slice_id> \
  --enable-codex-execution \
  --docs-only \
  --run-codex-now
```

Build a review summary:

```sh
npx codex-run-ledger review --slice-id <slice_id> --markdown
```

Short alias:

```sh
npx crl detect
```

The alias works for the same subcommands:

```sh
npx crl dry-run --slice-id <slice_id>
npx crl executor --slice-id <slice_id> --readiness-report
npx crl review --slice-id <slice_id> --markdown
```

## File Layout

By default, ledger files live here:

```text
docs/codex-runs/
```

Prompt/result pairs look like this:

```text
2026-05-04-slice-001-example-prompt.md
2026-05-04-slice-001-example-result.md
```

If the result file already exists, the prompt is considered consumed and will not run again automatically.

## Safety Defaults

- Draft, canceled, malformed, and example prompts are skipped.
- Multiple runnable prompts fail closed unless you choose one with `--slice-id`.
- Existing result files are never overwritten.
- `main` and `master` are forbidden execution targets by default.
- The executor does not commit, push, merge, or open PRs in this version.

## Docs

- [Ledger protocol overview](docs/codex-runs/README.md)
- [Protocol](docs/codex-runs/PROTOCOL.md)
- [Prompt helpers](docs/codex-runs/CHATGPT_PROMPT_HELPERS.md)
- [Execution policy](docs/codex-runs/REAL_EXECUTION_ENABLEMENT_POLICY.md)
- [Runner plan](docs/codex-runs/RUNNER_PLAN.md)
- [Git execution design](docs/codex-runs/GIT_EXECUTION_DESIGN.md)
- [Local executor invocation design](docs/codex-runs/LOCAL_EXECUTOR_INVOCATION_DESIGN.md)
- [Changelog](CHANGELOG.md)

## Development

```sh
npm test
npm pack --dry-run
```

The GitHub Actions CI workflow runs the same checks on pull requests and pushes to `main`. It does not publish packages, create releases, or push tags.
