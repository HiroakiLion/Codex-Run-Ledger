import assert from "node:assert/strict";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  writeFileSync
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import {
  buildLocalExecutorPlan,
  renderJsonOutput
} from "./local-executor.mjs";

test("zero runnable prompts exits safely", () => {
  const fixture = createFixture();
  writePrompt(fixture, "0000-00-00-slice-000-example", {
    body: "EXAMPLE ONLY - DO NOT RUN.",
    status: "canceled"
  });

  const result = runFixture(fixture);

  assert.equal(result.plan, null);
  assert.equal(result.codexExecutionEnabled, false);
  assert.equal(result.summary.wouldExecute, false);
  assert.equal(result.errors.length, 0);
});

test("one runnable prompt produces gated plan but does not execute", () => {
  const fixture = createFixture();
  const sliceId = "2026-05-02-slice-001-test-run";
  writePrompt(fixture, sliceId, {
    approvedAt: "2026-05-02T00:01:00Z",
    status: "approved"
  });

  const result = runFixture(fixture);

  assert.equal(result.plan?.sliceId, sliceId);
  assert.equal(result.summary.selectedPrompt, `docs/codex-runs/${sliceId}-prompt.md`);
  assert.equal(result.plan?.codexCommandPreview?.executable, "codex");
  assert.equal(Array.isArray(result.plan?.codexCommandPreview?.args), true);
  assert.equal(result.plan?.codexCommandPreview?.usesShell, false);
  assert.equal(result.plan?.codexCommandPreview?.willExecute, false);
  assert.equal(
    result.plan?.codexCommandPreview?.promptFile,
    `docs/codex-runs/${sliceId}-prompt.md`
  );
  assert.equal(result.plan?.gitCommandPreview?.gitPlanVersion, 1);
  assert.equal(result.plan?.gitCommandPreview?.targetBranch, `codex/${sliceId}`);
  assert.equal(result.plan?.gitCommandPreview?.usesShell, false);
  assert.equal(result.plan?.gitCommandPreview?.willExecute, false);
  assert.equal(Array.isArray(result.plan?.gitCommandPreview?.commands), true);
  assert.equal(
    result.plan?.gitCommandPreview?.commands.every(
      (command) =>
        command.executable === "git" &&
        command.usesShell === false &&
        command.willExecute === false
    ),
    true
  );
  assert.equal(result.codexExecutionEnabled, false);
  assert.equal(result.summary.wouldExecute, false);
  assert.equal(result.errors.length, 0);
  assert.equal(
    existsSync(path.join(fixture.codexRunsDir, `${sliceId}-result.md`)),
    false
  );
});

test("one runnable prompt includes gitCommandPreview", () => {
  const fixture = createFixture();
  const sliceId = "2026-05-02-slice-001-test-run";
  writePrompt(fixture, sliceId, {
    approvedAt: "2026-05-02T00:01:00Z",
    status: "approved"
  });

  const result = runFixture(fixture);
  const preview = result.plan?.gitCommandPreview;

  assert.ok(preview);
  assert.equal(preview.gitPlanVersion, 1);
  assert.equal(preview.targetBranch, `codex/${sliceId}`);
  assert.equal(preview.usesShell, false);
  assert.equal(preview.willExecute, false);
  assert.equal(Array.isArray(preview.commands), true);
  assert.equal(preview.commands.length > 0, true);

  for (const command of preview.commands) {
    assert.equal(command.executable, "git");
    assert.equal(command.usesShell, false);
    assert.equal(command.willExecute, false);
  }
});

test("one runnable workbench prompt produces gated plan", () => {
  const fixture = createFixture();
  const sliceId = "2026-05-02-slice-001-test-run";
  writePrompt(fixture, sliceId, {
    approvedAt: "2026-05-02T00:01:00Z",
    status: "approved",
    targetBranch: "workbench"
  });

  const result = runFixture(fixture);

  assert.equal(result.errors.length, 0);
  assert.equal(result.plan?.targetBranch, "workbench");
  assert.equal(result.plan?.gitCommandPreview?.targetBranch, "workbench");
  assert.deepEqual(
    result.plan?.gitCommandPreview?.commands.find(
      (command) => command.name === "checkoutTargetBranch"
    )?.args,
    ["checkout", "workbench"]
  );
});

test("existing result file means no execution plan", () => {
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

  assert.equal(result.plan, null);
  assert.equal(result.summary.wouldExecute, false);
  assert.equal(result.errors.length, 0);
});

test("multiple runnable prompts fail closed", () => {
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
  assert.equal(result.summary.wouldExecute, false);
  assert.ok(
    result.errors.some((error) =>
      error.message.includes("Multiple runnable approved prompts")
    )
  );
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
  assert.equal(result.summary.selectedPrompt, `docs/codex-runs/${selectedSliceId}-prompt.md`);
});

test("selected prompt still respects dirty tree gate", () => {
  const fixture = createFixture();
  const sliceId = "2026-05-02-slice-001-test-run";
  writePrompt(fixture, sliceId, {
    approvedAt: "2026-05-02T00:01:00Z",
    status: "approved",
    targetBranch: "workbench"
  });

  const result = runFixture(fixture, {
    sliceId,
    enableCodexExecution: true,
    docsOnly: true,
    gitStatusInspection: gitStatus({
      currentBranch: "workbench",
      targetBranch: "workbench",
      dirtyPaths: ["docs/codex-runs/README.md"]
    })
  });

  assert.equal(result.plan?.sliceId, sliceId);
  assert.equal(result.dirtyTreePolicy.futureExecutionBlocked, true);
  assert.equal(result.codexExecutionAdapter.executionAllowed, false);
  assert.ok(
    result.codexExecutionAdapter.blockers.some((blocker) =>
      blocker.includes("dirty working tree")
    )
  );
});

test("selected prompt still respects docs-only scope gate", () => {
  const fixture = createFixture();
  const sliceId = "2026-05-02-slice-001-test-run";
  writePrompt(fixture, sliceId, {
    approvedAt: "2026-05-02T00:01:00Z",
    body: promptBodyWithAllowed("- scripts/codex-runs/local-executor.mjs"),
    status: "approved",
    targetBranch: "workbench"
  });

  const result = runFixture(fixture, {
    sliceId,
    enableCodexExecution: true,
    docsOnly: true,
    gitStatusInspection: gitStatus({
      currentBranch: "workbench",
      targetBranch: "workbench"
    })
  });

  assert.equal(result.plan?.sliceId, sliceId);
  assert.equal(result.scopePolicy?.docsOnly, false);
  assert.equal(result.codexExecutionAdapter.executionAllowed, false);
});

test("selected completed prompt fails clearly", () => {
  const fixture = createFixture();
  const sliceId = "2026-05-02-slice-001-test-run";
  writePrompt(fixture, sliceId, {
    approvedAt: "2026-05-02T00:01:00Z",
    status: "approved"
  });
  writeFileSync(path.join(fixture.codexRunsDir, `${sliceId}-result.md`), "# Existing\n");

  const result = runFixture(fixture, { sliceId });

  assert.equal(result.plan, null);
  assert.ok(
    result.errors.some((error) => error.message.includes("paired result file already exists"))
  );
});

test("selected canceled prompt fails clearly", () => {
  const fixture = createFixture();
  const sliceId = "2026-05-02-slice-001-test-run";
  writePrompt(fixture, sliceId, {
    status: "canceled"
  });

  const result = runFixture(fixture, { sliceId });

  assert.equal(result.plan, null);
  assert.ok(result.errors.some((error) => error.message.includes("status is canceled")));
});

test("selected missing prompt fails clearly", () => {
  const fixture = createFixture();

  const result = runFixture(fixture, {
    sliceId: "2026-05-02-slice-404-missing-run"
  });

  assert.equal(result.plan, null);
  assert.ok(result.errors.some((error) => error.message.includes("not found")));
});

test("unsafe selected slice id is rejected", () => {
  const fixture = createFixture();

  assert.throws(
    () => runFixture(fixture, { sliceId: "2026-05-02-slice-001-test>run" }),
    /Invalid slice id/
  );
});

test("execution request with slice id still requires run-codex-now flag", () => {
  const fixture = createFixture();
  const sliceId = "2026-05-02-slice-001-test-run";
  writePrompt(fixture, sliceId, {
    approvedAt: "2026-05-02T00:01:00Z",
    status: "approved",
    targetBranch: "workbench"
  });

  const result = runFixture(fixture, {
    sliceId,
    enableCodexExecution: true,
    docsOnly: true,
    gitStatusInspection: gitStatus({
      currentBranch: "workbench",
      targetBranch: "workbench"
    })
  });

  assert.equal(result.plan?.sliceId, sliceId);
  assert.equal(result.codexExecutionAdapter.executionAllowed, true);
  assert.equal(result.codexExecutionAdapter.wouldInvokeCodex, false);
  assert.match(result.codexExecutionAdapter.reason, /evaluation only/);
});

test("detector validation errors fail executor", () => {
  const fixture = createFixture();
  writeFileSync(
    path.join(fixture.codexRunsDir, "bad-prompt.md"),
    "# Missing frontmatter\n"
  );

  const result = runFixture(fixture);

  assert.equal(result.plan, null);
  assert.equal(result.summary.wouldExecute, false);
  assert.ok(
    result.errors.some((error) => error.source === "detector_validation")
  );
});

test("bad target branch is rejected", () => {
  const fixture = createFixture();
  writePrompt(fixture, "2026-05-02-slice-001-test-run", {
    approvedAt: "2026-05-02T00:01:00Z",
    status: "approved",
    targetBranch: "main"
  });

  const result = runFixture(fixture);

  assert.equal(result.plan, null);
  assert.equal(result.summary.wouldExecute, false);
  assert.ok(
    result.errors.some((error) =>
      error.message.toLowerCase().includes("unsafe target branch")
    )
  );
});

test("master target branch is rejected", () => {
  const fixture = createFixture();
  writePrompt(fixture, "2026-05-02-slice-001-test-run", {
    approvedAt: "2026-05-02T00:01:00Z",
    status: "approved",
    targetBranch: "master"
  });

  const result = runFixture(fixture);

  assert.equal(result.plan, null);
  assert.equal(result.summary.wouldExecute, false);
  assert.ok(
    result.errors.some((error) =>
      error.message.toLowerCase().includes("unsafe target branch")
    )
  );
});

test("result file outside docs/codex-runs is rejected", () => {
  const fixture = createFixture();
  writePrompt(fixture, "2026-05-02-slice-001-test-run", {
    approvedAt: "2026-05-02T00:01:00Z",
    resultFile: "../outside-result.md",
    status: "approved"
  });

  const result = runFixture(fixture);

  assert.equal(result.plan, null);
  assert.equal(result.summary.wouldExecute, false);
  assert.ok(result.errors.length > 0);
});

test("executor output includes codex execution adapter without flags", () => {
  const fixture = createFixture();
  writePrompt(fixture, "2026-05-02-slice-001-test-run", {
    approvedAt: "2026-05-02T00:01:00Z",
    status: "approved"
  });

  const result = runFixture(fixture);

  assert.equal(result.codexExecutionAdapter.adapterVersion, 1);
  assert.equal(result.codexExecutionAdapter.executionRequested, false);
  assert.equal(result.codexExecutionAdapter.executionAllowed, false);
  assert.equal(result.codexExecutionAdapter.wouldInvokeCodex, false);
});

test("docs-only flag without execution flag blocks adapter", () => {
  const fixture = createFixture();
  writePrompt(fixture, "2026-05-02-slice-001-test-run", {
    approvedAt: "2026-05-02T00:01:00Z",
    status: "approved"
  });

  const result = runFixture(fixture, { docsOnly: true });

  assert.equal(result.docsOnly, true);
  assert.equal(result.codexExecutionAdapter.docsOnly, true);
  assert.equal(result.codexExecutionAdapter.executionRequested, false);
  assert.equal(result.codexExecutionAdapter.executionAllowed, false);
  assert.match(result.codexExecutionAdapter.reason, /execution flag not provided/);
});

test("enable codex execution without docs-only flag refuses execution", () => {
  const fixture = createFixture();
  writePrompt(fixture, "2026-05-02-slice-001-test-run", {
    approvedAt: "2026-05-02T00:01:00Z",
    status: "approved"
  });

  const result = runFixture(fixture, { enableCodexExecution: true });

  assert.equal(result.codexExecutionRequested, true);
  assert.equal(result.codexExecutionImplemented, true);
  assert.equal(result.codexExecutionEnabled, false);
  assert.equal(result.codexExecutionAdapter.executionRequested, true);
  assert.equal(result.codexExecutionAdapter.docsOnly, false);
  assert.equal(result.codexExecutionAdapter.executionAllowed, false);
  assert.equal(result.codexExecutionAdapter.wouldInvokeCodex, false);
  assert.equal(result.summary.wouldExecute, false);
  assert.match(result.codexExecutionAdapter.reason, /docs-only flag required/);
  assert.ok(
    result.errors.some((error) =>
      error.message.includes("docs-only flag required")
    )
  );
});

test("enable codex execution with docs-only evaluates without invoking", () => {
  const fixture = createFixture();
  const sliceId = "2026-05-02-slice-001-test-run";
  writePrompt(fixture, sliceId, {
    approvedAt: "2026-05-02T00:01:00Z",
    status: "approved",
    targetBranch: "workbench"
  });

  const result = runFixture(fixture, {
    enableCodexExecution: true,
    docsOnly: true,
    gitStatusInspection: gitStatus({
      currentBranch: "workbench",
      targetBranch: "workbench"
    })
  });

  assert.equal(result.codexExecutionAdapter.executionRequested, true);
  assert.equal(result.codexExecutionAdapter.docsOnly, true);
  assert.equal(result.codexExecutionAdapter.runCodexNow, false);
  assert.equal(result.codexExecutionAdapter.executionImplemented, true);
  assert.equal(result.codexExecutionAdapter.executionAllowed, true);
  assert.equal(result.codexExecutionAdapter.wouldInvokeCodex, false);
  assert.match(result.codexExecutionAdapter.reason, /evaluation only/);
  assert.equal(result.codexExecutionInvoked, false);
  assert.equal(result.wroteResultFile, false);
  assert.equal(
    existsSync(path.join(fixture.codexRunsDir, `${sliceId}-result.md`)),
    false
  );
});

test("one runnable docs-only prompt includes passing scopePolicy", () => {
  const fixture = createFixture();
  const sliceId = "2026-05-02-slice-001-test-run";
  writePrompt(fixture, sliceId, {
    approvedAt: "2026-05-02T00:01:00Z",
    status: "approved",
    targetBranch: "workbench"
  });

  const result = runFixture(fixture);

  assert.equal(result.scopePolicy?.scopePolicyVersion, 1);
  assert.equal(result.scopePolicy?.docsOnly, true);
  assert.deepEqual(result.scopePolicy?.allowedPaths, [
    `docs/codex-runs/${sliceId}-result.md`
  ]);
  assert.equal(result.plan?.scopePolicy?.docsOnly, true);
});

test("readiness report includes docs-only scope check pass", () => {
  const fixture = createFixture();
  const sliceId = "2026-05-02-slice-001-test-run";
  writePrompt(fixture, sliceId, {
    approvedAt: "2026-05-02T00:01:00Z",
    status: "approved",
    targetBranch: "workbench"
  });

  const result = runFixture(fixture, {
    readinessReport: true,
    gitStatusInspection: gitStatus({
      currentBranch: "workbench",
      targetBranch: "workbench"
    })
  });
  const scopeCheck = result.readinessReport.checks.find(
    (check) => check.name === "docs-only scope"
  );

  assert.equal(scopeCheck?.passed, true);
  assert.match(scopeCheck?.details ?? "", /allowed docs-only paths/);
});

test("prompt with apps allowed file fails docs-only scope check", () => {
  const fixture = createFixture();
  const sliceId = "2026-05-02-slice-001-test-run";
  writePrompt(fixture, sliceId, {
    approvedAt: "2026-05-02T00:01:00Z",
    body: promptBodyWithAllowed("- apps/mission-control/src/app.ts"),
    status: "approved",
    targetBranch: "workbench"
  });

  const result = runFixture(fixture, {
    readinessReport: true,
    gitStatusInspection: gitStatus({
      currentBranch: "workbench",
      targetBranch: "workbench"
    })
  });

  assert.equal(result.scopePolicy?.docsOnly, false);
  assert.match(result.readinessReport.reason, /docs-only scope violation/);
  assert.equal(
    result.readinessReport.checks.find((check) => check.name === "docs-only scope")?.passed,
    false
  );
});

test("execution request with non-docs-only prompt reports scope blocker", () => {
  const fixture = createFixture();
  const sliceId = "2026-05-02-slice-001-test-run";
  writePrompt(fixture, sliceId, {
    approvedAt: "2026-05-02T00:01:00Z",
    body: promptBodyWithAllowed("- apps/mission-control/src/app.ts"),
    status: "approved",
    targetBranch: "workbench"
  });

  const result = runFixture(fixture, {
    enableCodexExecution: true,
    docsOnly: true,
    gitStatusInspection: gitStatus({
      currentBranch: "workbench",
      targetBranch: "workbench"
    })
  });

  assert.equal(result.codexExecutionAdapter.executionAllowed, false);
  assert.ok(
    result.codexExecutionAdapter.blockers.some((blocker) =>
      blocker.includes("docs-only scope")
    )
  );
});

test("execution request with docs-only prompt passes scope and evaluates without invocation", () => {
  const fixture = createFixture();
  const sliceId = "2026-05-02-slice-001-test-run";
  writePrompt(fixture, sliceId, {
    approvedAt: "2026-05-02T00:01:00Z",
    status: "approved",
    targetBranch: "workbench"
  });

  const result = runFixture(fixture, {
    enableCodexExecution: true,
    docsOnly: true,
    gitStatusInspection: gitStatus({
      currentBranch: "workbench",
      targetBranch: "workbench"
    })
  });

  assert.equal(result.scopePolicy?.docsOnly, true);
  assert.equal(
    result.readinessReport.checks.find((check) => check.name === "docs-only scope")?.passed,
    true
  );
  assert.equal(result.codexExecutionAdapter.executionAllowed, true);
  assert.equal(result.codexExecutionAdapter.wouldInvokeCodex, false);
  assert.deepEqual(result.codexExecutionAdapter.blockers, []);
});

test("JSON output is parseable", () => {
  const fixture = createFixture();
  writePrompt(fixture, "2026-05-02-slice-001-test-run", {
    approvedAt: "2026-05-02T00:01:00Z",
    status: "approved"
  });

  const payload = JSON.parse(renderJsonOutput(runFixture(fixture)));

  assert.equal(payload.executorProtocolVersion, 1);
  assert.equal(payload.codexExecutionEnabled, false);
  assert.equal(payload.codexExecutionAdapter.adapterVersion, 1);
  assert.equal(payload.codexExecutionAdapter.wouldInvokeCodex, false);
  assert.equal(payload.scopePolicy.docsOnly, true);
  assert.equal(payload.summary.wouldExecute, false);
  assert.equal(payload.plan.sliceId, "2026-05-02-slice-001-test-run");
  assert.equal(payload.plan.codexCommandPreview.executable, "codex");
  assert.equal(payload.plan.codexCommandPreview.willExecute, false);
  assert.equal(payload.plan.gitCommandPreview.gitPlanVersion, 1);
  assert.equal(payload.plan.gitCommandPreview.willExecute, false);
  assert.equal(Array.isArray(payload.plan.gitCommandPreview.commands), true);
});

test("JSON readiness output includes scopePolicy", () => {
  const fixture = createFixture();
  const sliceId = "2026-05-02-slice-001-test-run";
  writePrompt(fixture, sliceId, {
    approvedAt: "2026-05-02T00:01:00Z",
    status: "approved",
    targetBranch: "workbench"
  });

  const payload = JSON.parse(
    renderJsonOutput(
      runFixture(fixture, {
        readinessReport: true,
        gitStatusInspection: gitStatus({
          currentBranch: "workbench",
          targetBranch: "workbench"
        })
      })
    )
  );

  assert.equal(payload.scopePolicy.scopePolicyVersion, 1);
  assert.equal(payload.scopePolicy.docsOnly, true);
  assert.equal(
    payload.readinessReport.checks.find((check) => check.name === "docs-only scope").passed,
    true
  );
});

test("readiness report includes Codex CLI availability check", () => {
  const fixture = createFixture();
  const sliceId = "2026-05-02-slice-001-test-run";
  writePrompt(fixture, sliceId, {
    approvedAt: "2026-05-02T00:01:00Z",
    status: "approved",
    targetBranch: "workbench"
  });

  const result = runFixture(fixture, {
    readinessReport: true,
    gitStatusInspection: gitStatus({
      currentBranch: "workbench",
      targetBranch: "workbench"
    })
  });
  const cliCheck = result.readinessReport.checks.find(
    (check) => check.name === "Codex CLI available"
  );

  assert.equal(cliCheck?.passed, true);
  assert.match(cliCheck?.details ?? "", /codex 1\.2\.3/);
  assert.equal(result.codexCliCheck.available, true);
});

test("JSON readiness output includes cliCheck", () => {
  const fixture = createFixture();
  const sliceId = "2026-05-02-slice-001-test-run";
  writePrompt(fixture, sliceId, {
    approvedAt: "2026-05-02T00:01:00Z",
    status: "approved",
    targetBranch: "workbench"
  });

  const payload = JSON.parse(
    renderJsonOutput(
      runFixture(fixture, {
        readinessReport: true,
        gitStatusInspection: gitStatus({
          currentBranch: "workbench",
          targetBranch: "workbench"
        })
      })
    )
  );

  assert.equal(payload.codexCliCheck.cliCheckVersion, 1);
  assert.equal(payload.codexCliCheck.available, true);
  assert.equal(
    payload.readinessReport.checks.find((check) => check.name === "Codex CLI available").passed,
    true
  );
});

test("readiness report includes Node availability preflight", () => {
  const fixture = createFixture();
  const sliceId = "2026-05-02-slice-001-test-run";
  writePrompt(fixture, sliceId, {
    approvedAt: "2026-05-02T00:01:00Z",
    status: "approved",
    targetBranch: "workbench"
  });

  const result = runFixture(fixture, {
    readinessReport: true,
    nodePreflight: availableNodePreflight(),
    gitStatusInspection: gitStatus({
      currentBranch: "workbench",
      targetBranch: "workbench"
    })
  });
  const nodeCheck = result.readinessReport.checks.find(
    (check) => check.name === "Node availability preflight"
  );

  assert.equal(result.nodePreflight.available, true);
  assert.equal(nodeCheck?.passed, true);
  assert.match(nodeCheck?.details ?? "", /Node available/);
});

test("JSON readiness output includes nodePreflight", () => {
  const fixture = createFixture();
  const sliceId = "2026-05-02-slice-001-test-run";
  writePrompt(fixture, sliceId, {
    approvedAt: "2026-05-02T00:01:00Z",
    status: "approved",
    targetBranch: "workbench"
  });

  const payload = JSON.parse(
    renderJsonOutput(
      runFixture(fixture, {
        readinessReport: true,
        nodePreflight: availableNodePreflight(),
        gitStatusInspection: gitStatus({
          currentBranch: "workbench",
          targetBranch: "workbench"
        })
      })
    )
  );

  assert.equal(payload.nodePreflight.nodePreflightVersion, 1);
  assert.equal(payload.nodePreflight.available, true);
  assert.equal(
    payload.readinessReport.checks.find(
      (check) => check.name === "Node availability preflight"
    ).passed,
    true
  );
});

test("unavailable Node preflight blocks readiness and adapter evaluation", () => {
  const fixture = createFixture();
  const sliceId = "2026-05-02-slice-001-test-run";
  writePrompt(fixture, sliceId, {
    approvedAt: "2026-05-02T00:01:00Z",
    status: "approved",
    targetBranch: "workbench"
  });

  const result = runFixture(fixture, {
    enableCodexExecution: true,
    docsOnly: true,
    readinessReport: true,
    nodePreflight: unavailableNodePreflight(),
    gitStatusInspection: gitStatus({
      currentBranch: "workbench",
      targetBranch: "workbench"
    })
  });

  assert.equal(result.nodePreflight.available, false);
  assert.match(result.readinessReport.reason, /Node availability/);
  assert.equal(
    result.readinessReport.checks.find(
      (check) => check.name === "Node availability preflight"
    ).passed,
    false
  );
  assert.equal(result.codexExecutionAdapter.executionAllowed, false);
  assert.equal(result.codexExecutionAdapter.wouldInvokeCodex, false);
});

test("unavailable Codex CLI blocks readiness and adapter evaluation", () => {
  const fixture = createFixture();
  const sliceId = "2026-05-02-slice-001-test-run";
  writePrompt(fixture, sliceId, {
    approvedAt: "2026-05-02T00:01:00Z",
    status: "approved",
    targetBranch: "workbench"
  });

  const result = runFixture(fixture, {
    enableCodexExecution: true,
    docsOnly: true,
    readinessReport: true,
    codexCliCheck: unavailableCodexCliCheck(),
    gitStatusInspection: gitStatus({
      currentBranch: "workbench",
      targetBranch: "workbench"
    })
  });

  assert.equal(result.codexCliCheck.available, false);
  assert.match(result.readinessReport.reason, /CLI availability/);
  assert.equal(
    result.readinessReport.checks.find((check) => check.name === "Codex CLI available").passed,
    false
  );
  assert.equal(result.codexExecutionAdapter.executionAllowed, false);
  assert.equal(result.codexExecutionAdapter.wouldInvokeCodex, false);
});

test("skip Codex CLI check warns and is not execution-ready", () => {
  const fixture = createFixture();
  const sliceId = "2026-05-02-slice-001-test-run";
  writePrompt(fixture, sliceId, {
    approvedAt: "2026-05-02T00:01:00Z",
    status: "approved",
    targetBranch: "workbench"
  });

  const result = runFixture(fixture, {
    enableCodexExecution: true,
    docsOnly: true,
    skipCodexCliCheck: true,
    gitStatusInspection: gitStatus({
      currentBranch: "workbench",
      targetBranch: "workbench"
    })
  });

  assert.equal(result.codexCliCheck.skipped, true);
  assert.equal(result.codexCliCheck.available, false);
  assert.ok(result.codexCliCheck.warnings.length > 0);
  assert.equal(result.codexExecutionAdapter.executionAllowed, false);
});

test("JSON output with explicit execution flags includes blocked adapter", () => {
  const fixture = createFixture();
  writePrompt(fixture, "2026-05-02-slice-001-test-run", {
    approvedAt: "2026-05-02T00:01:00Z",
    status: "approved",
    targetBranch: "workbench"
  });

  const payload = JSON.parse(
    renderJsonOutput(
      runFixture(fixture, {
        enableCodexExecution: true,
        docsOnly: true,
        gitStatusInspection: gitStatus({
          currentBranch: "workbench",
          targetBranch: "workbench"
        })
      })
    )
  );

  assert.equal(payload.codexExecutionAdapter.adapterVersion, 1);
  assert.equal(payload.codexExecutionAdapter.executionRequested, true);
  assert.equal(payload.codexExecutionAdapter.docsOnly, true);
  assert.equal(payload.codexExecutionAdapter.runCodexNow, false);
  assert.equal(payload.codexExecutionAdapter.executionAllowed, true);
  assert.equal(payload.codexExecutionAdapter.wouldInvokeCodex, false);
});

test("all three execution flags with fake runner invokes fake runner", () => {
  const fixture = createFixture();
  const sliceId = "2026-05-02-slice-001-test-run";
  let invoked = false;
  writePrompt(fixture, sliceId, {
    approvedAt: "2026-05-02T00:01:00Z",
    status: "approved",
    targetBranch: "workbench"
  });

  const result = runFixture(fixture, {
    enableCodexExecution: true,
    docsOnly: true,
    runCodexNow: true,
    gitStatusInspection: gitStatus({
      currentBranch: "workbench",
      targetBranch: "workbench"
    }),
    nodePreflight: availableNodePreflight(),
    codexRunner: ({ executable, args, env }) => {
      invoked = true;
      assert.equal(executable, "codex");
      assert.equal(Array.isArray(args), true);
      const pathKey = Object.keys(env).find((key) => key.toUpperCase() === "PATH");
      assert.equal(env[pathKey].includes(path.dirname(process.execPath)), true);
      writeFileSync(
        path.join(fixture.codexRunsDir, `${sliceId}-result.md`),
        "# Fake Codex result\n"
      );

      return {
        invoked: true,
        exitCode: 0,
        stdout: "fake runner",
        stderr: ""
      };
    }
  });

  assert.equal(invoked, true);
  assert.equal(result.runCodexNow, true);
  assert.equal(result.codexExecutionInvoked, true);
  assert.equal(result.codexExecutionAdapter.wouldInvokeCodex, true);
  assert.equal(result.resultFileObservedAfterCodex, true);
  assert.equal(result.errors.length, 0);
});

test("all three execution flags require result file after invocation", () => {
  const fixture = createFixture();
  const sliceId = "2026-05-02-slice-001-test-run";
  writePrompt(fixture, sliceId, {
    approvedAt: "2026-05-02T00:01:00Z",
    status: "approved",
    targetBranch: "workbench"
  });

  const result = runFixture(fixture, {
    enableCodexExecution: true,
    docsOnly: true,
    runCodexNow: true,
    gitStatusInspection: gitStatus({
      currentBranch: "workbench",
      targetBranch: "workbench"
    }),
    nodePreflight: availableNodePreflight(),
    codexRunner: () => ({
      invoked: true,
      exitCode: 0,
      stdout: "fake runner",
      stderr: ""
    })
  });

  assert.equal(result.codexExecutionInvoked, true);
  assert.equal(result.resultFileObservedAfterCodex, false);
  assert.ok(
    result.errors.some((error) =>
      error.message.includes("Paired result file missing after Codex invocation")
    )
  );
});

test("all three execution flags report invocation failure", () => {
  const fixture = createFixture();
  const sliceId = "2026-05-02-slice-001-test-run";
  writePrompt(fixture, sliceId, {
    approvedAt: "2026-05-02T00:01:00Z",
    status: "approved",
    targetBranch: "workbench"
  });

  const result = runFixture(fixture, {
    enableCodexExecution: true,
    docsOnly: true,
    runCodexNow: true,
    gitStatusInspection: gitStatus({
      currentBranch: "workbench",
      targetBranch: "workbench"
    }),
    nodePreflight: availableNodePreflight(),
    codexRunner: () => ({
      invoked: true,
      exitCode: 42,
      stdout: "",
      stderr: "fake failure"
    })
  });

  assert.equal(result.codexExecutionInvoked, true);
  assert.equal(result.codexInvocationResult.exitCode, 42);
  assert.ok(
    result.errors.some((error) =>
      error.message.includes("Codex invocation exited with code 42")
    )
  );
});

test("fake Codex invocation with verification flag runs executor-owned verification", () => {
  const fixture = createFixture();
  const sliceId = "2026-05-02-slice-001-test-run";
  let verificationInvoked = false;
  writePrompt(fixture, sliceId, {
    approvedAt: "2026-05-02T00:01:00Z",
    status: "approved",
    targetBranch: "workbench"
  });

  const result = runFixture(fixture, {
    enableCodexExecution: true,
    docsOnly: true,
    runCodexNow: true,
    runVerificationAfterCodex: true,
    gitStatusInspection: gitStatus({
      currentBranch: "workbench",
      targetBranch: "workbench"
    }),
    nodePreflight: availableNodePreflight(),
    codexRunner: () => {
      writeFileSync(
        path.join(fixture.codexRunsDir, `${sliceId}-result.md`),
        "# Fake Codex result\n"
      );

      return {
        invoked: true,
        exitCode: 0,
        stdout: "fake runner",
        stderr: ""
      };
    },
    verificationRunner: ({ executable, args, cwd }) => {
      verificationInvoked = true;
      assert.equal(executable, "git");
      assert.deepEqual(args, ["diff", "--check"]);
      assert.equal(cwd, fixture.rootDir);

      return {
        exitCode: 0,
        stdout: "verified",
        stderr: "",
        durationMs: 3
      };
    }
  });

  assert.equal(verificationInvoked, true);
  assert.equal(result.executorVerification.ran, true);
  assert.equal(result.executorVerification.passed, true);
  assert.equal(result.executorVerification.commands.length, 1);
  assert.equal(result.executorVerification.commands[0].stdoutPreview, "verified");
  assert.equal(result.errors.length, 0);
});

test("verification artifact is not written without artifact flag", () => {
  const fixture = createFixture();
  const sliceId = "2026-05-02-slice-001-test-run";
  writePrompt(fixture, sliceId, {
    approvedAt: "2026-05-02T00:01:00Z",
    status: "approved",
    targetBranch: "workbench"
  });

  const result = runFixture(fixture, {
    enableCodexExecution: true,
    docsOnly: true,
    runCodexNow: true,
    runVerificationAfterCodex: true,
    gitStatusInspection: gitStatus({
      currentBranch: "workbench",
      targetBranch: "workbench"
    }),
    nodePreflight: availableNodePreflight(),
    codexRunner: () => {
      writeFileSync(
        path.join(fixture.codexRunsDir, `${sliceId}-result.md`),
        "# Fake Codex result\n"
      );

      return {
        invoked: true,
        exitCode: 0,
        stdout: "fake runner",
        stderr: ""
      };
    },
    verificationRunner: () => ({
      exitCode: 0,
      stdout: "verified",
      stderr: ""
    })
  });

  assert.equal(result.executorVerification.ran, true);
  assert.equal(result.verificationArtifact.requested, false);
  assert.equal(result.verificationArtifact.wrote, false);
  assert.equal(
    existsSync(path.join(fixture.codexRunsDir, `${sliceId}-verification.json`)),
    false
  );
});

test("verification artifact is written when verification runs and artifact flag is present", () => {
  const fixture = createFixture();
  const sliceId = "2026-05-02-slice-001-test-run";
  writePrompt(fixture, sliceId, {
    approvedAt: "2026-05-02T00:01:00Z",
    status: "approved",
    targetBranch: "workbench"
  });

  const result = runFixture(fixture, {
    enableCodexExecution: true,
    docsOnly: true,
    runCodexNow: true,
    runVerificationAfterCodex: true,
    writeVerificationArtifact: true,
    gitStatusInspection: gitStatus({
      currentBranch: "workbench",
      targetBranch: "workbench"
    }),
    nodePreflight: availableNodePreflight(),
    codexRunner: () => {
      writeFileSync(
        path.join(fixture.codexRunsDir, `${sliceId}-result.md`),
        "# Fake Codex result\n"
      );

      return {
        invoked: true,
        exitCode: 0,
        stdout: "fake runner",
        stderr: ""
      };
    },
    verificationRunner: () => ({
      exitCode: 0,
      stdout: "verified",
      stderr: "",
      durationMs: 2
    })
  });
  const artifactPath = path.join(fixture.codexRunsDir, `${sliceId}-verification.json`);
  const artifact = JSON.parse(readFileSync(artifactPath, "utf8"));

  assert.equal(result.errors.length, 0);
  assert.equal(result.writeVerificationArtifact, true);
  assert.equal(result.verificationArtifact.wrote, true);
  assert.equal(
    result.verificationArtifact.path,
    `docs/codex-runs/${sliceId}-verification.json`
  );
  assert.equal(existsSync(artifactPath), true);
  assert.equal(artifact.verificationArtifactVersion, 1);
  assert.equal(artifact.sliceId, sliceId);
  assert.equal(artifact.promptFile, `docs/codex-runs/${sliceId}-prompt.md`);
  assert.equal(artifact.resultFile, `docs/codex-runs/${sliceId}-result.md`);
  assert.equal(artifact.verification.passed, true);
  assert.equal(artifact.verification.failedCommandCount, 0);
  assert.deepEqual(result.writtenFiles, [
    `docs/codex-runs/${sliceId}-verification.json`
  ]);
});

test("existing verification artifact blocks overwrite", () => {
  const fixture = createFixture();
  const sliceId = "2026-05-02-slice-001-test-run";
  const artifactPath = path.join(fixture.codexRunsDir, `${sliceId}-verification.json`);
  writePrompt(fixture, sliceId, {
    approvedAt: "2026-05-02T00:01:00Z",
    status: "approved",
    targetBranch: "workbench"
  });
  writeFileSync(artifactPath, "{\"existing\":true}\n");

  const result = runFixture(fixture, {
    enableCodexExecution: true,
    docsOnly: true,
    runCodexNow: true,
    runVerificationAfterCodex: true,
    writeVerificationArtifact: true,
    gitStatusInspection: gitStatus({
      currentBranch: "workbench",
      targetBranch: "workbench"
    }),
    nodePreflight: availableNodePreflight(),
    codexRunner: () => {
      writeFileSync(
        path.join(fixture.codexRunsDir, `${sliceId}-result.md`),
        "# Fake Codex result\n"
      );

      return {
        invoked: true,
        exitCode: 0,
        stdout: "fake runner",
        stderr: ""
      };
    },
    verificationRunner: () => ({
      exitCode: 0,
      stdout: "verified",
      stderr: ""
    })
  });

  assert.equal(result.verificationArtifact.wrote, false);
  assert.match(result.verificationArtifact.reason, /already exists/);
  assert.equal(readFileSync(artifactPath, "utf8"), "{\"existing\":true}\n");
  assert.ok(
    result.errors.some((error) =>
      error.message.includes("Verification artifact already exists")
    )
  );
});

test("verification artifact is not written when verification does not run", () => {
  const fixture = createFixture();
  const sliceId = "2026-05-02-slice-001-test-run";
  writePrompt(fixture, sliceId, {
    approvedAt: "2026-05-02T00:01:00Z",
    status: "approved",
    targetBranch: "workbench"
  });

  const result = runFixture(fixture, {
    enableCodexExecution: true,
    docsOnly: true,
    runCodexNow: true,
    writeVerificationArtifact: true,
    gitStatusInspection: gitStatus({
      currentBranch: "workbench",
      targetBranch: "workbench"
    }),
    nodePreflight: availableNodePreflight(),
    codexRunner: () => {
      writeFileSync(
        path.join(fixture.codexRunsDir, `${sliceId}-result.md`),
        "# Fake Codex result\n"
      );

      return {
        invoked: true,
        exitCode: 0,
        stdout: "fake runner",
        stderr: ""
      };
    }
  });

  assert.equal(result.executorVerification.ran, false);
  assert.equal(result.verificationArtifact.requested, true);
  assert.equal(result.verificationArtifact.wrote, false);
  assert.match(result.verificationArtifact.reason, /did not run/);
  assert.equal(
    existsSync(path.join(fixture.codexRunsDir, `${sliceId}-verification.json`)),
    false
  );
});

test("attempt artifact is not written without artifact flag", () => {
  const fixture = createFixture();
  const sliceId = "2026-05-02-slice-001-test-run";
  writePrompt(fixture, sliceId, {
    approvedAt: "2026-05-02T00:01:00Z",
    status: "approved",
    targetBranch: "workbench"
  });

  const result = runFixture(fixture, {
    enableCodexExecution: true,
    docsOnly: true,
    runCodexNow: true,
    gitStatusInspection: gitStatus({
      currentBranch: "workbench",
      targetBranch: "workbench",
      dirtyPaths: ["docs/codex-runs/README.md"]
    }),
    nodePreflight: availableNodePreflight()
  });

  assert.equal(result.attemptArtifact.requested, false);
  assert.equal(result.attemptArtifact.wrote, false);
  assert.equal(
    existsSync(path.join(fixture.codexRunsDir, `${sliceId}-attempt-001.json`)),
    false
  );
});

test("blocked dirty-tree attempt writes attempt artifact when flag is present", () => {
  const fixture = createFixture();
  const sliceId = "2026-05-02-slice-001-test-run";
  writePrompt(fixture, sliceId, {
    approvedAt: "2026-05-02T00:01:00Z",
    status: "approved",
    targetBranch: "workbench"
  });

  const result = runFixture(fixture, {
    enableCodexExecution: true,
    docsOnly: true,
    runCodexNow: true,
    writeAttemptArtifact: true,
    gitStatusInspection: gitStatus({
      currentBranch: "workbench",
      targetBranch: "workbench",
      dirtyPaths: ["docs/codex-runs/README.md"]
    }),
    nodePreflight: availableNodePreflight()
  });
  const artifactPath = path.join(fixture.codexRunsDir, `${sliceId}-attempt-001.json`);
  const artifact = JSON.parse(readFileSync(artifactPath, "utf8"));

  assert.equal(result.codexExecutionInvoked, false);
  assert.equal(result.attemptArtifact.wrote, true);
  assert.equal(result.attemptArtifact.path, `docs/codex-runs/${sliceId}-attempt-001.json`);
  assert.equal(artifact.status, "blocked");
  assert.equal(artifact.stage, "preflight");
  assert.equal(artifact.codexInvoked, false);
  assert.ok(artifact.blockers.some((blocker) => blocker.includes("dirty working tree")));
  assert.deepEqual(result.writtenFiles, [`docs/codex-runs/${sliceId}-attempt-001.json`]);
});

test("multiple-runnable blocked attempt writes attempt artifact when flag is present", () => {
  const fixture = createFixture();
  const firstSliceId = "2026-05-02-slice-001-test-run";
  const secondSliceId = "2026-05-02-slice-002-test-run";
  writePrompt(fixture, firstSliceId, {
    approvedAt: "2026-05-02T00:01:00Z",
    status: "approved",
    targetBranch: "workbench"
  });
  writePrompt(fixture, secondSliceId, {
    approvedAt: "2026-05-02T00:02:00Z",
    status: "approved",
    targetBranch: "workbench"
  });

  const result = runFixture(fixture, {
    enableCodexExecution: true,
    docsOnly: true,
    runCodexNow: true,
    writeAttemptArtifact: true,
    gitStatusInspection: gitStatus({
      currentBranch: "workbench",
      targetBranch: "workbench"
    }),
    nodePreflight: availableNodePreflight()
  });
  const artifactPath = path.join(fixture.codexRunsDir, `${firstSliceId}-attempt-001.json`);
  const artifact = JSON.parse(readFileSync(artifactPath, "utf8"));

  assert.equal(result.plan, null);
  assert.equal(result.attemptArtifact.wrote, true);
  assert.equal(artifact.sliceId, firstSliceId);
  assert.equal(artifact.status, "blocked");
  assert.ok(
    artifact.blockers.some((blocker) =>
      blocker.includes("Multiple runnable approved prompts")
    )
  );
});

test("missing result after fake Codex invocation writes failed attempt artifact", () => {
  const fixture = createFixture();
  const sliceId = "2026-05-02-slice-001-test-run";
  writePrompt(fixture, sliceId, {
    approvedAt: "2026-05-02T00:01:00Z",
    status: "approved",
    targetBranch: "workbench"
  });

  const result = runFixture(fixture, {
    enableCodexExecution: true,
    docsOnly: true,
    runCodexNow: true,
    writeAttemptArtifact: true,
    gitStatusInspection: gitStatus({
      currentBranch: "workbench",
      targetBranch: "workbench"
    }),
    nodePreflight: availableNodePreflight(),
    codexRunner: () => ({
      invoked: true,
      exitCode: 0,
      stdout: "fake runner",
      stderr: ""
    })
  });
  const artifact = JSON.parse(
    readFileSync(path.join(fixture.codexRunsDir, `${sliceId}-attempt-001.json`), "utf8")
  );

  assert.equal(result.codexExecutionInvoked, true);
  assert.equal(result.resultFileObservedAfterCodex, false);
  assert.equal(result.attemptArtifact.wrote, true);
  assert.equal(artifact.status, "failed");
  assert.equal(artifact.stage, "result_check");
  assert.equal(artifact.codexInvoked, true);
  assert.equal(artifact.resultFileCreated, false);
});

test("successful fake Codex invocation writes completed attempt artifact when requested", () => {
  const fixture = createFixture();
  const sliceId = "2026-05-02-slice-001-test-run";
  writePrompt(fixture, sliceId, {
    approvedAt: "2026-05-02T00:01:00Z",
    status: "approved",
    targetBranch: "workbench"
  });

  const result = runFixture(fixture, {
    enableCodexExecution: true,
    docsOnly: true,
    runCodexNow: true,
    writeAttemptArtifact: true,
    gitStatusInspection: gitStatus({
      currentBranch: "workbench",
      targetBranch: "workbench"
    }),
    nodePreflight: availableNodePreflight(),
    codexRunner: () => {
      writeFileSync(
        path.join(fixture.codexRunsDir, `${sliceId}-result.md`),
        "# Fake Codex result\n"
      );

      return {
        invoked: true,
        exitCode: 0,
        stdout: "fake runner",
        stderr: ""
      };
    }
  });
  const artifact = JSON.parse(
    readFileSync(path.join(fixture.codexRunsDir, `${sliceId}-attempt-001.json`), "utf8")
  );

  assert.equal(result.errors.length, 0);
  assert.equal(result.attemptArtifact.wrote, true);
  assert.equal(artifact.status, "completed");
  assert.equal(artifact.codexInvoked, true);
  assert.equal(artifact.resultFileCreated, true);
});

test("attempt artifact numbering increments when previous attempt exists", () => {
  const fixture = createFixture();
  const sliceId = "2026-05-02-slice-001-test-run";
  writePrompt(fixture, sliceId, {
    approvedAt: "2026-05-02T00:01:00Z",
    status: "approved",
    targetBranch: "workbench"
  });
  writeFileSync(
    path.join(fixture.codexRunsDir, `${sliceId}-attempt-001.json`),
    "{\"existing\":true}\n"
  );

  const result = runFixture(fixture, {
    enableCodexExecution: true,
    docsOnly: true,
    runCodexNow: true,
    writeAttemptArtifact: true,
    gitStatusInspection: gitStatus({
      currentBranch: "workbench",
      targetBranch: "workbench",
      dirtyPaths: ["docs/codex-runs/README.md"]
    }),
    nodePreflight: availableNodePreflight()
  });

  assert.equal(result.attemptArtifact.wrote, true);
  assert.equal(result.attemptArtifact.path, `docs/codex-runs/${sliceId}-attempt-002.json`);
  assert.equal(
    readFileSync(path.join(fixture.codexRunsDir, `${sliceId}-attempt-001.json`), "utf8"),
    "{\"existing\":true}\n"
  );
});

test("attempt artifact redacts secret values from metadata", () => {
  const fixture = createFixture();
  const sliceId = "2026-05-02-slice-001-test-run";
  writePrompt(fixture, sliceId, {
    approvedAt: "2026-05-02T00:01:00Z",
    status: "approved",
    targetBranch: "workbench"
  });

  const result = runFixture(fixture, {
    enableCodexExecution: true,
    docsOnly: true,
    runCodexNow: true,
    writeAttemptArtifact: true,
    env: {
      SECRET_TOKEN: "very-secret-value"
    },
    gitStatusInspection: gitStatus({
      currentBranch: "workbench",
      targetBranch: "workbench"
    }),
    nodePreflight: availableNodePreflight(),
    codexRunner: () => ({
      invoked: true,
      exitCode: 1,
      stdout: "",
      stderr: "very-secret-value"
    })
  });
  const artifact = JSON.parse(
    readFileSync(path.join(fixture.codexRunsDir, `${sliceId}-attempt-001.json`), "utf8")
  );

  assert.equal(result.attemptArtifact.wrote, true);
  assert.equal(
    JSON.stringify(artifact).includes("very-secret-value"),
    false
  );
});

test("executor-owned verification failure is reported", () => {
  const fixture = createFixture();
  const sliceId = "2026-05-02-slice-001-test-run";
  writePrompt(fixture, sliceId, {
    approvedAt: "2026-05-02T00:01:00Z",
    status: "approved",
    targetBranch: "workbench"
  });

  const result = runFixture(fixture, {
    enableCodexExecution: true,
    docsOnly: true,
    runCodexNow: true,
    runVerificationAfterCodex: true,
    gitStatusInspection: gitStatus({
      currentBranch: "workbench",
      targetBranch: "workbench"
    }),
    nodePreflight: availableNodePreflight(),
    codexRunner: () => {
      writeFileSync(
        path.join(fixture.codexRunsDir, `${sliceId}-result.md`),
        "# Fake Codex result\n"
      );

      return {
        invoked: true,
        exitCode: 0,
        stdout: "fake runner",
        stderr: ""
      };
    },
    verificationRunner: () => ({
      exitCode: 1,
      stdout: "",
      stderr: "verification failed"
    })
  });

  assert.equal(result.executorVerification.ran, true);
  assert.equal(result.executorVerification.passed, false);
  assert.equal(result.executorVerification.failedCommandCount, 1);
  assert.ok(
    result.errors.some((error) =>
      error.message.includes("Executor-owned verification failed")
    )
  );
});

test("verification does not run without verification flag", () => {
  const fixture = createFixture();
  const sliceId = "2026-05-02-slice-001-test-run";
  let verificationInvoked = false;
  writePrompt(fixture, sliceId, {
    approvedAt: "2026-05-02T00:01:00Z",
    status: "approved",
    targetBranch: "workbench"
  });

  const result = runFixture(fixture, {
    enableCodexExecution: true,
    docsOnly: true,
    runCodexNow: true,
    gitStatusInspection: gitStatus({
      currentBranch: "workbench",
      targetBranch: "workbench"
    }),
    nodePreflight: availableNodePreflight(),
    codexRunner: () => {
      writeFileSync(
        path.join(fixture.codexRunsDir, `${sliceId}-result.md`),
        "# Fake Codex result\n"
      );

      return {
        invoked: true,
        exitCode: 0,
        stdout: "fake runner",
        stderr: ""
      };
    },
    verificationRunner: () => {
      verificationInvoked = true;

      return {
        exitCode: 0,
        stdout: "",
        stderr: ""
      };
    }
  });

  assert.equal(verificationInvoked, false);
  assert.equal(result.executorVerification.ran, false);
});

test("verification does not run if Codex is not invoked", () => {
  const fixture = createFixture();
  let verificationInvoked = false;
  writePrompt(fixture, "2026-05-02-slice-001-test-run", {
    approvedAt: "2026-05-02T00:01:00Z",
    status: "approved",
    targetBranch: "workbench"
  });

  const result = runFixture(fixture, {
    enableCodexExecution: true,
    docsOnly: true,
    runVerificationAfterCodex: true,
    gitStatusInspection: gitStatus({
      currentBranch: "workbench",
      targetBranch: "workbench"
    }),
    nodePreflight: availableNodePreflight(),
    verificationRunner: () => {
      verificationInvoked = true;

      return {
        exitCode: 0,
        stdout: "",
        stderr: ""
      };
    }
  });

  assert.equal(result.codexExecutionInvoked, false);
  assert.equal(verificationInvoked, false);
  assert.equal(result.executorVerification.ran, false);
});

test("JSON output includes executorVerification", () => {
  const fixture = createFixture();
  writePrompt(fixture, "2026-05-02-slice-001-test-run", {
    approvedAt: "2026-05-02T00:01:00Z",
    status: "approved",
    targetBranch: "workbench"
  });

  const payload = JSON.parse(
    renderJsonOutput(
      runFixture(fixture, {
        runVerificationAfterCodex: true,
        gitStatusInspection: gitStatus({
          currentBranch: "workbench",
          targetBranch: "workbench"
        })
      })
    )
  );

  assert.equal(payload.runVerificationAfterCodex, true);
  assert.equal(payload.executorVerification.executorVerificationVersion, 1);
  assert.equal(payload.executorVerification.ran, false);
});

test("JSON output includes runCodexNow", () => {
  const fixture = createFixture();
  writePrompt(fixture, "2026-05-02-slice-001-test-run", {
    approvedAt: "2026-05-02T00:01:00Z",
    status: "approved",
    targetBranch: "workbench"
  });

  const payload = JSON.parse(
    renderJsonOutput(
      runFixture(fixture, {
        enableCodexExecution: true,
        docsOnly: true,
        gitStatusInspection: gitStatus({
          currentBranch: "workbench",
          targetBranch: "workbench"
        })
      })
    )
  );

  assert.equal(payload.runCodexNow, false);
  assert.equal(payload.codexExecutionAdapter.runCodexNow, false);
});

test("executor JSON includes gitStatus when zero runnable prompts", () => {
  const fixture = createFixture();
  writePrompt(fixture, "0000-00-00-slice-000-example", {
    body: "EXAMPLE ONLY - DO NOT RUN.",
    status: "canceled"
  });

  const payload = JSON.parse(
    renderJsonOutput(
      runFixture(fixture, {
        gitStatusInspection: gitStatus({
          currentBranch: "workbench",
          targetBranch: null
        })
      })
    )
  );

  assert.equal(payload.plan, null);
  assert.equal(payload.gitStatus.currentBranch, "workbench");
  assert.equal(payload.gitStatus.branchAllowed, true);
});

test("workbench prompt includes gitStatus and branch match gate passes", () => {
  const fixture = createFixture();
  const sliceId = "2026-05-02-slice-001-test-run";
  writePrompt(fixture, sliceId, {
    approvedAt: "2026-05-02T00:01:00Z",
    status: "approved",
    targetBranch: "workbench"
  });

  const result = runFixture(fixture, {
    gitStatusInspection: gitStatus({
      currentBranch: "workbench",
      targetBranch: "workbench"
    })
  });

  assert.equal(result.errors.length, 0);
  assert.equal(result.plan?.gitStatus.currentBranch, "workbench");
  assert.ok(
    result.gates.some(
      (gate) => gate.name === "current branch matches target" && gate.passed
    )
  );
});

test("workbench prompt reports branch mismatch", () => {
  const fixture = createFixture();
  const sliceId = "2026-05-02-slice-001-test-run";
  writePrompt(fixture, sliceId, {
    approvedAt: "2026-05-02T00:01:00Z",
    status: "approved",
    targetBranch: "workbench"
  });

  const result = runFixture(fixture, {
    gitStatusInspection: gitStatus({
      currentBranch: "primary worker",
      targetBranch: "workbench",
      branchMatchesTarget: false
    })
  });

  assert.equal(result.plan, null);
  assert.ok(
    result.errors.some((error) =>
      error.message.includes("does not match target branch")
    )
  );
});

test("main branch inspection causes gate failure", () => {
  const fixture = createFixture();
  const sliceId = "2026-05-02-slice-001-test-run";
  writePrompt(fixture, sliceId, {
    approvedAt: "2026-05-02T00:01:00Z",
    status: "approved",
    targetBranch: "workbench"
  });

  const result = runFixture(fixture, {
    gitStatusInspection: gitStatus({
      currentBranch: "main",
      targetBranch: "workbench",
      branchAllowed: false,
      branchMatchesTarget: false,
      errors: ["current branch must not be main or master"]
    })
  });

  assert.equal(result.plan, null);
  assert.ok(
    result.errors.some((error) =>
      error.message.includes("Current branch is not allowed")
    )
  );
});

test("dirty working tree is reported but does not enable execution", () => {
  const fixture = createFixture();
  const sliceId = "2026-05-02-slice-001-test-run";
  writePrompt(fixture, sliceId, {
    approvedAt: "2026-05-02T00:01:00Z",
    status: "approved",
    targetBranch: "workbench"
  });

  const result = runFixture(fixture, {
    gitStatusInspection: gitStatus({
      currentBranch: "workbench",
      targetBranch: "workbench",
      dirtyPaths: ["docs/codex-runs/README.md"]
    })
  });

  assert.equal(result.errors.length, 0);
  assert.equal(result.gitStatus.isDirty, true);
  assert.equal(result.gitStatus.dirtyPaths.length, 1);
  assert.equal(result.dirtyTreePolicy.futureExecutionBlocked, true);
  assert.equal(result.dirtyTreePolicy.fakeFixtureAllowed, false);
  assert.equal(result.codexExecutionEnabled, false);
  assert.equal(result.summary.wouldExecute, false);
});

test("clean working tree policy allows future execution eligibility", () => {
  const fixture = createFixture();
  const sliceId = "2026-05-02-slice-001-test-run";
  writePrompt(fixture, sliceId, {
    approvedAt: "2026-05-02T00:01:00Z",
    status: "approved",
    targetBranch: "workbench"
  });

  const result = runFixture(fixture, {
    gitStatusInspection: gitStatus({
      currentBranch: "workbench",
      targetBranch: "workbench"
    })
  });

  assert.equal(result.dirtyTreePolicy.policyVersion, 1);
  assert.equal(result.dirtyTreePolicy.isDirty, false);
  assert.equal(result.dirtyTreePolicy.futureExecutionBlocked, false);
  assert.equal(result.dirtyTreePolicy.fakeFixtureAllowed, true);
  assert.equal(result.dirtyTreePolicy.reason, "working tree clean");
});

test("dirty working tree blocks future execution policy", () => {
  const fixture = createFixture();
  const sliceId = "2026-05-02-slice-001-test-run";
  writePrompt(fixture, sliceId, {
    approvedAt: "2026-05-02T00:01:00Z",
    status: "approved",
    targetBranch: "workbench"
  });

  const result = runFixture(fixture, {
    gitStatusInspection: gitStatus({
      currentBranch: "workbench",
      targetBranch: "workbench",
      dirtyPaths: ["docs/codex-runs/README.md"]
    })
  });

  assert.equal(result.plan?.sliceId, sliceId);
  assert.equal(result.dirtyTreePolicy.futureExecutionBlocked, true);
  assert.equal(result.dirtyTreePolicy.fakeFixtureAllowed, false);
  assert.match(result.dirtyTreePolicy.reason, /dirty working tree/);
  assert.equal(result.summary.wouldExecute, false);
});

test("dirty working tree does not crash zero-runnable executor", () => {
  const fixture = createFixture();
  writePrompt(fixture, "0000-00-00-slice-000-example", {
    body: "EXAMPLE ONLY - DO NOT RUN.",
    status: "canceled"
  });

  const result = runFixture(fixture, {
    gitStatusInspection: gitStatus({
      currentBranch: "workbench",
      targetBranch: null,
      dirtyPaths: ["docs/codex-runs/README.md"]
    })
  });

  assert.equal(result.plan, null);
  assert.equal(result.errors.length, 0);
  assert.equal(result.dirtyTreePolicy.futureExecutionBlocked, true);
});

test("fake fixture mode refuses when pre-existing dirty paths are present", () => {
  const fixture = createFixture();
  const sliceId = "2026-05-02-slice-001-test-run";
  writePrompt(fixture, sliceId, {
    approvedAt: "2026-05-02T00:01:00Z",
    status: "approved",
    targetBranch: "workbench"
  });

  const result = runFixture(fixture, {
    fakeCodexFixture: true,
    gitStatusInspection: gitStatus({
      currentBranch: "workbench",
      targetBranch: "workbench",
      dirtyPaths: ["docs/codex-runs/README.md"]
    })
  });

  assert.equal(result.wroteResultFile, false);
  assert.equal(
    existsSync(path.join(fixture.codexRunsDir, `${sliceId}-result.md`)),
    false
  );
  assert.equal(result.dirtyTreePolicy.futureExecutionBlocked, true);
  assert.ok(
    result.errors.some((error) =>
      error.message.includes("dirty working tree")
    )
  );
});

test("JSON output includes dirtyTreePolicy", () => {
  const fixture = createFixture();
  writePrompt(fixture, "0000-00-00-slice-000-example", {
    body: "EXAMPLE ONLY - DO NOT RUN.",
    status: "canceled"
  });

  const payload = JSON.parse(
    renderJsonOutput(
      runFixture(fixture, {
        gitStatusInspection: gitStatus({
          currentBranch: "workbench",
          targetBranch: null
        })
      })
    )
  );

  assert.equal(payload.dirtyTreePolicy.policyVersion, 1);
  assert.equal(typeof payload.dirtyTreePolicy.futureExecutionBlocked, "boolean");
});

test("readiness report with zero runnable prompts blocks real execution", () => {
  const fixture = createFixture();
  writePrompt(fixture, "0000-00-00-slice-000-example", {
    body: "EXAMPLE ONLY - DO NOT RUN.",
    status: "canceled"
  });

  const result = runFixture(fixture, {
    readinessReport: true,
    gitStatusInspection: gitStatus({
      currentBranch: "workbench",
      targetBranch: null
    })
  });
  const report = result.readinessReport;

  assert.equal(report.safeToAttemptDocsOnlyRealExecution, false);
  assert.match(report.reason, /no runnable approved prompt/);
  assert.equal(
    report.checks.find((check) => check.name === "single runnable prompt").passed,
    false
  );
  assert.equal(
    report.checks.find((check) => check.name === "real Codex execution implemented").passed,
    false
  );
});

test("readiness report with one clean matching workbench prompt passes gates except execution implementation", () => {
  const fixture = createFixture();
  const sliceId = "2026-05-02-slice-001-test-run";
  writePrompt(fixture, sliceId, {
    approvedAt: "2026-05-02T00:01:00Z",
    status: "approved",
    targetBranch: "workbench"
  });

  const result = runFixture(fixture, {
    readinessReport: true,
    gitStatusInspection: gitStatus({
      currentBranch: "workbench",
      targetBranch: "workbench"
    })
  });
  const checks = Object.fromEntries(
    result.readinessReport.checks.map((check) => [check.name, check])
  );

  assert.equal(result.readinessReport.safeToAttemptDocsOnlyRealExecution, false);
  assert.match(result.readinessReport.reason, /not implemented or enabled/);
  assert.equal(checks["detector validation"].passed, true);
  assert.equal(checks["single runnable prompt"].passed, true);
  assert.equal(checks["branch allowed"].passed, true);
  assert.equal(checks["branch matches target"].passed, true);
  assert.equal(checks["working tree clean"].passed, true);
  assert.equal(checks["Codex command preview"].passed, true);
  assert.equal(checks["Git command preview"].passed, true);
  assert.equal(checks["real Codex execution implemented"].passed, false);
});

test("readiness report with dirty working tree blocks", () => {
  const fixture = createFixture();
  const sliceId = "2026-05-02-slice-001-test-run";
  writePrompt(fixture, sliceId, {
    approvedAt: "2026-05-02T00:01:00Z",
    status: "approved",
    targetBranch: "workbench"
  });

  const result = runFixture(fixture, {
    readinessReport: true,
    gitStatusInspection: gitStatus({
      currentBranch: "workbench",
      targetBranch: "workbench",
      dirtyPaths: ["docs/codex-runs/README.md"]
    })
  });

  assert.equal(result.readinessReport.safeToAttemptDocsOnlyRealExecution, false);
  assert.match(result.readinessReport.reason, /dirty working tree/);
  assert.equal(
    result.readinessReport.checks.find((check) => check.name === "working tree clean").passed,
    false
  );
});

test("readiness report with branch mismatch blocks", () => {
  const fixture = createFixture();
  const sliceId = "2026-05-02-slice-001-test-run";
  writePrompt(fixture, sliceId, {
    approvedAt: "2026-05-02T00:01:00Z",
    status: "approved",
    targetBranch: "workbench"
  });

  const result = runFixture(fixture, {
    readinessReport: true,
    gitStatusInspection: gitStatus({
      currentBranch: "primary worker",
      targetBranch: "workbench",
      branchMatchesTarget: false
    })
  });

  assert.equal(result.readinessReport.safeToAttemptDocsOnlyRealExecution, false);
  assert.match(result.readinessReport.reason, /does not match target branch/);
  assert.equal(
    result.readinessReport.checks.find((check) => check.name === "branch matches target").passed,
    false
  );
});

test("readiness report with multiple runnable prompts blocks", () => {
  const fixture = createFixture();
  writePrompt(fixture, "2026-05-02-slice-001-test-run", {
    approvedAt: "2026-05-02T00:01:00Z",
    status: "approved"
  });
  writePrompt(fixture, "2026-05-02-slice-002-test-run", {
    approvedAt: "2026-05-02T00:02:00Z",
    status: "approved"
  });

  const result = runFixture(fixture, { readinessReport: true });

  assert.equal(result.readinessReport.safeToAttemptDocsOnlyRealExecution, false);
  assert.match(result.readinessReport.reason, /multiple runnable approved prompts/);
  assert.equal(
    result.readinessReport.checks.find((check) => check.name === "single runnable prompt").passed,
    false
  );
});

test("readiness report JSON is parseable", () => {
  const fixture = createFixture();
  writePrompt(fixture, "0000-00-00-slice-000-example", {
    body: "EXAMPLE ONLY - DO NOT RUN.",
    status: "canceled"
  });

  const payload = JSON.parse(
    renderJsonOutput(
      runFixture(fixture, {
        readinessReport: true,
        gitStatusInspection: gitStatus({
          currentBranch: "workbench",
          targetBranch: null
        })
      })
    )
  );

  assert.equal(payload.readinessReport.readinessReportVersion, 1);
  assert.equal(payload.readinessReport.safeToAttemptDocsOnlyRealExecution, false);
});

test("fake fixture mode writes only the paired result file", () => {
  const fixture = createFixture();
  const sliceId = "2026-05-02-slice-001-test-run";
  writePrompt(fixture, sliceId, {
    approvedAt: "2026-05-02T00:01:00Z",
    status: "approved"
  });

  const result = runFixture(fixture, { fakeCodexFixture: true });
  const resultPath = path.join(fixture.codexRunsDir, `${sliceId}-result.md`);
  const files = readdirSync(fixture.codexRunsDir).sort();

  assert.equal(result.mode, "fake-codex-fixture");
  assert.equal(result.wroteResultFile, true);
  assert.equal(result.codexExecutionAdapter.wouldInvokeCodex, false);
  assert.equal(result.plan.codexCommandPreview.willExecute, false);
  assert.equal(result.plan.gitCommandPreview.willExecute, false);
  assert.equal(
    result.plan.gitCommandPreview.commands.every(
      (command) => command.executable === "git" && command.willExecute === false
    ),
    true
  );
  assert.deepEqual(result.writtenFiles, [`docs/codex-runs/${sliceId}-result.md`]);
  assert.equal(existsSync(resultPath), true);
  assert.equal(files.length, 2);
  assert.deepEqual(files, [`${sliceId}-prompt.md`, `${sliceId}-result.md`]);

  const content = readFileSync(resultPath, "utf8");
  assert.match(content, /fake fixture mode/);
  assert.match(content, /Codex execution was not invoked/);
});

test("fake fixture mode makes prompt non-runnable afterward", () => {
  const fixture = createFixture();
  const sliceId = "2026-05-02-slice-001-test-run";
  writePrompt(fixture, sliceId, {
    approvedAt: "2026-05-02T00:01:00Z",
    status: "approved"
  });

  const first = runFixture(fixture, { fakeCodexFixture: true });
  const second = runFixture(fixture);

  assert.equal(first.wroteResultFile, true);
  assert.equal(second.summary.runnableApprovedPrompts, 0);
  assert.equal(second.plan, null);
});

test("fake fixture mode refuses if result file already exists", () => {
  const fixture = createFixture();
  const sliceId = "2026-05-02-slice-001-test-run";
  writePrompt(fixture, sliceId, {
    approvedAt: "2026-05-02T00:01:00Z",
    status: "approved"
  });
  writeFileSync(path.join(fixture.codexRunsDir, `${sliceId}-result.md`), "# Existing result\n");

  const result = runFixture(fixture, { fakeCodexFixture: true });

  assert.equal(result.wroteResultFile, false);
  assert.ok(
    result.errors.some((error) =>
      error.message.includes("paired result file already exists")
    )
  );
});

test("fake fixture mode refuses with multiple runnable prompts", () => {
  const fixture = createFixture();
  writePrompt(fixture, "2026-05-02-slice-001-test-run", {
    approvedAt: "2026-05-02T00:01:00Z",
    status: "approved"
  });
  writePrompt(fixture, "2026-05-02-slice-002-test-run", {
    approvedAt: "2026-05-02T00:02:00Z",
    status: "approved"
  });

  const result = runFixture(fixture, { fakeCodexFixture: true });

  assert.equal(result.wroteResultFile, false);
  assert.ok(
    result.errors.some((error) =>
      error.message.includes("Multiple runnable approved prompts")
    )
  );
});

test("fake fixture mode rejects unsafe target branch", () => {
  const fixture = createFixture();
  writePrompt(fixture, "2026-05-02-slice-001-test-run", {
    approvedAt: "2026-05-02T00:01:00Z",
    status: "approved",
    targetBranch: "main"
  });

  const result = runFixture(fixture, { fakeCodexFixture: true });

  assert.equal(result.wroteResultFile, false);
  assert.ok(
    result.errors.some((error) =>
      error.message.toLowerCase().includes("unsafe target branch")
    )
  );
});

test("fake fixture mode rejects result_file outside docs/codex-runs", () => {
  const fixture = createFixture();
  writePrompt(fixture, "2026-05-02-slice-001-test-run", {
    approvedAt: "2026-05-02T00:01:00Z",
    resultFile: "../outside-result.md",
    status: "approved"
  });

  const result = runFixture(fixture, { fakeCodexFixture: true });

  assert.equal(result.wroteResultFile, false);
  assert.ok(result.errors.length > 0);
});

test("fake fixture mode rejects enable codex execution ambiguity", () => {
  const fixture = createFixture();
  writePrompt(fixture, "2026-05-02-slice-001-test-run", {
    approvedAt: "2026-05-02T00:01:00Z",
    status: "approved"
  });

  const result = runFixture(fixture, {
    enableCodexExecution: true,
    fakeCodexFixture: true
  });

  assert.equal(result.codexExecutionRequested, true);
  assert.equal(result.codexExecutionImplemented, true);
  assert.equal(result.codexExecutionEnabled, false);
  assert.equal(result.wroteResultFile, false);
  assert.ok(
    result.errors.some((error) =>
      error.message.includes("Cannot combine --enable-codex-execution")
    )
  );
});

test("JSON output for fake fixture mode is parseable and reports write", () => {
  const fixture = createFixture();
  const sliceId = "2026-05-02-slice-001-test-run";
  writePrompt(fixture, sliceId, {
    approvedAt: "2026-05-02T00:01:00Z",
    status: "approved"
  });

  const payload = JSON.parse(
    renderJsonOutput(runFixture(fixture, { fakeCodexFixture: true }))
  );

  assert.equal(payload.mode, "fake-codex-fixture");
  assert.equal(payload.fakeFixtureMode, true);
  assert.equal(payload.wroteResultFile, true);
  assert.equal(payload.plan.codexCommandPreview.willExecute, false);
  assert.equal(payload.plan.gitCommandPreview.gitPlanVersion, 1);
  assert.equal(payload.plan.gitCommandPreview.willExecute, false);
  assert.deepEqual(payload.writtenFiles, [`docs/codex-runs/${sliceId}-result.md`]);
});

test("local executor does not import or use process execution helpers", () => {
  const source = readFileSync(
    new URL("./local-executor.mjs", import.meta.url),
    "utf8"
  );

  assert.equal(source.includes("child_process"), false);
  assert.equal(source.includes("exec("), false);
  assert.equal(source.includes("spawn("), false);
  assert.equal(source.includes("execFile("), false);
});

function createFixture() {
  const rootDir = mkdtempSync(path.join(tmpdir(), "a target repo-local-executor-"));
  const codexRunsDir = path.join(rootDir, "docs", "codex-runs");
  mkdirSync(codexRunsDir, { recursive: true });

  return { codexRunsDir, rootDir };
}

function runFixture(fixture, options = {}) {
  const codexCliCheck =
    options.codexCliCheck ?? (options.skipCodexCliCheck ? undefined : availableCodexCliCheck());

  return buildLocalExecutorPlan({
    ...options,
    codexCliCheck,
    dir: fixture.codexRunsDir,
    rootDir: fixture.rootDir
  });
}

function gitStatus(options = {}) {
  const currentBranch = options.currentBranch ?? "workbench";
  const targetBranch = options.targetBranch ?? currentBranch;
  const dirtyPaths = options.dirtyPaths ?? [];

  return {
    gitStatusInspectionVersion: 1,
    cwd: options.cwd ?? "fixture",
    currentBranch,
    isDirty: dirtyPaths.length > 0,
    dirtyPaths,
    branchAllowed: options.branchAllowed ?? true,
    branchMatchesTarget:
      options.branchMatchesTarget ?? (targetBranch ? currentBranch === targetBranch : null),
    targetBranch,
    errors: options.errors ?? [],
    warnings: options.warnings ?? []
  };
}

function writePrompt(fixture, sliceId, options = {}) {
  const status = options.status ?? "draft";
  const frontmatter = {
    codex_run_protocol: "1",
    slice_id: sliceId,
    status,
    owner: "chatgpt-planner",
    target_repo: "example-repo",
    target_branch: options.targetBranch ?? `codex/${sliceId}`,
    result_file: options.resultFile ?? `docs/codex-runs/${sliceId}-result.md`,
    created_at: "2026-05-02T00:00:00Z",
    approved_at: options.approvedAt ?? null
  };
  const yaml = Object.entries(frontmatter)
    .map(([key, value]) => `${key}: ${value === null ? "null" : value}`)
    .join("\n");

  writeFileSync(
    path.join(fixture.codexRunsDir, `${sliceId}-prompt.md`),
    `---\n${yaml}\n---\n\n# Codex Slice Prompt: ${sliceId}\n\n${
      options.body ?? promptBodyWithAllowed(`- docs/codex-runs/${sliceId}-result.md`)
    }\n`
  );
}

function promptBodyWithAllowed(allowedLines) {
  return `## Objective\n\n` +
    `Fixture prompt.\n\n` +
    `## Out of Scope\n\n` +
    `- app/runtime code\n` +
    `- packages\n\n` +
    `## Allowed Files / Areas\n\n` +
    `${allowedLines}\n\n` +
    `## Verification Commands\n\n` +
    `- git diff --check\n`;
}

function availableCodexCliCheck() {
  return {
    cliCheckVersion: 1,
    executable: "codex",
    available: true,
    command: ["codex", "--version"],
    exitCode: 0,
    stdoutPreview: "codex 1.2.3",
    stderrPreview: "",
    errors: [],
    warnings: []
  };
}

function unavailableCodexCliCheck() {
  return {
    cliCheckVersion: 1,
    executable: "codex",
    available: false,
    command: ["codex", "--version"],
    exitCode: 1,
    stdoutPreview: "",
    stderrPreview: "",
    errors: ["spawn codex ENOENT"],
    warnings: []
  };
}

function availableNodePreflight() {
  return {
    nodePreflightVersion: 1,
    available: true,
    processExecPath: process.execPath,
    processVersion: process.version,
    explicitNodeBinaryPathAvailable: true,
    nodeBinaryDirectory: path.dirname(process.execPath),
    pathKey: "PATH",
    pathEntryCount: 1,
    pathPreview: ["fixture-path"],
    pathWasAugmented: true,
    augmentedPathPreview: [path.dirname(process.execPath), "fixture-path"],
    controlledEnvPreview: {
      envPreviewVersion: 1,
      totalKeys: 2,
      previewedKeys: 2,
      entries: [
        {
          key: "PATH",
          valuePreview: "fixture-path"
        },
        {
          key: "NODE_ENV",
          valuePreview: "test-fixture"
        }
      ]
    },
    errors: [],
    warnings: []
  };
}

function unavailableNodePreflight() {
  return {
    nodePreflightVersion: 1,
    available: false,
    processExecPath: null,
    processVersion: process.version,
    explicitNodeBinaryPathAvailable: false,
    nodeBinaryDirectory: null,
    pathKey: "PATH",
    pathEntryCount: 0,
    pathPreview: [],
    pathWasAugmented: false,
    augmentedPathPreview: [],
    controlledEnvPreview: {
      envPreviewVersion: 1,
      totalKeys: 0,
      previewedKeys: 0,
      entries: []
    },
    errors: ["process.execPath is unavailable"],
    warnings: []
  };
}
