# ChatGPT Prompt Helpers

These helper prompts are meant for the planning side of Codex Run Ledger: a Git-backed prompt/result ledger for reliable, reviewable, and traceable autonomous Codex runs. They help ChatGPT propose bounded autonomous slices before any official `*-prompt.md` file is created.

The normal loop is:

1. Ask ChatGPT to propose 3-5 possible slices.
2. Choose one slice.
3. Ask ChatGPT to turn the approved slice into a Codex-ready parent-slice prompt.
4. Save that prompt as an approved `docs/codex-runs/*-prompt.md` file, or paste it into Codex and ask Codex to create that file.
5. Run `codex-run-ledger detect`, `dry-run`, and `executor --readiness-report`.
6. After Codex writes a result, ask ChatGPT to review the slice evidence.

The CLI currently works from saved prompt files. If you paste the prompt into Codex, Codex is responsible for creating the ledger file before running the checks.

For a starter file shape, use `FIRST_PROMPT_TEMPLATE.md`.

## Propose Next Slices

Use this when you are not sure what Codex should do next.

```text
Analyze the current repo, roadmap, open ledger artifacts, and recent state. Identify where we are now, then propose 3-5 next autonomous Codex parent slices that are big enough for 1-2 hours of work but still safely bounded.

For each option, include:
- slice name
- goal
- scope
- why now
- why not now
- risk level
- expected files/areas
- verification/deploy needs
- likely tag name if applicable
- suggested target branch
- whether the slice should require extra review

Use our standard parent-slice flow when judging whether a slice is well shaped:
- clear parent goal
- subtask commits
- verification
- push workbench/main if allowed
- deploy/restart if applicable
- create/push tag if applicable
- final report

End with your recommended next slice and the reason it should go first.

Do not write an official Codex Run Ledger prompt yet. First present the options and recommend one. After I approve one option, wait for my confirmation before writing the full Codex-ready parent-slice prompt.
```

## Write A Codex-Ready Parent Slice Prompt

Use this only after you have selected one proposed slice.

```text
Using the approved slice option, write a concise but complete Codex-ready autonomous parent-slice prompt.

Make it specific enough that Codex can work autonomously without guessing, but bounded enough that unsafe or unrelated work is clearly out of scope.

Include:
- parent slice name
- repository path and target branch
- current known baseline, if known
- parent goal
- standard autonomous flow
- subtask commit plan with suggested commit messages
- hard safety constraints
- expected files and areas
- existing helpers or APIs to reuse
- required verification before push
- push/deploy/tag rules, if applicable
- runtime checks, if applicable
- final report format

Also include Codex Run Ledger requirements:
- required frontmatter
- exact slice_id
- status approved only if I explicitly approved the slice
- result_file path
- explicit Allowed Files / Areas
- explicit Out of Scope
- instruction not to overwrite existing result files

Do not broaden the scope beyond the approved option. Do not add deployment, tagging, schema changes, runtime mutation, or production actions unless they were explicitly approved for this slice.
```

## Minimal Prompt Writer

Use this when you want a smaller docs-only or low-risk prompt.

```text
Using the approved slice option, write a complete Codex Run Ledger `*-prompt.md` file.

Keep it concise. Include required frontmatter, Objective, Scope, Out of Scope, Allowed Files / Areas, Required Changes, Acceptance Criteria, Verification Commands, Risk Level, Review Requirement, Result File Instructions, and Commit / Push Instructions.

Keep Allowed Files / Areas explicit and narrow. Do not broaden the scope beyond the approved option.
```

## Review A Completed Slice

Use this after a result file, attempt artifact, or verification artifact exists.

```text
Review the completed Codex Run Ledger slice using the prompt, result file, verification artifact, attempt artifacts, repo diff, and test output.

Lead with issues, risks, or mismatches between the prompt and result. Then summarize the prompt, result, changed files, commands run, verification evidence, unresolved risks, and recommended next action.

Treat the paired result file as the durable receipt whether the prompt file was created manually or by Codex. Do not propose the next official prompt until the current slice evidence has been reviewed.
```
