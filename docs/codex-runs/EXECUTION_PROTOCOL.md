# Codex Run Ledger Execution Protocol

This is the default execution protocol for this repository.

Keep this file in version control and treat it as part of the slice contract.

## Purpose

This protocol defines a safe default execution flow for Codex-enabled slices in this repository.
Projects with richer policy needs should create a repo-specific execution protocol instead of editing this one directly for every run.

If you need repo-specific rules, create:

```text
docs/codex-runs/<REPO_NAME>_CODEX_EXECUTION_PROTOCOL.md
```

and keep prompts pointing to that file when needed.

## Default Branch Expectations

- Use the repo's active integration branch as defined by the approved prompt or local repo policy.
- Do not assume `main` (or `master`) is writable.
- Do not push to stable branches unless explicitly approved.
- If a slice requires a dedicated branch, follow the existing harness defaults (for example `codex/<slice-id>`).

## Standard Slice Flow

For each runnable slice:

1. Create or approve an existing `*-prompt.md` artifact.
2. Run `detect`, `dry-run`, and readiness checks.
3. Execute the bounded slice in the same run when checks pass.
4. Write the paired `*-result.md`.
5. Produce optional/required review packet `*-review.md` as requested by repo policy.
6. Run required checks and fix failures before marking completion.
7. Commit allowed changes only.
8. Push only if checks pass and policy allows it.
9. End with a clean working tree.

## Artifact Naming

- `*-prompt.md`: approved executable prompt artifact (source-of-truth instruction packet).
- `*-result.md`: required execution result packet.
- `*-review.md`: review packet (required for higher-risk slices; commit with result and prompt for docs-only unless policy allows defer).

## Result Packet Rules

- The result packet is part of the deliverable and should be committed with the prompt and any code changes.
- Do not leave the result packet untracked.
- Final chat response should include the final pushed SHA when available.
- The result artifact should not embed its own final commit SHA if that causes amend loops.
  A safe pattern is:

```text
Final pushed SHA is recorded in the final response.
```

## Safety

- No production actions unless explicitly approved for that slice.
- No deployment, tag, schema migration, data mutation, or environment changes unless explicitly approved.
- No force-push unless explicitly approved.
- If push fails, stop and report unless the prompt explicitly allows a safe retry/rebase path.

## Repo-Specific Customization

Projects can add a repo-specific execution protocol to document:

- branch model and integration policy,
- deploy or schema restrictions,
- review packet requirement level per risk,
- environment-variable and data mutation constraints,
- whether docs-only slices may write directly to integration branches,
- whether runtime/code slices require isolated branches or PR workflows.

Use this default protocol for repositories that do not yet define their own rules, and prefer the repo-specific protocol whenever it exists.
