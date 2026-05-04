# Codex Run Ledger

A Git-backed prompt/result ledger for reliable, reviewable, and traceable autonomous Codex runs.

It helps you make Codex runs more reliable, reviewable, and traceable:

- write one approved `*-prompt.md` file for the work;
- let Codex work from that prompt;
- keep one paired `*-result.md` file as the receipt;
- review the prompt, result, verification, and diff with `codex-run-ledger review --slice-id <slice_id> --markdown` and GPT using `docs/codex-runs/REVIEW_PROTOCOL.md` before deciding what comes next.

No database. No server. No hosted dependency. Just files in your repo.

## Install

```sh
npm install --save-dev codex-run-ledger
```

Initialize the ledger:

```sh
npx codex-run-ledger init --target-repo HiroakiLion/Codex-Run-Ledger
```

This creates:

```text
codex-run-ledger.config.json
docs/codex-runs/README.md
docs/codex-runs/REVIEW_PROTOCOL.md
```

The generated config starts like this:

```json
{
  "targetRepo": "HiroakiLion/Codex-Run-Ledger",
  "promptDir": "docs/codex-runs"
}
```

You can also copy `codex-run-ledger.config.example.json` manually if you prefer.

Use the repository identifier for `targetRepo`, such as `owner/repo`. It is not the npm package name.

## Quick Start In An Existing Repo

From the repository you want to manage:

```sh
npm install --save-dev codex-run-ledger
npx codex-run-ledger init --target-repo HiroakiLion/Codex-Run-Ledger
```

## How Prompts Get Into The Ledger

`codex-run-ledger` works from prompt files that already exist under `docs/codex-runs/`. It detects, validates, previews, and reviews those files; it does not yet turn pasted chat text into a prompt file by itself.

You have three practical ways to create the prompt file.

Manual ledger workflow:

1. Create `docs/codex-runs/<slice-id>-prompt.md`.
2. Paste the Codex-ready prompt into that file.
3. Set `status: approved`.
4. Set `approved_at` to the approval timestamp.
5. Run the ledger checks.

Template command workflow:

```sh
npx codex-run-ledger prompt:new --slice-id 2026-05-04-slice-001-example
```

This writes `docs/codex-runs/2026-05-04-slice-001-example-prompt.md` as a draft template. Review it, fill in the body, and set `status: approved` plus `approved_at` only after human approval. Use `--stdout` if you want to print the template instead of writing the file.

Agent-assisted workflow:

1. Paste the Codex-ready prompt into Codex.
2. Ask Codex to create the approved `docs/codex-runs/<slice-id>-prompt.md` file.
3. Ask Codex to run the ledger checks.
4. Ask Codex to execute the bounded slice.
5. Ask Codex to write the paired `docs/codex-runs/<slice-id>-result.md` file.

In the agent-assisted path, Codex is creating the file for you because it can edit the repository. The package still treats the saved prompt file as the source of truth.

## First Five Minutes

Create or ask Codex to create one approved `*-prompt.md` file under `docs/codex-runs/`, then inspect it before any execution:

```sh
npx codex-run-ledger detect
npx codex-run-ledger dry-run --slice-id <slice_id>
npx codex-run-ledger executor --slice-id <slice_id> --readiness-report
```

After Codex writes the paired `*-result.md`, build a review packet:

```sh
npx codex-run-ledger review --slice-id <slice_id> --markdown
```

The review packet gathers the prompt/result status, artifact paths, changed files, commands run, verification evidence, known risks, and recommended next action. Use it as the handoff back to ChatGPT or a human reviewer before planning the next slice.

For deeper review, use `docs/codex-runs/REVIEW_PROTOCOL.md` with the approved prompt, paired result file, final diff, commits, and verification evidence. New prompt templates also ask Codex to include a review handoff in the result file and final chat response.

Real Codex execution is gated behind explicit opt-in flags. A prompt is considered consumed once its paired result file exists.

## Basic Workflow

1. Ask ChatGPT to propose the next Codex slices.
2. Pick one slice.
3. Save it as an approved prompt under `docs/codex-runs/`, either manually or by asking Codex to create the file.
4. Run the ledger checks.
5. Let Codex execute only when the readiness report is clean.
6. Review with GPT before creating the next prompt: run `codex-run-ledger review --slice-id <slice_id> --markdown`, then ask GPT to review using `docs/codex-runs/REVIEW_PROTOCOL.md` (plus prompt file, result file, base/head refs, and changed files).

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

For a copy/paste file structure, use the [first prompt template](docs/codex-runs/FIRST_PROMPT_TEMPLATE.md), or generate a draft with `npx codex-run-ledger prompt:new --slice-id <slice_id>`.

To test the full lifecycle in a small target repo, follow the [smoke test workflow](docs/codex-runs/SMOKE_TEST_WORKFLOW.md).

Local version bumps in this repository are preparation only. Publishing to npm, creating a Git tag, and creating a GitHub release require separate human approval.

## Commands

Find approved prompts that are ready to run:

```sh
npx codex-run-ledger detect
```

Create a starter prompt file:

```sh
npx codex-run-ledger prompt:new --slice-id <slice_id>
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

The markdown summary is meant to be pasted into a review conversation. It should make the prompt summary, result summary, verification evidence, changed files, unresolved risks, and suggested next slice easy to scan.

For strict GPT review, pair the summary with `docs/codex-runs/REVIEW_PROTOCOL.md`.

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
- [First prompt template](docs/codex-runs/FIRST_PROMPT_TEMPLATE.md)
- [Review protocol](docs/codex-runs/REVIEW_PROTOCOL.md)
- [Smoke test workflow](docs/codex-runs/SMOKE_TEST_WORKFLOW.md)
- [Execution policy](docs/codex-runs/REAL_EXECUTION_ENABLEMENT_POLICY.md)
- [Runner plan](docs/codex-runs/RUNNER_PLAN.md)
- [Git execution design](docs/codex-runs/GIT_EXECUTION_DESIGN.md)
- [Local executor invocation design](docs/codex-runs/LOCAL_EXECUTOR_INVOCATION_DESIGN.md)
- [Release checklist](docs/codex-runs/RELEASE_CHECKLIST.md)
- [Changelog](CHANGELOG.md)

## Development

```sh
npm test
npm pack --dry-run
```

The GitHub Actions CI workflow runs the same checks on pull requests and pushes to `main`. It does not publish packages, create releases, or push tags.
