import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import {
  buildReviewSummaryPacket,
  deriveReviewSummaryArtifactPath,
  renderReviewSummaryMarkdown,
  runReviewSummaryBuilderCli,
  writeReviewSummaryArtifact
} from "./review-summary-builder.mjs";

test("completed result with passing verification recommends ChatGPT review", () => {
  const rootDir = createFixture();
  const sliceId = "2026-05-02-slice-021-review-summary-packets";

  writePrompt(rootDir, sliceId, "approved");
  writeResult(rootDir, sliceId, "completed");
  writeVerification(rootDir, sliceId, true);

  const packet = buildReviewSummaryPacket({ rootDir, sliceId });

  assert.equal(packet.resultExists, true);
  assert.equal(packet.resultStatus, "completed");
  assert.equal(packet.verificationSummary.passed, true);
  assert.equal(packet.recommendedNextAction, "ready_for_chatgpt_review");
  assert.equal(packet.runnableStatus, "completed");
  assert.equal(packet.reviewProtocolFile, "docs/codex-runs/REVIEW_PROTOCOL.md");
});

test("result without verification artifact still produces packet with warning", () => {
  const rootDir = createFixture();
  const sliceId = "2026-05-02-slice-021-review-summary-packets";

  writePrompt(rootDir, sliceId, "approved");
  writeResult(rootDir, sliceId, "completed");

  const packet = buildReviewSummaryPacket({ rootDir, sliceId });

  assert.equal(packet.verificationArtifactFile, null);
  assert.equal(packet.recommendedNextAction, "ready_for_chatgpt_review");
  assert.ok(packet.warnings.some((warning) => warning.includes("without a verification")));
});

test("blocked attempt artifact without result recommends human decision", () => {
  const rootDir = createFixture();
  const sliceId = "2026-05-02-slice-020-blocked-attempt-artifact-live-test";

  writePrompt(rootDir, sliceId, "approved");
  writeAttempt(rootDir, sliceId, 1, "blocked", "docs-only flag missing");

  const packet = buildReviewSummaryPacket({ rootDir, sliceId });

  assert.equal(packet.resultExists, false);
  assert.equal(packet.latestAttemptStatus, "blocked");
  assert.equal(packet.runnableStatus, "blocked/no-result");
  assert.equal(packet.recommendedNextAction, "blocked_needs_human_decision");
});

test("canceled prompt recommends no action", () => {
  const rootDir = createFixture();
  const sliceId = "2026-05-02-slice-020-blocked-attempt-artifact-live-test";

  writePrompt(rootDir, sliceId, "canceled");

  const packet = buildReviewSummaryPacket({ rootDir, sliceId });

  assert.equal(packet.promptStatus, "canceled");
  assert.equal(packet.runnableStatus, "canceled");
  assert.equal(packet.recommendedNextAction, "canceled_no_action");
});

test("approved prompt without result or attempts recommends pending execution", () => {
  const rootDir = createFixture();
  const sliceId = "2026-05-02-slice-021-review-summary-packets";

  writePrompt(rootDir, sliceId, "approved");

  const packet = buildReviewSummaryPacket({ rootDir, sliceId });

  assert.equal(packet.runnableStatus, "runnable");
  assert.equal(packet.recommendedNextAction, "pending_execution");
});

test("multiple attempt artifacts choose latest by attempt number", () => {
  const rootDir = createFixture();
  const sliceId = "2026-05-02-slice-019-durable-attempt-artifacts";

  writePrompt(rootDir, sliceId, "approved");
  writeAttempt(rootDir, sliceId, 1, "blocked", "dirty tree");
  writeAttempt(rootDir, sliceId, 2, "failed", "missing result");

  const packet = buildReviewSummaryPacket({ rootDir, sliceId });

  assert.equal(packet.latestAttempt.attemptNumber, 2);
  assert.equal(packet.latestAttemptStatus, "failed");
  assert.equal(packet.recommendedNextAction, "needs_retry_prompt");
});

test("missing prompt file fails clearly", () => {
  const rootDir = createFixture();

  assert.throws(
    () =>
      buildReviewSummaryPacket({
        rootDir,
        sliceId: "2026-05-02-slice-021-review-summary-packets"
      }),
    /Prompt file not found/
  );
});

test("unsafe slice id is rejected before path lookup", () => {
  const rootDir = createFixture();

  assert.throws(
    () =>
      buildReviewSummaryPacket({
        rootDir,
        sliceId: "2026-05-02-slice-021-review-summary;packets"
      }),
    /Invalid slice id/
  );
});

test("review summary artifact path is derived from slice id under docs codex-runs", () => {
  assert.equal(
    deriveReviewSummaryArtifactPath("2026-05-02-slice-021-review-summary-packets"),
    "docs/codex-runs/2026-05-02-slice-021-review-summary-packets-review.md"
  );

  assert.throws(() => deriveReviewSummaryArtifactPath("../outside"), /Invalid slice id/);
});

test("existing review summary blocks overwrite", () => {
  const rootDir = createFixture();
  const sliceId = "2026-05-02-slice-021-review-summary-packets";

  writePrompt(rootDir, sliceId, "approved");
  const reviewPath = path.join(rootDir, "docs", "codex-runs", `${sliceId}-review.md`);
  writeFileSync(reviewPath, "existing\n");

  const result = writeReviewSummaryArtifact({ rootDir, sliceId });

  assert.equal(result.wrote, false);
  assert.match(result.reason, /already exists/);
  assert.equal(readFileSync(reviewPath, "utf8"), "existing\n");
});

test("JSON output is parseable", () => {
  const rootDir = createFixture();
  const sliceId = "2026-05-02-slice-021-review-summary-packets";

  writePrompt(rootDir, sliceId, "approved");

  const result = runReviewSummaryBuilderCli(["--slice-id", sliceId, "--json"], {
    rootDir
  });
  const payload = JSON.parse(result.stdout);

  assert.equal(result.exitCode, 0);
  assert.equal(payload.sliceId, sliceId);
});

test("markdown output contains concise review sections", () => {
  const rootDir = createFixture();
  const sliceId = "2026-05-02-slice-021-review-summary-packets";

  writePrompt(rootDir, sliceId, "approved");
  writeResult(rootDir, sliceId, "completed");
  const markdown = renderReviewSummaryMarkdown(buildReviewSummaryPacket({ rootDir, sliceId }));

  for (const heading of [
    "## Status",
    "## Summary",
    "## Files",
    "## Changed Files",
    "## Verification",
    "## Attempts",
    "## Commands Run",
    "## Known Issues / Risks",
    "## Recommended Next Action"
  ]) {
    assert.ok(markdown.includes(heading), `missing ${heading}`);
  }

  assert.ok(markdown.includes("- Review protocol: docs/codex-runs/REVIEW_PROTOCOL.md"));
});

test("write-review-summary writes once under docs codex-runs", () => {
  const rootDir = createFixture();
  const sliceId = "2026-05-02-slice-021-review-summary-packets";

  writePrompt(rootDir, sliceId, "approved");

  const result = writeReviewSummaryArtifact({ rootDir, sliceId });
  const reviewPath = path.join(rootDir, result.path);

  assert.equal(result.wrote, true);
  assert.equal(result.path, `docs/codex-runs/${sliceId}-review.md`);
  assert.equal(existsSync(reviewPath), true);
  assert.ok(readFileSync(reviewPath, "utf8").includes("Codex Review Summary"));
});

test("does not reference app runtime paths or git mutation commands", () => {
  const source = readFileSync(
    new URL("./review-summary-builder.mjs", import.meta.url),
    "utf8"
  );

  assert.equal(source.includes("apps/"), false);
  assert.equal(source.includes("packages/"), false);
  assert.equal(source.includes("git commit"), false);
  assert.equal(source.includes("git push"), false);
});

function createFixture() {
  const rootDir = mkdtempSync(path.join(tmpdir(), "a target repo-review-summary-"));

  mkdirSync(path.join(rootDir, "docs", "codex-runs"), { recursive: true });

  return rootDir;
}

function writePrompt(rootDir, sliceId, status) {
  writeFileSync(
    path.join(rootDir, "docs", "codex-runs", `${sliceId}-prompt.md`),
    `---
codex_run_protocol: 1
slice_id: ${sliceId}
status: ${status}
owner: chatgpt-planner
target_repo: example-repo
target_branch: workbench
result_file: docs/codex-runs/${sliceId}-result.md
created_at: 2026-05-02T00:00:00Z
approved_at: 2026-05-02T00:01:00Z
---

# Codex Slice Prompt: ${sliceId}
`
  );
}

function writeResult(rootDir, sliceId, status) {
  writeFileSync(
    path.join(rootDir, "docs", "codex-runs", `${sliceId}-result.md`),
    `---
codex_run_protocol: 1
slice_id: ${sliceId}
status: ${status}
owner: codex-worker
source_prompt: docs/codex-runs/${sliceId}-prompt.md
branch: workbench
commit_sha: null
started_at: 2026-05-03T00:00:00.000Z
completed_at: 2026-05-03T00:01:00.000Z
---

# Codex Slice Result: ${sliceId}

## Summary

Completed.

## Files Changed

- scripts/codex-runs/review-summary-builder.mjs

## Commands Run

- git diff --check

## Verification Results

Passed.

## Deployment / Runtime Results

None.

## Deviations From Prompt

None.

## Known Issues / Risks

- Review remains manual.

## Suggested Next Slice

None.

## Commit / Branch Info

Not committed.
`
  );
}

function writeVerification(rootDir, sliceId, passed) {
  writeFileSync(
    path.join(rootDir, "docs", "codex-runs", `${sliceId}-verification.json`),
    `${JSON.stringify(
      {
        verificationArtifactVersion: 1,
        sliceId,
        promptFile: `docs/codex-runs/${sliceId}-prompt.md`,
        resultFile: `docs/codex-runs/${sliceId}-result.md`,
        createdAt: "2026-05-03T00:00:00.000Z",
        verification: {
          executorVerificationVersion: 1,
          ran: true,
          passed,
          failedCommandCount: passed ? 0 : 1,
          commands: [
            {
              command: "git diff --check",
              passed,
              exitCode: passed ? 0 : 1
            }
          ]
        }
      },
      null,
      2
    )}\n`
  );
}

function writeAttempt(rootDir, sliceId, attemptNumber, status, reason) {
  writeFileSync(
    path.join(
      rootDir,
      "docs",
      "codex-runs",
      `${sliceId}-attempt-${String(attemptNumber).padStart(3, "0")}.json`
    ),
    `${JSON.stringify(
      {
        attemptArtifactVersion: 1,
        sliceId,
        attemptNumber,
        createdAt: "2026-05-03T00:00:00.000Z",
        promptFile: `docs/codex-runs/${sliceId}-prompt.md`,
        resultFile: `docs/codex-runs/${sliceId}-result.md`,
        verificationArtifactFile: null,
        status,
        stage: status === "blocked" ? "preflight" : "result_check",
        codexInvoked: status !== "blocked",
        resultFileCreated: false,
        verificationRan: false,
        verificationArtifactCreated: false,
        reason,
        blockers: [reason]
      },
      null,
      2
    )}\n`
  );
}
