# Release Checklist

This checklist prepares a future release. It does not authorize publishing, tagging, or creating a GitHub release.

## Pre-Publish Checks

Run these from a clean working tree:

```sh
git status --short --branch
npm test
npm pack --dry-run
```

Review package metadata before any publish:

- `package.json` name remains `codex-run-ledger`.
- `package.json` repository URL points to `HiroakiLion/Codex-Run-Ledger`.
- CLI aliases remain `codex-run-ledger` and `crl`.
- Package contents from `npm pack --dry-run` contain only intended docs, scripts, config example, README, and license files.
- `CHANGELOG.md` describes the release clearly.

Before publishing, check npm state manually:

```sh
npm whoami
npm view codex-run-ledger
```

If the package does not exist yet, `npm view codex-run-ledger` is expected to fail with a not-found response. Treat any existing package response as a blocker until ownership and intent are confirmed.

## Required Human Approvals

These actions are separate release decisions and require explicit approval:

- Create or push `v0.1.0`.
- Create a GitHub release.
- Publish to npm.
- Enable npm provenance or other publish-time options.

Do not combine these actions with documentation or CI polish unless the user explicitly approves that broader release slice.

## Suggested Release Order

1. Confirm the working tree is clean.
2. Run `npm test`.
3. Run `npm pack --dry-run`.
4. Review the packed file list and package metadata.
5. Confirm npm authentication and package-name state.
6. Ask for explicit approval before creating a tag, GitHub release, or npm publish.
