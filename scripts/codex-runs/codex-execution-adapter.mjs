import { spawnSync } from "node:child_process";
import path from "node:path";

const outputPreviewLimit = 1000;
const envPreviewLimit = 30;
const pathPreviewLimit = 8;
const secretNamePattern = /(SECRET|TOKEN|KEY|PASSWORD|PASS|AUTH|CREDENTIAL|COOKIE|SESSION)/i;
const windowsExecutableCandidates = ["codex.cmd", "codex.exe", "codex"];
const recoverableSpawnErrorCodes = new Set(["ENOENT", "ENOEXEC", "EACCES"]);
const cmdWrapperExecutable = "cmd";

export function buildCodexExecutableCandidates(executable, options = {}) {
  const platform = options.platform ?? process.platform;

  if (executable !== "codex") {
    return [executable];
  }

  return platform === "win32" ? windowsExecutableCandidates : ["codex"];
}

export function evaluateCodexExecutionRequest(options = {}) {
  return buildCodexExecutionAdapterResult(options);
}

export function createCodexExecutionAdapter(options = {}) {
  return {
    evaluate(request = {}) {
      return evaluateCodexExecutionRequest({
        ...options,
        ...request
      });
    },
    invoke(request = {}) {
      return invokeCodexForDocsOnlyPrompt({
        ...options,
        ...request
      });
    }
  };
}

export function buildCodexExecutionAdapterResult(options = {}) {
  const executionRequested = Boolean(options.enableCodexExecution);
  const docsOnly = Boolean(options.docsOnly);
  const runCodexNow = Boolean(options.runCodexNow);
  const readinessReport = options.readinessReport ?? null;
  const nodePreflight =
    options.nodePreflight ??
    buildNodeAvailabilityPreflight(options.nodePreflightOptions ?? {});
  const readinessBlockers = getReadinessBlockers(readinessReport);
  const gateBlockers = getGateBlockers({
    ...options,
    nodePreflight
  });

  if (!executionRequested) {
    return {
      adapterVersion: 1,
      executionRequested: false,
      docsOnly,
      runCodexNow,
      nodePreflight,
      executionAllowed: false,
      executionImplemented: true,
      wouldInvokeCodex: false,
      reason: "execution flag not provided",
      blockers: ["execution flag not provided"]
    };
  }

  if (!docsOnly) {
    return {
      adapterVersion: 1,
      executionRequested: true,
      docsOnly: false,
      runCodexNow,
      nodePreflight,
      executionAllowed: false,
      executionImplemented: true,
      wouldInvokeCodex: false,
      reason: "--docs-only flag required for any future real Codex execution",
      blockers: ["--docs-only flag required"]
    };
  }

  const blockers = [...readinessBlockers, ...gateBlockers];

  if (blockers.length > 0) {
    return {
      adapterVersion: 1,
      executionRequested: true,
      docsOnly: true,
      runCodexNow,
      nodePreflight,
      executionAllowed: false,
      executionImplemented: true,
      wouldInvokeCodex: false,
      reason: blockers[0],
      blockers
    };
  }

  if (!runCodexNow) {
    return {
      adapterVersion: 1,
      executionRequested: true,
      docsOnly: true,
      runCodexNow: false,
      nodePreflight,
      executionAllowed: true,
      executionImplemented: true,
      wouldInvokeCodex: false,
      reason: "--run-codex-now flag not provided; evaluation only",
      blockers: []
    };
  }

  return {
    adapterVersion: 1,
    executionRequested: true,
    docsOnly: true,
    runCodexNow: true,
    nodePreflight,
    executionAllowed: true,
    executionImplemented: true,
    wouldInvokeCodex: true,
    reason: "ready to invoke Codex",
    blockers: []
  };
}

export function buildNodeAvailabilityPreflight(options = {}) {
  const env = options.env ?? process.env;
  const processExecPath =
    typeof options.execPath === "string" ? options.execPath : process.execPath;
  const processVersion =
    typeof options.version === "string" ? options.version : process.version;
  const environmentContract = buildCodexExecutionEnvironment({
    env,
    nodeExecPath: processExecPath,
    prependNodePath: options.prependNodePath !== false
  });
  const errors = [];

  if (!processExecPath) {
    errors.push("process.execPath is unavailable");
  }

  if (!environmentContract.explicitNodeBinaryPathAvailable) {
    errors.push("explicit Node binary path is unavailable");
  }

  if (!processVersion) {
    errors.push("process.version is unavailable");
  }

  return {
    nodePreflightVersion: 1,
    available: errors.length === 0,
    processExecPath: processExecPath || null,
    processVersion: processVersion || null,
    explicitNodeBinaryPathAvailable:
      environmentContract.explicitNodeBinaryPathAvailable,
    nodeBinaryDirectory: environmentContract.nodeBinaryDirectory,
    pathKey: environmentContract.pathKey,
    pathEntryCount: environmentContract.pathEntryCount,
    pathPreview: environmentContract.pathPreview,
    pathWasAugmented: environmentContract.pathWasAugmented,
    augmentedPathPreview: environmentContract.augmentedPathPreview,
    controlledEnvPreview: environmentContract.envPreview,
    errors,
    warnings: environmentContract.warnings
  };
}

export function buildCodexExecutionEnvironment(options = {}) {
  const sourceEnv = options.env ?? process.env;
  const env = { ...sourceEnv };
  const pathKey = findPathEnvKey(env) ?? "PATH";
  const originalPath = typeof env[pathKey] === "string" ? env[pathKey] : "";
  const nodeExecPath =
    typeof options.nodeExecPath === "string" ? options.nodeExecPath : process.execPath;
  const nodeBinaryDirectory = nodeExecPath ? path.dirname(nodeExecPath) : null;
  const explicitNodeBinaryPathAvailable = Boolean(nodeExecPath && nodeBinaryDirectory);
  const pathEntries = splitPathValue(originalPath);
  let pathWasAugmented = false;
  const warnings = [];

  if (explicitNodeBinaryPathAvailable && options.prependNodePath !== false) {
    if (!pathEntries.some((entry) => samePathEntry(entry, nodeBinaryDirectory))) {
      env[pathKey] = originalPath
        ? `${nodeBinaryDirectory}${path.delimiter}${originalPath}`
        : nodeBinaryDirectory;
      pathWasAugmented = true;
    }
  } else if (!explicitNodeBinaryPathAvailable) {
    warnings.push("Node binary directory could not be determined from process.execPath.");
  }

  const augmentedPathEntries = splitPathValue(env[pathKey]);

  return {
    env,
    envPreview: buildControlledEnvPreview(env),
    pathKey,
    pathEntryCount: pathEntries.length,
    pathPreview: sanitizePathPreview(pathEntries, sourceEnv),
    pathWasAugmented,
    augmentedPathPreview: sanitizePathPreview(augmentedPathEntries, sourceEnv),
    nodeBinaryDirectory,
    explicitNodeBinaryPathAvailable,
    warnings
  };
}

export function checkCodexCliAvailability(options = {}) {
  const executable = "codex";
  const args = ["--version"];
  const runner = options.runner;
  let result;
  let resolvedExecutable = executable;

  try {
    const metadataResult = runCodexMetadataCommand({
      executable,
      args: [...args],
      cwd: options.cwd,
      env: options.env,
      platform: options.platform ?? process.platform,
      runner
    });
    resolvedExecutable = metadataResult.resolvedExecutable;

    result = normalizeCliCheckRunnerResult({
      exitCode: metadataResult.exitCode,
      stdout: metadataResult.stdout,
      stderr: metadataResult.stderr,
      errorMessage: metadataResult.errorMessage
    });
  } catch (error) {
    result = normalizeCliCheckRunnerResult({
      exitCode: 1,
      errorMessage: error instanceof Error ? error.message : String(error)
    });
  }
  const errors = [];

  if (result.errorMessage) {
    errors.push(result.errorMessage);
  }

  if (result.exitCode !== 0) {
    errors.push(`codex --version exited with code ${result.exitCode}`);
  }

  return {
    cliCheckVersion: 1,
    executable,
    available: errors.length === 0,
    command: [resolvedExecutable, ...args],
    exitCode: result.exitCode,
    stdoutPreview: truncateOutput(result.stdout),
    stderrPreview: truncateOutput(result.stderr),
    errors,
    warnings: []
  };
}

export function buildSkippedCodexCliAvailabilityCheck() {
  return {
    cliCheckVersion: 1,
    executable: "codex",
    available: false,
    skipped: true,
    command: ["codex", "--version"],
    exitCode: null,
    stdoutPreview: "",
    stderrPreview: "",
    errors: ["Codex CLI availability check was skipped"],
    warnings: [
      "Skipping Codex CLI availability check prevents live execution readiness."
    ]
  };
}

export function invokeCodexForDocsOnlyPrompt(options = {}) {
  const commandPreview = options.commandPreview ?? options.codexCommandPreview;
  const validation = validateCodexExecutionCommandPreview(commandPreview);
  const nodePreflight =
    options.nodePreflight ??
    buildNodeAvailabilityPreflight({
      env: options.env,
      execPath: options.nodeExecPath,
      prependNodePath: options.prependNodePath
    });

  if (!validation.valid) {
    throw new Error(validation.errors.join("; "));
  }

  if (nodePreflight.available !== true) {
    throw new Error("Node availability preflight failed");
  }

  const executionEnvironment =
    options.executionEnvironment ??
    buildCodexExecutionEnvironment({
      env: options.env,
      nodeExecPath: nodePreflight.processExecPath,
      prependNodePath: options.prependNodePath
    });
  const runner = options.runner ?? runCodexCommand;
  let result;

  try {
    const promptInput = commandPreview.promptInput;

    result = runner({
      executable: commandPreview.executable,
      args: [...commandPreview.args],
      cwd: commandPreview.cwd,
      env: executionEnvironment.env,
      executionEnvironmentPreview: executionEnvironment.envPreview,
      input: typeof promptInput === "string" ? promptInput : undefined,
      platform: options.platform ?? process.platform
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return normalizeInvocationResult({
      invoked: false,
      exitCode: 1,
      stdout: "",
      stderr: "Failed to launch Codex on this machine. Ensure the Codex CLI is installed and discoverable on PATH; on Windows, use codex.cmd/codex.exe/codex wrappers.",
      errorMessage: message,
      errorCode: "E_CLI_NOT_AVAILABLE"
    });
  }

  return normalizeInvocationResult(result);
}

export function validateCodexExecutionCommandPreview(command = {}) {
  const errors = [];

  if (command.executable !== "codex") {
    errors.push("executable must be exactly codex");
  }

  if (!Array.isArray(command.args)) {
    errors.push("args must be an array");
  }

  if (command.usesShell !== false) {
    errors.push("usesShell must be false");
  }

  if (command.willExecute !== false && command.previewOnly !== true) {
    errors.push("command preview must remain non-executing before adapter conversion");
  }

  if (!command.cwd) {
    errors.push("cwd must be present");
  }

  if (typeof command.promptInput !== "string" || command.promptInput.length === 0) {
    errors.push("promptInput must be present");
  }

  return {
    errors,
    valid: errors.length === 0
  };
}

function getReadinessBlockers(readinessReport) {
  if (!readinessReport || !Array.isArray(readinessReport.checks)) {
    return [];
  }

  return readinessReport.checks
    .filter(
      (check) =>
        check.severity === "blocker" &&
        check.passed === false &&
        check.name !== "real Codex execution implemented"
    )
    .map((check) => `${check.name}: ${check.details}`);
}

function getGateBlockers(options) {
  const blockers = [];

  if (!options.plan) {
    blockers.push("selected prompt missing");
  }

  if (options.dirtyTreePolicy?.futureExecutionBlocked) {
    blockers.push(options.dirtyTreePolicy.reason ?? "dirty working tree blocks execution");
  }

  if (options.scopePolicy && options.scopePolicy.docsOnly !== true) {
    blockers.push("docs-only scope violation blocks real execution");
  }

  if (!options.cliCheck || options.cliCheck.available !== true) {
    blockers.push("Codex CLI availability check failed");
  }

  if (!options.nodePreflight || options.nodePreflight.available !== true) {
    blockers.push("Node availability preflight failed");
  }

  const commandValidation = validateCodexExecutionCommandPreview(
    options.commandPreview ?? options.codexCommandPreview
  );

  if (!commandValidation.valid) {
    blockers.push(`Codex command preview invalid: ${commandValidation.errors.join("; ")}`);
  }

  return blockers;
}

function runCodexMetadataCommand({
  executable,
  args,
  cwd,
  env,
  platform = process.platform,
  runner
}) {
  const result = executeCodexCommand({
    executable,
    args,
    cwd,
    env,
    platform,
    runner: runner ?? null
  });

  return {
    exitCode: result.exitCode,
    stdout: result.stdout,
    stderr: result.stderr,
    errorMessage: result.errorMessage,
    resolvedExecutable: result.resolvedExecutable,
    resolvedUsingCmdWrapper: result.resolvedUsingCmdWrapper
  };
}

function runCodexCommand({
  executable,
  args,
  cwd,
  env,
  platform = process.platform,
  runner
}) {
  const result = executeCodexCommand({
    executable,
    args,
    cwd,
    env,
    platform,
    runner: runner ?? null
  });

  return {
    invoked: true,
    exitCode: typeof result.exitCode === "number" ? result.exitCode : 0,
    stdout: typeof result.stdout === "string" ? result.stdout : "",
    stderr: typeof result.stderr === "string" ? result.stderr : ""
  };
}

function normalizeCliCheckRunnerResult(result = {}) {
  return {
    exitCode: typeof result.exitCode === "number" ? result.exitCode : 0,
    stdout: typeof result.stdout === "string" ? result.stdout : "",
    stderr: typeof result.stderr === "string" ? result.stderr : "",
    errorMessage:
      typeof result.errorMessage === "string" && result.errorMessage.length > 0
        ? result.errorMessage
        : null
  };
}

function normalizeInvocationResult(result = {}) {
  return {
    invoked: Boolean(result.invoked ?? true),
    exitCode: typeof result.exitCode === "number" ? result.exitCode : 0,
    stdout: typeof result.stdout === "string" ? result.stdout : "",
    stderr: typeof result.stderr === "string" ? result.stderr : "",
    errorMessage: typeof result.errorMessage === "string" ? result.errorMessage : null,
    errorCode: typeof result.errorCode === "string" ? result.errorCode : null
  };
}

function executeCodexCommand(options = {}) {
  const executable = String(options.executable ?? "codex");
  const args = Array.isArray(options.args) ? [...options.args] : [];
  const cwd = options.cwd;
  const env = options.env;
  const platform = options.platform ?? process.platform;
  const input = options.input;
  const candidates = buildCodexExecutableCandidates(executable, { platform });
  let lastAttempt = null;

  for (const candidate of candidates) {
    const attempt = spawnCodexExecutable({
      executable: candidate,
      args,
      cwd,
      env,
      platform,
      input,
      runner: options.runner
    });
    if (!isRecoverableSpawnFailure(attempt)) {
      return {
        ...attempt,
        resolvedExecutable: candidate,
        resolvedUsingCmdWrapper: isCmdWrapperExecutable(candidate)
      };
    }

    lastAttempt = attempt;
  }

  throw new Error(buildCodexResolutionError({
    executable,
    platform,
    candidates,
    lastAttempt
  }));
}

function spawnCodexExecutable({
  executable,
  args,
  cwd,
  env,
  platform,
  input,
  runner
}) {
  const launch = buildCodexSpawnSpec(executable, args);
  const result = runSpawnSyncOrHook({
    executable: launch.executable,
    args: launch.args,
    cwd,
    env,
    shell: launch.shell,
    input,
    runner,
    platform,
    codexExecutable: executable
  });

  return result;
}

function buildCodexSpawnSpec(executable, args) {
  if (!isCmdWrapperExecutable(executable)) {
    return {
      executable,
      args: [...args],
      shell: false
    };
  }

  return {
    executable: cmdWrapperExecutable,
    args: ["/d", "/c", buildShellCommandLine([executable, ...args])],
    shell: false
  };
}

function runSpawnSyncOrHook({ executable, args, cwd, env, shell, input, runner }) {
  if (typeof runner === "function") {
    const result = runner({
      executable,
      args,
      cwd,
      env,
      shell,
      input
    });

    return normalizeRunnerResult(result);
  }

  const child = spawnSync(executable, args, {
    cwd,
    encoding: "utf8",
    env,
    shell,
    input
  });

  return normalizeRunnerResult(child);
}

function normalizeRunnerResult(result = {}) {
  const error = result.error;
  const errorCode = typeof result.errorCode === "string"
    ? result.errorCode
    : typeof error?.code === "string"
      ? error.code
      : null;

  return {
    exitCode: typeof result.status === "number"
      ? result.status
      : typeof result.exitCode === "number"
      ? result.exitCode
      : error
      ? 1
      : 0,
    stdout: typeof result.stdout === "string" ? result.stdout : "",
    stderr: typeof result.stderr === "string" ? result.stderr : "",
    errorMessage: typeof result.errorMessage === "string"
      ? result.errorMessage
      : typeof error?.message === "string"
      ? error.message
      : null,
    errorCode
  };
}

function isRecoverableSpawnFailure(result = {}) {
  return (
    typeof result.errorCode === "string" &&
    recoverableSpawnErrorCodes.has(result.errorCode)
  );
}

function buildCodexResolutionError({ executable, platform, candidates, lastAttempt }) {
  const platformHint =
    platform === "win32"
      ? "Windows: ensure one of codex.cmd, codex.exe, or codex is installed and on PATH"
      : "ensure `codex` is installed and on PATH";
  const details = lastAttempt?.errorMessage ? ` (${lastAttempt.errorMessage})` : "";

  return `Codex CLI was not runnable with ${executable}. Tried ${candidates.join(", ")}${details}. ${platformHint}.`;
}

function isCmdWrapperExecutable(value) {
  return typeof value === "string" && /\.(cmd|bat)$/i.test(value);
}

function buildShellCommandLine(parts) {
  return parts
    .filter((part) => part !== undefined)
    .map((part) => {
      const value = String(part);

      if (value.length === 0) {
        return "\"\"";
      }

      if (/[ \t"]/g.test(value)) {
        return `"${value.replace(/"/g, '\\"')}"`;
      }

      return value;
    })
    .join(" ");
}

function truncateOutput(value) {
  return String(value ?? "").slice(0, outputPreviewLimit);
}

function findPathEnvKey(env) {
  return Object.keys(env).find((key) => key.toUpperCase() === "PATH") ?? null;
}

function splitPathValue(value) {
  if (typeof value !== "string" || value.length === 0) {
    return [];
  }

  return value.split(path.delimiter).filter((entry) => entry.length > 0);
}

function samePathEntry(left, right) {
  if (!left || !right) {
    return false;
  }

  return path.resolve(left).toLowerCase() === path.resolve(right).toLowerCase();
}

function sanitizePathPreview(entries, env) {
  return entries.slice(0, pathPreviewLimit).map((entry) => sanitizePathEntry(entry, env));
}

function sanitizePathEntry(entry, env) {
  let sanitized = String(entry ?? "");
  const replacements = [
    ["%USERPROFILE%", env.USERPROFILE],
    ["$HOME", env.HOME]
  ];

  for (const [label, value] of replacements) {
    if (typeof value === "string" && value.length > 0) {
      sanitized = sanitized.split(value).join(label);
    }
  }

  return sanitized;
}

function buildControlledEnvPreview(env) {
  const entries = Object.entries(env)
    .slice(0, envPreviewLimit)
    .map(([key, value]) => ({
      key,
      valuePreview: buildEnvValuePreview(key, value, env)
    }));

  return {
    envPreviewVersion: 1,
    totalKeys: Object.keys(env).length,
    previewedKeys: entries.length,
    entries
  };
}

function buildEnvValuePreview(key, value, env) {
  if (secretNamePattern.test(key)) {
    return "[redacted]";
  }

  if (key.toUpperCase() === "PATH") {
    return sanitizePathPreview(splitPathValue(String(value ?? "")), env).join(path.delimiter);
  }

  return value === undefined || value === null || value === "" ? "" : "[present]";
}
