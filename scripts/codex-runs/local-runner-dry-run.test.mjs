import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import {
  buildLocalRunnerDryRunPlan,
  renderJsonOutput
} from "./local-runner-dry-run.mjs";

test("zero runnable prompts exits with no plan", () => {
  const fixture = createFixture();
  writePrompt(fixture, "0000-00-00-slice-000-example", {
    body: "EXAMPLE ONLY - DO NOT RUN.",
    status: "canceled"
  });

  const result = runFixture(fixture);

  assert.equal(result.codexExecutionEnabled, false);
  assert.equal(result.errors.length, 0);
  assert.equal(result.plan, null);
});

test("one approved prompt without result produces a plan", () => {
  const fixture = createFixture();
  const sliceId = "2026-05-02-slice-001-test-run";
  writePrompt(fixture, sliceId, {
    approvedAt: "2026-05-02T00:01:00Z",
    status: "approved"
  });

  const result = runFixture(fixture);

  assert.equal(result.codexExecutionEnabled, false);
  assert.equal(result.errors.length, 0);
  assert.equal(result.plan?.sliceId, sliceId);
  assert.equal(result.plan?.resultFile, `docs/codex-runs/${sliceId}-result.md`);
});

test("approved prompt with existing result produces no plan", () => {
  const fixture = createFixture();
  const sliceId = "2026-05-02-slice-001-test-run";
  writePrompt(fixture, sliceId, {
    approvedAt: "2026-05-02T00:01:00Z",
    status: "approved"
  });
  writeFileSync(
    path.join(fixture.codexRunsDir, `${sliceId}-result.md`),
    "# Existing result\n"
  );

  const result = runFixture(fixture);

  assert.equal(result.errors.length, 0);
  assert.equal(result.plan, null);
  assert.equal(result.summary.runnableApprovedPrompts, 0);
});

test("multiple runnable prompts fail closed by default", () => {
  const fixture = createFixture();
  writePrompt(fixture, "2026-05-02-slice-001-test-run", {
    approvedAt: "2026-05-02T00:01:00Z",
    status: "approved"
  });
  writePrompt(fixture, "2026-05-02-slice-002-test-run", {
    approvedAt: "2026-05-02T00:02:00Z",
    status: "approved"
  });

  const result = runFixture(fixture);

  assert.equal(result.plan, null);
  assert.ok(
    result.errors.some((error) =>
      error.message.includes("Multiple runnable approved prompts")
    )
  );
});

test("multiple runnable prompts with allowMultiple reports candidates only", () => {
  const fixture = createFixture();
  writePrompt(fixture, "2026-05-02-slice-001-test-run", {
    approvedAt: "2026-05-02T00:01:00Z",
    status: "approved"
  });
  writePrompt(fixture, "2026-05-02-slice-002-test-run", {
    approvedAt: "2026-05-02T00:02:00Z",
    status: "approved"
  });

  const result = runFixture(fixture, { allowMultiple: true });

  assert.equal(result.codexExecutionEnabled, false);
  assert.equal(result.errors.length, 0);
  assert.equal(result.plan, null);
  assert.equal(result.candidates.length, 2);
});

test("multiple runnable prompts with slice id selects requested prompt", () => {
  const fixture = createFixture();
  const selectedSliceId = "2026-05-02-slice-002-test-run";
  writePrompt(fixture, "2026-05-02-slice-001-test-run", {
    approvedAt: "2026-05-02T00:01:00Z",
    status: "approved"
  });
  writePrompt(fixture, selectedSliceId, {
    approvedAt: "2026-05-02T00:02:00Z",
    status: "approved"
  });

  const result = runFixture(fixture, { sliceId: selectedSliceId });

  assert.equal(result.errors.length, 0);
  assert.equal(result.summary.runnableApprovedPrompts, 2);
  assert.equal(result.plan?.sliceId, selectedSliceId);
  assert.equal(result.candidates.length, 1);
});

test("slice id for non-runnable prompt fails closed", () => {
  const fixture = createFixture();
  const sliceId = "2026-05-02-slice-001-test-run";
  writePrompt(fixture, sliceId, {
    status: "canceled"
  });

  const result = runFixture(fixture, { sliceId });

  assert.equal(result.plan, null);
  assert.ok(result.errors.some((error) => error.message.includes("status is canceled")));
});

test("slice id for missing prompt fails closed", () => {
  const fixture = createFixture();

  const result = runFixture(fixture, {
    sliceId: "2026-05-02-slice-404-missing-run"
  });

  assert.equal(result.plan, null);
  assert.ok(result.errors.some((error) => error.message.includes("not found")));
});

test("unsafe slice id is rejected", () => {
  const fixture = createFixture();

  assert.throws(
    () => runFixture(fixture, { sliceId: "2026-05-02-slice-001-test|run" }),
    /Invalid slice id/
  );
});

test("detector validation errors cause runner failure", () => {
  const fixture = createFixture();
  writeFileSync(
    path.join(fixture.codexRunsDir, "bad-prompt.md"),
    "# Missing frontmatter\n"
  );

  const result = runFixture(fixture);

  assert.equal(result.plan, null);
  assert.ok(
    result.errors.some((error) => error.source === "detector_validation")
  );
});

test("JSON output is parseable", () => {
  const fixture = createFixture();
  writePrompt(fixture, "2026-05-02-slice-001-test-run", {
    approvedAt: "2026-05-02T00:01:00Z",
    status: "approved"
  });

  const payload = JSON.parse(renderJsonOutput(runFixture(fixture)));

  assert.equal(payload.runnerProtocolVersion, 1);
  assert.equal(payload.codexExecutionEnabled, false);
  assert.equal(payload.plan.sliceId, "2026-05-02-slice-001-test-run");
});

function createFixture() {
  const rootDir = mkdtempSync(path.join(tmpdir(), "a target repo-local-runner-"));
  const codexRunsDir = path.join(rootDir, "docs", "codex-runs");
  mkdirSync(codexRunsDir, { recursive: true });

  return { codexRunsDir, rootDir };
}

function runFixture(fixture, options = {}) {
  return buildLocalRunnerDryRunPlan({
    ...options,
    dir: fixture.codexRunsDir,
    rootDir: fixture.rootDir
  });
}

function writePrompt(fixture, sliceId, options = {}) {
  const status = options.status ?? "draft";
  const frontmatter = {
    codex_run_protocol: "1",
    slice_id: sliceId,
    status,
    owner: "chatgpt-planner",
    target_repo: "example-repo",
    target_branch: `codex/${sliceId}`,
    result_file: `docs/codex-runs/${sliceId}-result.md`,
    created_at: "2026-05-02T00:00:00Z",
    approved_at: options.approvedAt ?? null
  };
  const yaml = Object.entries(frontmatter)
    .map(([key, value]) => `${key}: ${value === null ? "null" : value}`)
    .join("\n");

  writeFileSync(
    path.join(fixture.codexRunsDir, `${sliceId}-prompt.md`),
    `---\n${yaml}\n---\n\n# Codex Slice Prompt: ${sliceId}\n\n${
      options.body ?? "Fixture prompt."
    }\n`
  );
}
