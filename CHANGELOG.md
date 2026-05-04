# Changelog

All notable changes to this project will be documented in this file.

This project uses semver-style version numbers, with human approval required before any public npm publish, tag, or GitHub release.

## 0.2.0 - Unreleased

- Clarified manual prompt-file creation versus Codex agent-assisted prompt-file creation.
- Added first-use guidance for getting from install to detect, dry-run, readiness, and review.
- Added a first prompt template and a `prompt:new` draft prompt helper.
- Added a smoke-test workflow for install, prompt creation, detect, dry-run, readiness, result, and review.
- Polished review packet guidance and markdown headings for changed files, commands, and known risks.
- Added a non-executing `prompt:new` helper for creating or printing draft prompt files with overwrite protection.

This version is prepared locally only. npm publish, the `v0.2.0` tag, and a GitHub release require separate human approval.

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
