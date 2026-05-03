import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { loadLedgerConfig } from "./config.mjs";

const outputPreviewLimit = 1000;
const shellControlPattern = /[;&|`$><\r\n]/;
const secretNamePattern = /(SECRET|TOKEN|KEY|PASSWORD|PASS|AUTH|CREDENTIAL|COOKIE|SESSION)/i;
const gitMutationSubcommands = new Set([
  "add",
  "am",
  "apply",
  "bisect",
  "branch",
  "checkout",
  "cherry-pick",
  "clean",
  "commit",
  "merge",
  "mv",
  "pull",
  "push",
  "rebase",
  "reset",
  "restore",
  "revert",
  "rm",
  "stash",
  "switch",
  "tag"
]);

const allowedCommandSpecs = [
  ["git", ["diff", "--check"]],
  ["node", ["--test", "scripts/codex-runs/init.test.mjs"]],
  ["node", ["--test", "scripts/codex-runs/detect-approved-prompts.test.mjs"]],
  ["node", ["--test", "scripts/codex-runs/local-runner-dry-run.test.mjs"]],
  ["node", ["--test", "scripts/codex-runs/local-executor.test.mjs"]],
  ["node", ["--test", "scripts/codex-runs/codex-execution-adapter.test.mjs"]],
  ["node", ["--test", "scripts/codex-runs/prompt-scope-enforcer.test.mjs"]],
  ["node", ["--test", "scripts/codex-runs/executor-verification-runner.test.mjs"]]
];

const allowedCommandKeys = new Set(
  allowedCommandSpecs.map(([executable, args]) => buildCommandKey(executable, args))
);

export function buildSkippedExecutorVerification(reason = "verification was not requested") {
  return {
    executorVerificationVersion: 1,
    ran: false,
    commands: [],
    passed: null,
    failedCommandCount: 0,
    reason
  };
}

export function buildSkippedVerificationArtifactWrite(
  reason = "verification artifact flag not provided",
  options = {}
) {
  return {
    verificationArtifactWriteVersion: 1,
    requested: Boolean(options.requested),
    wrote: false,
    path: null,
    artifact: null,
    reason,
    errors: []
  };
}

export function buildSkippedExecutionAttemptArtifactWrite(
  reason = "attempt artifact flag not provided",
  options = {}
) {
  return {
    attemptArtifactWriteVersion: 1,
    requested: Boolean(options.requested),
    wrote: false,
    path: null,
    artifact: null,
    reason,
    errors: []
  };
}

export function extractVerificationCommandsFromPrompt(content) {
  const lines = String(content ?? "").split(/\r?\n/);
  const commands = [];
  let insideSection = false;

  for (const line of lines) {
    if (/^##\s+Verification Commands\s*$/i.test(line.trim())) {
      insideSection = true;
      continue;
    }

    if (insideSection && /^##\s+/.test(line.trim())) {
      break;
    }

    if (!insideSection) {
      continue;
    }

    const command = normalizeCommandLine(line);

    if (command) {
      commands.push(command);
    }
  }

  return commands;
}

export function validateExecutorVerificationCommand(command) {
  const normalized = normalizeCommandLine(command);
  const parsed = parseCommand(normalized);
  const errors = [];

  if (!normalized) {
    errors.push("verification command is empty");
  }

  if (shellControlPattern.test(normalized)) {
    errors.push("verification command contains shell control characters");
  }

  if (parsed.executable === "git" && gitMutationSubcommands.has(parsed.args[0])) {
    errors.push(`Git mutation command rejected: git ${parsed.args[0]}`);
  }

  if (
    parsed.executable &&
    !allowedCommandKeys.has(buildCommandKey(parsed.executable, parsed.args))
  ) {
    errors.push("verification command is not allowlisted");
  }

  return {
    command: normalized,
    executable: parsed.executable,
    args: parsed.args,
    allowed: errors.length === 0,
    errors
  };
}

export function runExecutorVerification(options = {}) {
  const commands = Array.isArray(options.commands) ? options.commands : [];
  const cwd = options.cwd ?? process.cwd();
  const env = options.env ?? process.env;
  const runner = options.runner ?? runVerificationCommand;
  const results = commands.map((command) =>
    runSingleVerificationCommand({
      command,
      cwd,
      env,
      runner
    })
  );
  const failedCommandCount = results.filter((result) => !result.passed).length;

  return {
    executorVerificationVersion: 1,
    ran: true,
    commands: results,
    passed: failedCommandCount === 0,
    failedCommandCount,
    reason:
      failedCommandCount === 0
        ? "executor-owned verification passed"
        : "executor-owned verification failed"
  };
}

export function deriveVerificationArtifactPath(sliceId, options = {}) {
  const config = loadLedgerConfig({
    rootDir: options.rootDir,
    configPath: options.configPath,
    config: options.config
  });
  const normalizedSliceId = String(sliceId ?? "").trim();

  if (!/^\d{4}-\d{2}-\d{2}-slice-\d{3}-[a-z0-9-]+$/.test(normalizedSliceId)) {
    throw new Error(`Invalid slice id for verification artifact: ${normalizedSliceId || "missing"}`);
  }

  return `${config.promptDir}/${normalizedSliceId}-verification.json`;
}

export function deriveExecutionAttemptArtifactPath(sliceId, attemptNumber, options = {}) {
  const config = loadLedgerConfig({
    rootDir: options.rootDir,
    configPath: options.configPath,
    config: options.config
  });
  const normalizedSliceId = String(sliceId ?? "").trim();
  const normalizedAttemptNumber = Number(attemptNumber);

  if (!/^\d{4}-\d{2}-\d{2}-slice-\d{3}-[a-z0-9-]+$/.test(normalizedSliceId)) {
    throw new Error(`Invalid slice id for attempt artifact: ${normalizedSliceId || "missing"}`);
  }

  if (
    !Number.isInteger(normalizedAttemptNumber) ||
    normalizedAttemptNumber < 1 ||
    normalizedAttemptNumber > 999
  ) {
    throw new Error(`Invalid attempt number: ${attemptNumber ?? "missing"}`);
  }

  return `${config.promptDir}/${normalizedSliceId}-attempt-${String(normalizedAttemptNumber).padStart(3, "0")}.json`;
}

export function findNextExecutionAttemptArtifactPath(options = {}) {
  const rootDir = path.resolve(options.rootDir ?? process.cwd());
  const config = loadLedgerConfig({
    rootDir,
    configPath: options.configPath,
    config: options.config
  });
  const codexRunsDir = path.resolve(rootDir, config.promptDir);
  const sliceId = String(options.sliceId ?? "").trim();
  let firstPath;

  try {
    firstPath = deriveExecutionAttemptArtifactPath(sliceId, 1, { config, rootDir });
  } catch (error) {
    throw error;
  }

  const prefix = `${sliceId}-attempt-`;
  const suffix = ".json";
  let highestAttemptNumber = 0;

  try {
    for (const filename of readdirSync(codexRunsDir)) {
      if (!filename.startsWith(prefix) || !filename.endsWith(suffix)) {
        continue;
      }

      const attemptNumber = Number(
        filename.slice(prefix.length, filename.length - suffix.length)
      );

      if (Number.isInteger(attemptNumber)) {
        highestAttemptNumber = Math.max(highestAttemptNumber, attemptNumber);
      }
    }
  } catch {
    return {
      attemptNumber: 1,
      path: firstPath
    };
  }

  const attemptNumber = highestAttemptNumber + 1;

  return {
    attemptNumber,
    path: deriveExecutionAttemptArtifactPath(sliceId, attemptNumber, { config, rootDir })
  };
}

export function buildExecutorVerificationArtifact(options = {}) {
  return {
    verificationArtifactVersion: 1,
    sliceId: options.sliceId,
    promptFile: options.promptFile,
    resultFile: options.resultFile,
    createdAt: options.createdAt ?? new Date().toISOString(),
    verification: options.verification
  };
}

export function buildExecutionAttemptArtifact(options = {}) {
  const env = options.env ?? {};

  return {
    attemptArtifactVersion: 1,
    sliceId: options.sliceId,
    attemptNumber: options.attemptNumber,
    createdAt: options.createdAt ?? new Date().toISOString(),
    promptFile: options.promptFile,
    resultFile: options.resultFile,
    verificationArtifactFile: options.verificationArtifactFile ?? null,
    status: options.status,
    stage: options.stage,
    codexInvoked: Boolean(options.codexInvoked),
    resultFileCreated: Boolean(options.resultFileCreated),
    verificationRan: Boolean(options.verificationRan),
    verificationArtifactCreated: Boolean(options.verificationArtifactCreated),
    reason: buildOutputPreview(options.reason, env),
    blockers: Array.isArray(options.blockers)
      ? options.blockers.map((blocker) => buildOutputPreview(blocker, env))
      : [],
    commandPreview: options.commandPreview ?? {
      codex: null,
      git: null
    }
  };
}

export function writeExecutionAttemptArtifact(options = {}) {
  const requested = Boolean(options.requested ?? true);
  let artifactLocation;

  try {
    artifactLocation = findNextExecutionAttemptArtifactPath({
      rootDir: options.rootDir,
      sliceId: options.sliceId,
      configPath: options.configPath,
      config: options.config
    });
  } catch (error) {
    return {
      attemptArtifactWriteVersion: 1,
      requested,
      wrote: false,
      path: null,
      artifact: null,
      reason: "attempt artifact path derivation failed",
      errors: [error instanceof Error ? error.message : String(error)]
    };
  }

  const rootDir = path.resolve(options.rootDir ?? process.cwd());
  const config = loadLedgerConfig({
    rootDir,
    configPath: options.configPath,
    config: options.config
  });
  const codexRunsDir = path.resolve(rootDir, config.promptDir);
  const absoluteArtifactPath = path.resolve(rootDir, artifactLocation.path);

  if (!isPathInsideDirectory(absoluteArtifactPath, codexRunsDir)) {
    return {
      attemptArtifactWriteVersion: 1,
      requested,
      wrote: false,
      path: artifactLocation.path,
      artifact: null,
      reason: `attempt artifact path is outside ${config.promptDir}`,
      errors: [`Attempt artifact path outside ${config.promptDir}: ${artifactLocation.path}`]
    };
  }

  if (existsSync(absoluteArtifactPath)) {
    return {
      attemptArtifactWriteVersion: 1,
      requested,
      wrote: false,
      path: artifactLocation.path,
      artifact: null,
      reason: "attempt artifact already exists",
      errors: [`Attempt artifact already exists: ${artifactLocation.path}`]
    };
  }

  const artifact = buildExecutionAttemptArtifact({
    ...options,
    attemptNumber: artifactLocation.attemptNumber
  });

  writeFileSync(absoluteArtifactPath, `${JSON.stringify(artifact, null, 2)}\n`);

  return {
    attemptArtifactWriteVersion: 1,
    requested,
    wrote: true,
    path: artifactLocation.path,
    artifact,
    reason: "attempt artifact written",
    errors: []
  };
}

export function writeExecutorVerificationArtifact(options = {}) {
  const requested = Boolean(options.requested ?? true);
  const verification = options.verification;
  let artifactPath;

  try {
    artifactPath = deriveVerificationArtifactPath(options.sliceId, options);
  } catch (error) {
    return {
      verificationArtifactWriteVersion: 1,
      requested,
      wrote: false,
      path: null,
      artifact: null,
      reason: "verification artifact path derivation failed",
      errors: [error instanceof Error ? error.message : String(error)]
    };
  }

  if (verification?.ran !== true) {
    return {
      verificationArtifactWriteVersion: 1,
      requested,
      wrote: false,
      path: artifactPath,
      artifact: null,
      reason: "executor-owned verification did not run",
      errors: []
    };
  }

  const rootDir = path.resolve(options.rootDir ?? process.cwd());
  const config = loadLedgerConfig({
    rootDir,
    configPath: options.configPath,
    config: options.config
  });
  const codexRunsDir = path.resolve(rootDir, config.promptDir);
  const absoluteArtifactPath = path.resolve(rootDir, artifactPath);

  if (!isPathInsideDirectory(absoluteArtifactPath, codexRunsDir)) {
    return {
      verificationArtifactWriteVersion: 1,
      requested,
      wrote: false,
      path: artifactPath,
      artifact: null,
      reason: `verification artifact path is outside ${config.promptDir}`,
      errors: [`Verification artifact path outside ${config.promptDir}: ${artifactPath}`]
    };
  }

  if (existsSync(absoluteArtifactPath)) {
    return {
      verificationArtifactWriteVersion: 1,
      requested,
      wrote: false,
      path: artifactPath,
      artifact: null,
      reason: "verification artifact already exists",
      errors: [`Verification artifact already exists: ${artifactPath}`]
    };
  }

  const artifact = buildExecutorVerificationArtifact({
    sliceId: options.sliceId,
    promptFile: options.promptFile,
    resultFile: options.resultFile,
    createdAt: options.createdAt,
    verification
  });

  writeFileSync(absoluteArtifactPath, `${JSON.stringify(artifact, null, 2)}\n`);

  return {
    verificationArtifactWriteVersion: 1,
    requested,
    wrote: true,
    path: artifactPath,
    artifact,
    reason: "verification artifact written",
    errors: []
  };
}

function runSingleVerificationCommand({ command, cwd, env, runner }) {
  const validation = validateExecutorVerificationCommand(command);
  const startedAt = Date.now();

  if (!validation.allowed) {
    return {
      command: validation.command,
      cwd,
      exitCode: null,
      passed: false,
      stdoutPreview: "",
      stderrPreview: validation.errors.join("; "),
      durationMs: Date.now() - startedAt,
      invoked: false,
      validationErrors: validation.errors
    };
  }

  let rawResult;

  try {
    rawResult = runner({
      executable: validation.executable,
      args: [...validation.args],
      cwd,
      env
    });
  } catch (error) {
    rawResult = {
      exitCode: 1,
      stdout: "",
      stderr: error instanceof Error ? error.message : String(error)
    };
  }

  const result = normalizeRunnerResult(rawResult);
  const durationMs =
    typeof rawResult?.durationMs === "number" ? rawResult.durationMs : Date.now() - startedAt;

  return {
    command: validation.command,
    cwd,
    exitCode: result.exitCode,
    passed: result.exitCode === 0,
    stdoutPreview: buildOutputPreview(result.stdout, env),
    stderrPreview: buildOutputPreview(result.stderr, env),
    durationMs,
    invoked: true,
    validationErrors: []
  };
}

function runVerificationCommand({ executable, args, cwd, env }) {
  const child = spawnSync(executable, args, {
    cwd,
    env,
    encoding: "utf8",
    shell: false
  });

  return {
    exitCode: child.status ?? (child.error ? 1 : 0),
    stdout: child.stdout ?? "",
    stderr: child.stderr ?? (child.error?.message ?? "")
  };
}

function normalizeCommandLine(line) {
  let command = String(line ?? "").trim();

  command = command.replace(/^[-*]\s+/, "").trim();

  if (command.startsWith("`") && command.endsWith("`")) {
    command = command.slice(1, -1).trim();
  }

  return command.replace(/\s+/g, " ");
}

function parseCommand(command) {
  if (!command) {
    return { executable: null, args: [] };
  }

  const [executable, ...args] = command.split(" ");

  return {
    executable,
    args
  };
}

function buildCommandKey(executable, args) {
  return [executable, ...args].join("\u0000");
}

function normalizeRunnerResult(result = {}) {
  return {
    exitCode: typeof result.exitCode === "number" ? result.exitCode : 0,
    stdout: typeof result.stdout === "string" ? result.stdout : "",
    stderr: typeof result.stderr === "string" ? result.stderr : ""
  };
}

function buildOutputPreview(value, env) {
  let preview = String(value ?? "").slice(0, outputPreviewLimit);

  for (const secretValue of getSecretValues(env)) {
    preview = preview.split(secretValue).join("[redacted]");
  }

  return preview;
}

function getSecretValues(env) {
  return Object.entries(env ?? {})
    .filter(([key, value]) => secretNamePattern.test(key) && typeof value === "string")
    .map(([, value]) => value)
    .filter((value) => value.length >= 4);
}

function isPathInsideDirectory(filePath, directoryPath) {
  const relative = path.relative(directoryPath, filePath);

  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}
