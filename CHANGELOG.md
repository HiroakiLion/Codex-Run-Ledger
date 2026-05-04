# Changelog

All notable changes to this project will be documented in this file.

This project uses semver-style version numbers, with human approval required before any public npm publish, tag, or GitHub release.

## Unreleased

- Added a generic Codex Run Ledger review protocol for GPT/human review of completed runs.
- Updated initialization to copy `REVIEW_PROTOCOL.md` into the configured ledger prompt directory.
- Updated generated prompt templates, examples, prompt helpers, and review summaries to include review handoff guidance.

## 0.2.2 - 2026-05-05

- Fixed Windows real Codex execution by switching prompt transport from positional CLI argument to stdin (`-- -` in preview, `promptInput` as `input`).
- Kept command preview safety contract unchanged (`executable` remains `codex`, `usesShell: false`, `willExecute: false`).
- Preserved Windows wrapper execution through `cmd /d /c` while still passing stdin through the `spawnSync` `input` option.
- Updated tests to verify `-- -` preview shape and fake-runner stdin behavior, including Windows wrapper paths.
- No change to execution gates, branch policies, or mutating capabilities.

## 0.2.1 - 2026-05-04

- Fixed real Codex command execution on Windows by probing `codex.cmd` -> `codex.exe` -> `codex` and invoking `.cmd/.bat` commands through `cmd /d /c`.
- Added actionable recovery handling for spawn failures (`ENOENT`, `ENOEXEC`, `EACCES`) with clearer diagnostics when PATH or wrapper setup is wrong.
- Added regression tests for Windows command resolution and command wrapper construction.
- Kept command preview semantics and safety checks unchanged (`executable` remains `codex` in preview, non-invoking mode unchanged).
- Backward compatibility unchanged for macOS/Linux command resolution and behavior.

## 0.2.0 - 2026-05-04

- Clarified manual prompt-file creation versus Codex agent-assisted prompt-file creation.
- Added first-use guidance for getting from install to detect, dry-run, readiness, and review.
- Added a first prompt template and a `prompt:new` draft prompt helper.
- Added a smoke-test workflow for install, prompt creation, detect, dry-run, readiness, result, and review.
- Polished review packet guidance and markdown headings for changed files, commands, and known risks.
- Added a non-executing `prompt:new` helper for creating or printing draft prompt files with overwrite protection.

## 0.1.0 - 2026-05-04

Initial public release for `codex-run-ledger`.

- Added the Git-backed prompt/result ledger protocol for controlled Codex runs.
- Added CLI commands for initialization, prompt detection, dry-run planning, executor readiness, and review summaries.
- Added conservative safety defaults: skipped draft/canceled/example prompts, consumed prompts when a paired result exists, fail-closed handling for multiple runnable prompts, and forbidden `main`/`master` execution targets.
- Added explicit opt-in gates for real Codex execution.
- Added documentation for the protocol, ChatGPT prompt helpers, execution enablement policy, runner plan, Git execution design, and local executor invocation design.
- Added verification-only GitHub Actions CI for tests and package dry-run checks.
- Added first-user quickstart guidance for installing, initializing, checking readiness, and reviewing completed runs.
- Added a preparation-only release checklist for future tag, GitHub release, and npm publish decisions.
