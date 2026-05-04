---
codex_run_protocol: 1
slice_id: 2026-05-04-slice-001-first-use-and-review-packets
status: approved
owner: chatgpt-planner
target_repo: HiroakiLion/Codex-Run-Ledger
target_branch: codex/2026-05-04-slice-001-first-use-and-review-packets
result_file: docs/codex-runs/2026-05-04-slice-001-first-use-and-review-packets-result.md
created_at: 2026-05-04T00:00:00+09:00
approved_at: 2026-05-04T09:08:56+09:00
---

# Codex Slice Prompt: First-Use Ergonomics Through Review Packets

## Goal

Improve the first-user experience for `codex-run-ledger` from installation through review handoff, covering the 0.1.1 through 0.2.0 roadmap shape without adding release, deploy, schema, mutation, or production actions.

Clarify both supported prompt-file workflows:

1. Manual ledger workflow: the user creates `docs/codex-runs/*-prompt.md` themselves, pastes the prompt, approves frontmatter, then runs ledger checks.
2. Agent-assisted workflow: the user pastes the prompt into Codex and asks Codex to create the approved `docs/codex-runs/*-prompt.md` file, run ledger checks, execute the slice, and write the paired result.

Make it clear that `codex-run-ledger` currently detects and checks prompt files; it does not yet automatically turn pasted chat text into a prompt file by itself. A Codex agent can do that because it edits files in the repo.

Focus on docs, templates, help text clarity, examples, and review-packet ergonomics. Keep runtime behavior conservative and do not broaden real execution or Git mutation behavior.

## Flow

1. Inspect current `main`, package metadata, CLI help, docs, tests, and examples.
2. Plan small subtask commits covering:
   - 0.1.1 first-use ergonomics
   - 0.1.2 prompt template generator planning or minimal safe implementation
   - 0.1.3 smoke-test fixtures/docs
   - 0.2.0 review packet polish
3. Keep changes tightly scoped to allowed files.
4. Prefer docs/tests/help text unless a small CLI improvement is clearly safe and covered by tests.
5. Add README/docs clarification for manual prompt-file creation versus Codex agent-assisted prompt-file creation.
6. Run verification after each meaningful implementation group when practical.
7. Push only if explicitly approved.
8. Do not deploy, tag, release, publish, merge, or create production automation.
9. Write the paired result file when done.

## Subtask Commits

### Commit 1: 0.1.1 First-Use Ergonomics

Suggested commit message: Improve First-Use Guidance

Scope:

- Improve README and docs for first-time npm users.
- Add a clear "How prompts get into the ledger" section.
- Explain manual workflow:
  - create `docs/codex-runs/<slice-id>-prompt.md`
  - paste the prompt
  - set `status: approved`
  - set `approved_at`
  - run `detect`, `dry-run`, and readiness checks
- Explain agent-assisted workflow:
  - paste the prompt into Codex
  - ask Codex to create the approved prompt file
  - ask Codex to run ledger checks
  - ask Codex to execute the bounded slice
  - ask Codex to write the paired result file
- Clarify that the package currently checks existing prompt files; it does not automatically convert pasted chat text into files without an agent or future command.
- Clarify `owner/repo` target repo examples.
- Add a short first-five-minutes path:
  - install
  - init
  - create or ask Codex to create prompt
  - detect
  - dry-run
  - readiness report
  - review
- Improve CLI help text if needed.
- Add focused tests only if CLI help/output changes.

Allowed files:

- `README.md`
- `docs/codex-runs/README.md`
- `docs/codex-runs/CHATGPT_PROMPT_HELPERS.md`
- `scripts/codex-runs/cli.mjs`
- `scripts/codex-runs/*.test.mjs`
- `CHANGELOG.md`

### Commit 2: 0.1.2 Prompt Template Generator

Suggested commit message: Add Prompt Template Guidance

Preferred low-risk scope:

- Add documentation for creating a valid first prompt.
- Add a copy/paste prompt template.
- Add an explicit note that this version may still require manual file creation or Codex-agent file creation.
- Explain future command direction, such as `prompt:new` or `prompt:write`, if not implemented yet.
- If implementation is small and safe, add a non-executing template command such as `prompt:new` only with tests.

Do not add any command that executes Codex, commits, pushes, opens PRs, deploys, tags, or publishes.

Allowed files:

- `README.md`
- `docs/codex-runs/README.md`
- `docs/codex-runs/PROTOCOL.md`
- `docs/codex-runs/CHATGPT_PROMPT_HELPERS.md`
- `scripts/codex-runs/cli.mjs`
- `scripts/codex-runs/init.mjs`
- `scripts/codex-runs/*.test.mjs`
- `CHANGELOG.md`

### Commit 3: 0.1.3 Smoke Test Fixtures

Suggested commit message: Document Smoke Test Workflow

Scope:

- Add fixture-style documentation for init -> prompt file -> detect -> dry-run -> result -> review.
- Include both paths:
  - manual creation of `*-prompt.md`
  - Codex-agent creation of `*-prompt.md`
- Include expected command outputs at a high level, not brittle full output.
- Keep fixtures docs-only unless existing tests can safely reuse temporary directories.
- Add tests only if new example behavior is implemented.

Allowed files:

- `README.md`
- `docs/codex-runs/README.md`
- `docs/codex-runs/PROTOCOL.md`
- `docs/codex-runs/0000-00-00-slice-000-example-prompt.md`
- `docs/codex-runs/0000-00-00-slice-000-example-result.md`
- New docs under `docs/codex-runs/`
- `scripts/codex-runs/*.test.mjs`
- `CHANGELOG.md`

### Commit 4: 0.2.0 Review Packet Polish

Suggested commit message: Polish Review Packet Guidance

Scope:

- Improve review handoff guidance for ChatGPT.
- Clarify what a good review packet should include:
  - prompt summary
  - result summary
  - verification evidence
  - changed files
  - unresolved risks
  - suggested next slice
- Clarify that the paired result file is written after execution, whether the prompt file was created manually or by Codex.
- If safe and well-tested, improve `review` markdown output labels without changing core semantics.
- Keep any behavior change backward compatible.

Allowed files:

- `README.md`
- `docs/codex-runs/README.md`
- `docs/codex-runs/CHATGPT_PROMPT_HELPERS.md`
- `docs/codex-runs/PROTOCOL.md`
- `scripts/codex-runs/review-summary-builder.mjs`
- `scripts/codex-runs/review-summary-builder.test.mjs`
- `CHANGELOG.md`

## Safety

Hard constraints:

- Do not publish to npm.
- Do not create or push git tags.
- Do not create a GitHub release.
- Do not deploy anything.
- Do not add Git commit, push, merge, PR, or branch mutation behavior to the tool.
- Do not broaden real Codex execution.
- Do not change prompt detection semantics unless explicitly required and covered by tests.
- Do not change forbidden branch defaults for `main` or `master`.
- Do not introduce hosted services, database dependencies, telemetry, or external runtime services.
- Do not change package name, CLI aliases, repository URL, license, or npm package identity.
- Do not overwrite existing result files.

## Allowed Files / Areas

Allowed:

- `README.md`
- `CHANGELOG.md`
- `docs/codex-runs/`
- `scripts/codex-runs/cli.mjs`
- `scripts/codex-runs/init.mjs`
- `scripts/codex-runs/review-summary-builder.mjs`
- `scripts/codex-runs/*.test.mjs`
- `package.json` only if scripts/help metadata must be updated

Not allowed:

- `.github/workflows/`
- release automation
- deployment files
- package publishing configuration
- unrelated runtime code
- repository settings
- generated package tarballs
- `.npm-cache/`

## Helpers

Use existing docs and code as source of truth:

- `README.md`
- `CHANGELOG.md`
- `docs/codex-runs/README.md`
- `docs/codex-runs/PROTOCOL.md`
- `docs/codex-runs/CHATGPT_PROMPT_HELPERS.md`
- `docs/codex-runs/REAL_EXECUTION_ENABLEMENT_POLICY.md`
- `docs/codex-runs/RELEASE_CHECKLIST.md`
- `scripts/codex-runs/cli.mjs`
- `scripts/codex-runs/init.mjs`
- `scripts/codex-runs/review-summary-builder.mjs`

Prefer existing local patterns. Keep docs plain and command examples copy/pasteable for PowerShell users.

## Checks

Run before final report:

- `npm.cmd test`
- `npm.cmd pack --dry-run --cache .\.npm-cache`
- `git diff --check`
- `git status --short --branch`

After `npm pack --dry-run`, remove `.npm-cache` if created.

If tests fail, fix within allowed scope or report the blocker.

## Push / Deploy / Tag

Push:

- Push only if explicitly approved after verification passes.

Deploy:

- No deploy.

Tag:

- Do not create or push a tag.

Release:

- Do not create a GitHub release.

npm:

- Do not publish.

## Run Ledger Rules

- Keep this prompt as a `*-prompt.md` file only after user approval.
- `status` must be changed from `draft` to `approved` only if the user explicitly approves execution.
- Set `approved_at` only when approved.
- Do not overwrite an existing result file.
- Codex must write the paired result file:
  - `docs/codex-runs/2026-05-04-slice-001-first-use-and-review-packets-result.md`
- Result file must include:
  - summary
  - subtask commits
  - files changed
  - commands run
  - verification results
  - deviations from prompt
  - known issues or risks
  - suggested next slice
  - branch and commit info

## Final Report

End with:

1. Summary of completed work.
2. Subtask commits created.
3. Files changed.
4. Verification commands and results.
5. Push status.
6. Confirmation that no deploy/tag/release/npm publish occurred.
7. Remaining risks or open decisions.
8. Recommended next parent slice.
