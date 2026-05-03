import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import {
  deriveExecutionAttemptArtifactPath,
  deriveVerificationArtifactPath,
  extractVerificationCommandsFromPrompt,
  findNextExecutionAttemptArtifactPath,
  runExecutorVerification,
  validateExecutorVerificationCommand,
  writeExecutionAttemptArtifact,
  writeExecutorVerificationArtifact
} from "./executor-verification-runner.mjs";

test("allows git diff check", () => {
  const validation = validateExecutorVerificationCommand("git diff --check");

  assert.equal(validation.allowed, true);
  assert.equal(validation.executable, "git");
  assert.deepEqual(validation.args, ["diff", "--check"]);
});

test("allows focused Node test commands from the allowlist", () => {
  const commands = [
    "node --test scripts/codex-runs/detect-approved-prompts.test.mjs",
    "node --test scripts/codex-runs/local-runner-dry-run.test.mjs",
    "node --test scripts/codex-runs/local-executor.test.mjs",
    "node --test scripts/codex-runs/codex-execution-adapter.test.mjs",
    "node --test scripts/codex-runs/prompt-scope-enforcer.test.mjs",
    "node --test scripts/codex-runs/executor-verification-runner.test.mjs"
  ];

  for (const command of commands) {
    assert.equal(validateExecutorVerificationCommand(command).allowed, true);
  }
});

test("rejects unlisted commands", () => {
  const validation = validateExecutorVerificationCommand("node --version");

  assert.equal(validation.allowed, false);
  assert.ok(
    validation.errors.some((error) => error.includes("not allowlisted"))
  );
});

test("rejects Git mutation commands", () => {
  const validation = validateExecutorVerificationCommand("git commit -m nope");

  assert.equal(validation.allowed, false);
  assert.ok(
    validation.errors.some((error) => error.includes("Git mutation command rejected"))
  );
});

test("rejects shell control characters", () => {
  const validation = validateExecutorVerificationCommand("git diff --check && git status");

  assert.equal(validation.allowed, false);
  assert.ok(
    validation.errors.some((error) => error.includes("shell control characters"))
  );
});

test("captures stdout stderr and exit code using fake runner", () => {
  const result = runExecutorVerification({
    commands: ["git diff --check"],
    cwd: "fixture",
    runner: ({ executable, args, cwd }) => {
      assert.equal(executable, "git");
      assert.deepEqual(args, ["diff", "--check"]);
      assert.equal(cwd, "fixture");

      return {
        exitCode: 0,
        stdout: "clean",
        stderr: "",
        durationMs: 7
      };
    }
  });

  assert.equal(result.ran, true);
  assert.equal(result.passed, true);
  assert.equal(result.failedCommandCount, 0);
  assert.equal(result.commands[0].stdoutPreview, "clean");
  assert.equal(result.commands[0].stderrPreview, "");
  assert.equal(result.commands[0].durationMs, 7);
});

test("reports failed command when fake runner returns nonzero", () => {
  const result = runExecutorVerification({
    commands: ["git diff --check"],
    runner: () => ({
      exitCode: 1,
      stdout: "",
      stderr: "whitespace error"
    })
  });

  assert.equal(result.passed, false);
  assert.equal(result.failedCommandCount, 1);
  assert.equal(result.commands[0].passed, false);
  assert.equal(result.commands[0].stderrPreview, "whitespace error");
});

test("does not use shell interpolation", () => {
  const source = readFileSync(
    new URL("./executor-verification-runner.mjs", import.meta.url),
    "utf8"
  );

  assert.equal(source.includes("shell: true"), false);
  assert.equal(source.includes("exec("), false);
});

test("does not log secrets in previews", () => {
  const result = runExecutorVerification({
    commands: ["git diff --check"],
    env: {
      SECRET_TOKEN: "very-secret-value"
    },
    runner: () => ({
      exitCode: 1,
      stdout: "stdout very-secret-value",
      stderr: "stderr very-secret-value"
    })
  });

  assert.equal(result.commands[0].stdoutPreview, "stdout [redacted]");
  assert.equal(result.commands[0].stderrPreview, "stderr [redacted]");
});

test("derives verification artifact path from slice id", () => {
  assert.equal(
    deriveVerificationArtifactPath("2026-05-02-slice-016-durable-verification-artifact"),
    "docs/codex-runs/2026-05-02-slice-016-durable-verification-artifact-verification.json"
  );
});

test("derives attempt artifact path from slice id and attempt number", () => {
  assert.equal(
    deriveExecutionAttemptArtifactPath(
      "2026-05-02-slice-019-durable-attempt-artifacts",
      1
    ),
    "docs/codex-runs/2026-05-02-slice-019-durable-attempt-artifacts-attempt-001.json"
  );
});

test("increments attempt artifact path when previous attempt exists", () => {
  const rootDir = createArtifactFixture();
  const sliceId = "2026-05-02-slice-019-durable-attempt-artifacts";

  writeFileSync(
    path.join(rootDir, "docs", "codex-runs", `${sliceId}-attempt-001.json`),
    "{\"existing\":true}\n"
  );

  const next = findNextExecutionAttemptArtifactPath({ rootDir, sliceId });

  assert.equal(next.attemptNumber, 2);
  assert.equal(
    next.path,
    "docs/codex-runs/2026-05-02-slice-019-durable-attempt-artifacts-attempt-002.json"
  );
});

test("rejects unsafe attempt artifact slice ids", () => {
  assert.throws(
    () => deriveExecutionAttemptArtifactPath("../outside", 1),
    /Invalid slice id/
  );
});

test("rejects unsafe verification artifact slice ids", () => {
  assert.throws(
    () => deriveVerificationArtifactPath("../outside"),
    /Invalid slice id/
  );
});

test("writes verification artifact under docs codex-runs", () => {
  const rootDir = createArtifactFixture();
  const sliceId = "2026-05-02-slice-016-durable-verification-artifact";
  const verification = passingVerification();
  const result = writeExecutorVerificationArtifact({
    rootDir,
    sliceId,
    promptFile: `docs/codex-runs/${sliceId}-prompt.md`,
    resultFile: `docs/codex-runs/${sliceId}-result.md`,
    verification,
    createdAt: "2026-05-03T00:00:00.000Z"
  });
  const artifactPath = path.join(rootDir, result.path);
  const payload = JSON.parse(readFileSync(artifactPath, "utf8"));

  assert.equal(result.wrote, true);
  assert.equal(result.path, `docs/codex-runs/${sliceId}-verification.json`);
  assert.equal(existsSync(artifactPath), true);
  assert.equal(payload.verificationArtifactVersion, 1);
  assert.equal(payload.sliceId, sliceId);
  assert.equal(payload.promptFile, `docs/codex-runs/${sliceId}-prompt.md`);
  assert.equal(payload.resultFile, `docs/codex-runs/${sliceId}-result.md`);
  assert.equal(payload.createdAt, "2026-05-03T00:00:00.000Z");
  assert.equal(payload.verification.passed, true);
  assert.equal(payload.verification.failedCommandCount, 0);
});

test("writes attempt artifact under docs codex-runs", () => {
  const rootDir = createArtifactFixture();
  const sliceId = "2026-05-02-slice-019-durable-attempt-artifacts";
  const result = writeExecutionAttemptArtifact({
    rootDir,
    sliceId,
    promptFile: `docs/codex-runs/${sliceId}-prompt.md`,
    resultFile: `docs/codex-runs/${sliceId}-result.md`,
    status: "blocked",
    stage: "preflight",
    codexInvoked: false,
    resultFileCreated: false,
    verificationRan: false,
    verificationArtifactCreated: false,
    reason: "dirty working tree blocks real execution",
    blockers: ["dirty working tree blocks real execution"],
    commandPreview: {
      codex: { executable: "codex", args: ["exec"], usesShell: false, willExecute: false },
      git: { commandCount: 3, usesShell: false, willExecute: false }
    },
    createdAt: "2026-05-03T00:00:00.000Z"
  });
  const artifactPath = path.join(rootDir, result.path);
  const payload = JSON.parse(readFileSync(artifactPath, "utf8"));

  assert.equal(result.wrote, true);
  assert.equal(
    result.path,
    `docs/codex-runs/${sliceId}-attempt-001.json`
  );
  assert.equal(payload.attemptArtifactVersion, 1);
  assert.equal(payload.sliceId, sliceId);
  assert.equal(payload.attemptNumber, 1);
  assert.equal(payload.status, "blocked");
  assert.equal(payload.stage, "preflight");
  assert.equal(payload.codexInvoked, false);
  assert.equal(payload.resultFileCreated, false);
});

test("existing attempt artifact is not overwritten", () => {
  const rootDir = createArtifactFixture();
  const sliceId = "2026-05-02-slice-019-durable-attempt-artifacts";
  const firstPath = path.join(rootDir, "docs", "codex-runs", `${sliceId}-attempt-001.json`);

  writeFileSync(firstPath, "{\"existing\":true}\n");

  const result = writeExecutionAttemptArtifact({
    rootDir,
    sliceId,
    promptFile: `docs/codex-runs/${sliceId}-prompt.md`,
    resultFile: `docs/codex-runs/${sliceId}-result.md`,
    status: "failed",
    stage: "result_check",
    reason: "missing result",
    blockers: []
  });

  assert.equal(result.wrote, true);
  assert.equal(result.path, `docs/codex-runs/${sliceId}-attempt-002.json`);
  assert.equal(readFileSync(firstPath, "utf8"), "{\"existing\":true}\n");
});

test("attempt artifact redacts secret values", () => {
  const rootDir = createArtifactFixture();
  const sliceId = "2026-05-02-slice-019-durable-attempt-artifacts";
  const result = writeExecutionAttemptArtifact({
    rootDir,
    sliceId,
    promptFile: `docs/codex-runs/${sliceId}-prompt.md`,
    resultFile: `docs/codex-runs/${sliceId}-result.md`,
    status: "failed",
    stage: "codex_invocation",
    reason: "failed with very-secret-value",
    blockers: ["stderr very-secret-value"],
    env: {
      SECRET_TOKEN: "very-secret-value"
    }
  });
  const payload = JSON.parse(readFileSync(path.join(rootDir, result.path), "utf8"));

  assert.equal(payload.reason, "failed with [redacted]");
  assert.deepEqual(payload.blockers, ["stderr [redacted]"]);
});

test("existing verification artifact blocks overwrite", () => {
  const rootDir = createArtifactFixture();
  const sliceId = "2026-05-02-slice-016-durable-verification-artifact";
  const artifactPath = path.join(
    rootDir,
    "docs",
    "codex-runs",
    `${sliceId}-verification.json`
  );
  writeFileSync(artifactPath, "{\"existing\":true}\n");

  const result = writeExecutorVerificationArtifact({
    rootDir,
    sliceId,
    promptFile: `docs/codex-runs/${sliceId}-prompt.md`,
    resultFile: `docs/codex-runs/${sliceId}-result.md`,
    verification: passingVerification()
  });

  assert.equal(result.wrote, false);
  assert.match(result.reason, /already exists/);
  assert.equal(readFileSync(artifactPath, "utf8"), "{\"existing\":true}\n");
});

test("does not write verification artifact when verification did not run", () => {
  const rootDir = createArtifactFixture();
  const sliceId = "2026-05-02-slice-016-durable-verification-artifact";
  const result = writeExecutorVerificationArtifact({
    rootDir,
    sliceId,
    promptFile: `docs/codex-runs/${sliceId}-prompt.md`,
    resultFile: `docs/codex-runs/${sliceId}-result.md`,
    verification: {
      executorVerificationVersion: 1,
      ran: false,
      commands: [],
      passed: null,
      failedCommandCount: 0,
      reason: "not requested"
    }
  });

  assert.equal(result.wrote, false);
  assert.match(result.reason, /did not run/);
  assert.equal(existsSync(path.join(rootDir, result.path)), false);
});

test("extracts verification commands from prompt section", () => {
  const commands = extractVerificationCommandsFromPrompt(`# Prompt

## Verification Commands

- git diff --check
- \`node --test scripts/codex-runs/local-executor.test.mjs\`

## Deployment / Runtime Checks

None.
`);

  assert.deepEqual(commands, [
    "git diff --check",
    "node --test scripts/codex-runs/local-executor.test.mjs"
  ]);
});

function createArtifactFixture() {
  const rootDir = mkdtempSync(path.join(tmpdir(), "a target repo-verification-artifact-"));

  mkdirSync(path.join(rootDir, "docs", "codex-runs"), { recursive: true });

  return rootDir;
}

function passingVerification() {
  return {
    executorVerificationVersion: 1,
    ran: true,
    commands: [
      {
        command: "git diff --check",
        cwd: "fixture",
        exitCode: 0,
        passed: true,
        stdoutPreview: "",
        stderrPreview: "",
        durationMs: 1,
        invoked: true,
        validationErrors: []
      }
    ],
    passed: true,
    failedCommandCount: 0,
    reason: "executor-owned verification passed"
  };
}
