# Smoke Test Workflow

Use this walkthrough to test a fresh install in another repository before trusting larger Codex runs.

## 1. Install And Initialize

From the target repository:

```sh
npm install --save-dev codex-run-ledger
npx codex-run-ledger init --target-repo owner/repo
```

Expected result:

- `codex-run-ledger.config.json` exists.
- `docs/codex-runs/README.md` exists.
- No prompt is runnable yet.

## 2. Create A Tiny Prompt

Choose one path.

Template command path:

```sh
npx codex-run-ledger prompt:new --slice-id YYYY-MM-DD-slice-001-smoke-test
```

Then edit `docs/codex-runs/YYYY-MM-DD-slice-001-smoke-test-prompt.md`, fill in the body, set `status: approved`, and set `approved_at` after human approval.

Manual path:

1. Copy `FIRST_PROMPT_TEMPLATE.md`.
2. Save it as `docs/codex-runs/YYYY-MM-DD-slice-001-smoke-test-prompt.md`.
3. Set `slice_id` and `result_file` to match the filename.
4. Set `target_repo` to `owner/repo`.
5. Set `status: approved` and `approved_at`.

Agent-assisted path:

Paste the prompt into Codex and ask:

```text
Create the approved Codex Run Ledger prompt file under docs/codex-runs/, run detect, dry-run, and readiness checks, execute only the bounded smoke-test slice, then write the paired result file.
```

Expected result:

- Exactly one non-example approved prompt exists.
- The paired result file does not exist yet.
- `prompt:new`, if used, created only the prompt file and did not run Codex.

## 3. Detect And Preview

```sh
npx codex-run-ledger detect
npx codex-run-ledger dry-run --slice-id YYYY-MM-DD-slice-001-smoke-test
```

Expected result:

- `detect` reports one runnable approved prompt.
- `dry-run` selects the requested slice.
- No files are executed or overwritten by the dry-run.

## 4. Check Readiness

```sh
npx codex-run-ledger executor --slice-id YYYY-MM-DD-slice-001-smoke-test --readiness-report
```

Expected result:

- Readiness explains whether real execution is allowed.
- Missing flags, dirty trees, branch mismatches, or unsupported scope are reported as blockers.
- No Codex execution occurs from the readiness report alone.

## 5. Execute And Write The Result

If using Codex as the agent, ask Codex to follow the approved prompt and write:

```text
docs/codex-runs/YYYY-MM-DD-slice-001-smoke-test-result.md
```

Expected result:

- The result file records summary, files changed, commands run, verification, risks, and next slice.
- The prompt is now consumed because its paired result file exists.

## 6. Build The Review Packet

```sh
npx codex-run-ledger review --slice-id YYYY-MM-DD-slice-001-smoke-test --markdown
```

Expected result:

- The review summary names the prompt and result.
- It summarizes changed files, verification evidence, known risks, and recommended next action.

## Cleanup

Keep the prompt/result pair if it documents a real smoke test. If it was only experimental and should not be part of repo history, remove it before committing.
