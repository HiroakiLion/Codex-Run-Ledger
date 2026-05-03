import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import {
  detectCodexRunPrompts,
  renderJsonSummary
} from "./detect-approved-prompts.mjs";

test("skips example prompt", () => {
  const fixture = createFixture();
  writePrompt(fixture, "0000-00-00-slice-000-example", {
    body: "EXAMPLE ONLY - DO NOT RUN.",
    status: "canceled"
  });

  const result = detectFixture(fixture);

  assert.equal(result.promptFilesScanned, 1);
  assert.equal(result.runnable.length, 0);
  assert.equal(result.skipped.length, 1);
  assert.equal(result.skipped[0].reason, "example file");
  assert.equal(result.validationErrors.length, 0);
});

test("approved prompt without result is runnable", () => {
  const fixture = createFixture();
  writePrompt(fixture, "2026-05-02-slice-001-test-run", {
    status: "approved",
    approvedAt: "2026-05-02T00:01:00Z"
  });

  const result = detectFixture(fixture);

  assert.equal(result.validationErrors.length, 0);
  assert.equal(result.runnable.length, 1);
  assert.equal(result.runnable[0].sliceId, "2026-05-02-slice-001-test-run");
});

test("approved prompt targeting workbench is runnable", () => {
  const fixture = createFixture();
  writePrompt(fixture, "2026-05-02-slice-001-test-run", {
    approvedAt: "2026-05-02T00:01:00Z",
    status: "approved",
    targetBranch: "workbench"
  });

  const result = detectFixture(fixture);

  assert.equal(result.validationErrors.length, 0);
  assert.equal(result.runnable.length, 1);
  assert.equal(result.runnable[0].targetBranch, "workbench");
});

test("approved prompt with existing result is skipped", () => {
  const fixture = createFixture();
  const sliceId = "2026-05-02-slice-001-test-run";
  writePrompt(fixture, sliceId, {
    status: "approved",
    approvedAt: "2026-05-02T00:01:00Z"
  });
  writeFileSync(
    path.join(fixture.codexRunsDir, `${sliceId}-result.md`),
    "# Existing result\n"
  );

  const result = detectFixture(fixture);

  assert.equal(result.validationErrors.length, 0);
  assert.equal(result.runnable.length, 0);
  assert.equal(result.skipped.length, 1);
  assert.match(result.skipped[0].reason, /result file already exists/);
});

test("draft prompt is valid but not runnable", () => {
  const fixture = createFixture();
  writePrompt(fixture, "2026-05-02-slice-001-test-run", {
    status: "draft"
  });

  const result = detectFixture(fixture);

  assert.equal(result.validationErrors.length, 0);
  assert.equal(result.runnable.length, 0);
  assert.equal(result.skipped.length, 1);
  assert.match(result.skipped[0].reason, /draft/);
});

test("canceled prompt is valid but not runnable", () => {
  const fixture = createFixture();
  writePrompt(fixture, "2026-05-02-slice-001-test-run", {
    status: "canceled"
  });

  const result = detectFixture(fixture);

  assert.equal(result.validationErrors.length, 0);
  assert.equal(result.runnable.length, 0);
  assert.equal(result.skipped.length, 1);
  assert.match(result.skipped[0].reason, /canceled/);
});

test("approved prompt with null approved_at fails validation", () => {
  const fixture = createFixture();
  writePrompt(fixture, "2026-05-02-slice-001-test-run", {
    status: "approved"
  });

  const result = detectFixture(fixture);

  assert.equal(result.runnable.length, 0);
  assert.equal(result.validationErrors.length, 1);
  assert.match(result.validationErrors[0], /approved_at/);
});

test("filename and slice_id mismatch fails validation", () => {
  const fixture = createFixture();
  writePrompt(fixture, "2026-05-02-slice-001-test-run", {
    approvedAt: "2026-05-02T00:01:00Z",
    frontmatterOverrides: {
      slice_id: "2026-05-02-slice-999-wrong"
    },
    status: "approved"
  });

  const result = detectFixture(fixture);

  assert.equal(result.runnable.length, 0);
  assert.ok(result.validationErrors.some((error) => error.includes("slice_id")));
});

test("result_file mismatch fails validation", () => {
  const fixture = createFixture();
  writePrompt(fixture, "2026-05-02-slice-001-test-run", {
    approvedAt: "2026-05-02T00:01:00Z",
    frontmatterOverrides: {
      result_file: "docs/codex-runs/2026-05-02-slice-001-wrong-result.md"
    },
    status: "approved"
  });

  const result = detectFixture(fixture);

  assert.equal(result.runnable.length, 0);
  assert.ok(result.validationErrors.some((error) => error.includes("result_file")));
});

test("target_branch main fails validation", () => {
  const fixture = createFixture();
  writePrompt(fixture, "2026-05-02-slice-001-test-run", {
    approvedAt: "2026-05-02T00:01:00Z",
    status: "approved",
    targetBranch: "main"
  });

  const result = detectFixture(fixture);

  assert.equal(result.runnable.length, 0);
  assert.ok(result.validationErrors.some((error) => error.includes("must not be main") || error.includes("must not be master")));
});

test("target_branch master fails validation", () => {
  const fixture = createFixture();
  writePrompt(fixture, "2026-05-02-slice-001-test-run", {
    approvedAt: "2026-05-02T00:01:00Z",
    status: "approved",
    targetBranch: "master"
  });

  const result = detectFixture(fixture);

  assert.equal(result.runnable.length, 0);
  assert.ok(result.validationErrors.some((error) => error.includes("must not be main") || error.includes("must not be master")));
});

test("target_branch with shell control characters fails validation", () => {
  for (const char of [";", "&", "|", "`", "$", ">", "<"]) {
    const fixture = createFixture();
    writePrompt(fixture, "2026-05-02-slice-001-test-run", {
      approvedAt: "2026-05-02T00:01:00Z",
      status: "approved",
      targetBranch: `workbench${char}`
    });

    const result = detectFixture(fixture);

    assert.equal(result.runnable.length, 0);
    assert.ok(result.validationErrors.some((error) => error.includes("shell control")));
  }
});

test("target_branch with newline fails validation", () => {
  const fixture = createFixture();
  writePrompt(fixture, "2026-05-02-slice-001-test-run", {
    approvedAt: "2026-05-02T00:01:00Z",
    status: "approved",
    targetBranch: "workbench\\n"
  });

  const result = detectFixture(fixture);

  assert.equal(result.runnable.length, 0);
  assert.ok(result.validationErrors.some((error) => error.includes("shell control")));
});

test("bad filename fails validation", () => {
  const fixture = createFixture();
  writeFileSync(
    path.join(fixture.codexRunsDir, "bad-prompt.md"),
    buildPrompt("2026-05-02-slice-001-test-run", {
      approvedAt: "2026-05-02T00:01:00Z",
      status: "approved"
    })
  );

  const result = detectFixture(fixture);

  assert.equal(result.runnable.length, 0);
  assert.ok(
    result.validationErrors.some((error) =>
      error.includes("filename does not match required pattern")
    )
  );
});

test("missing frontmatter fails validation", () => {
  const fixture = createFixture();
  writeFileSync(
    path.join(fixture.codexRunsDir, "2026-05-02-slice-001-test-run-prompt.md"),
    "# Missing frontmatter\n"
  );

  const result = detectFixture(fixture);

  assert.equal(result.runnable.length, 0);
  assert.ok(
    result.validationErrors.some((error) =>
      error.includes("frontmatter is missing or malformed")
    )
  );
});

test("JSON output is parseable for one runnable approved prompt", () => {
  const fixture = createFixture();
  const sliceId = "2026-05-02-slice-001-test-run";
  writePrompt(fixture, sliceId, {
    approvedAt: "2026-05-02T00:01:00Z",
    status: "approved"
  });

  const payload = JSON.parse(renderJsonSummary(detectFixture(fixture)));

  assert.equal(payload.protocolVersion, 1);
  assert.equal(payload.summary.runnableApprovedPrompts, 1);
  assert.equal(payload.runnable[0].sliceId, sliceId);
  assert.equal(payload.errors.length, 0);
});

test("JSON output includes skipped examples and existing result files", () => {
  const fixture = createFixture();
  const sliceId = "2026-05-02-slice-001-test-run";
  writePrompt(fixture, "0000-00-00-slice-000-example", {
    body: "EXAMPLE ONLY - DO NOT RUN.",
    status: "canceled"
  });
  writePrompt(fixture, sliceId, {
    approvedAt: "2026-05-02T00:01:00Z",
    status: "approved"
  });
  writeFileSync(
    path.join(fixture.codexRunsDir, `${sliceId}-result.md`),
    "# Existing result\n"
  );

  const payload = JSON.parse(renderJsonSummary(detectFixture(fixture)));

  assert.equal(payload.summary.skippedPrompts, 2);
  assert.ok(payload.skipped.some((item) => item.reason === "example file"));
  assert.ok(
    payload.skipped.some((item) =>
      item.reason.includes("result file already exists")
    )
  );
});

test("JSON output includes validation errors and remains parseable", () => {
  const fixture = createFixture();
  writeFileSync(
    path.join(fixture.codexRunsDir, "bad-prompt.md"),
    "# Missing frontmatter\n"
  );

  const detection = detectFixture(fixture);
  const payload = JSON.parse(renderJsonSummary(detection));

  assert.ok(detection.validationErrors.length > 0);
  assert.ok(payload.summary.validationErrors > 0);
  assert.equal(payload.errors.length, detection.validationErrors.length);
  assert.ok(payload.errors[0].message.length > 0);
});

test("selecting existing runnable slice returns selected prompt", () => {
  const fixture = createFixture();
  const sliceId = "2026-05-02-slice-001-test-run";
  writePrompt(fixture, sliceId, {
    approvedAt: "2026-05-02T00:01:00Z",
    status: "approved"
  });

  const result = detectFixture(fixture, { sliceId });

  assert.equal(result.selectedSliceId, sliceId);
  assert.equal(result.selected.runnable, true);
  assert.equal(result.selected.promptFile, `docs/codex-runs/${sliceId}-prompt.md`);
  assert.equal(result.selectionErrors.length, 0);
});

test("selecting completed slice reports paired result reason", () => {
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

  const result = detectFixture(fixture, { sliceId });

  assert.equal(result.selected.runnable, false);
  assert.match(result.selected.reason, /paired result file already exists/);
  assert.equal(result.selectionErrors.length, 1);
});

test("selecting canceled slice reports status reason", () => {
  const fixture = createFixture();
  const sliceId = "2026-05-02-slice-001-test-run";
  writePrompt(fixture, sliceId, {
    status: "canceled"
  });

  const result = detectFixture(fixture, { sliceId });

  assert.equal(result.selected.runnable, false);
  assert.match(result.selected.reason, /status is canceled/);
});

test("selecting missing slice errors clearly", () => {
  const fixture = createFixture();

  const result = detectFixture(fixture, {
    sliceId: "2026-05-02-slice-404-missing-run"
  });

  assert.equal(result.selected.state, "missing");
  assert.match(result.selectionErrors[0], /not found/);
});

test("unsafe slice id is rejected", () => {
  const fixture = createFixture();

  assert.throws(
    () => detectFixture(fixture, { sliceId: "2026-05-02-slice-001-test;run" }),
    /Invalid slice id/
  );
});

function createFixture() {
  const rootDir = mkdtempSync(path.join(tmpdir(), "a target repo-codex-runs-"));
  const codexRunsDir = path.join(rootDir, "docs", "codex-runs");
  mkdirSync(codexRunsDir, { recursive: true });

  return { codexRunsDir, rootDir };
}

function detectFixture(fixture, options = {}) {
  return detectCodexRunPrompts({
    ...options,
    dir: fixture.codexRunsDir,
    rootDir: fixture.rootDir
  });
}

function writePrompt(fixture, sliceId, options = {}) {
  writeFileSync(
    path.join(fixture.codexRunsDir, `${sliceId}-prompt.md`),
    buildPrompt(sliceId, options)
  );
}

function buildPrompt(sliceId, options = {}) {
  const status = options.status ?? "draft";
  const frontmatter = {
    codex_run_protocol: "1",
    slice_id: sliceId,
    status,
    owner: "chatgpt-planner",
    target_repo: "example-repo",
    target_branch: options.targetBranch ?? `codex/${sliceId}`,
    result_file: `docs/codex-runs/${sliceId}-result.md`,
    created_at: "2026-05-02T00:00:00Z",
    approved_at: options.approvedAt ?? null,
    ...(options.frontmatterOverrides ?? {})
  };

  const yaml = Object.entries(frontmatter)
    .map(([key, value]) => `${key}: ${value === null ? "null" : value}`)
    .join("\n");

  return `---\n${yaml}\n---\n\n# Codex Slice Prompt: ${sliceId}\n\n${
    options.body ?? "Fixture prompt."
  }\n`;
}
