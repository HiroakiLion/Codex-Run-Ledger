import path from "node:path";
import {
  describeAllowedBranches,
  isAllowedTargetBranch,
  isPathUnderAllowedRoots,
  loadLedgerConfig
} from "./config.mjs";

const shellControlPattern = /[;&|`$><\r\n]|\\[rn]/;

export function buildGitCommandPreview(options = {}) {
  return buildGitExecutionPlan(options);
}

export function buildGitExecutionPlan(options = {}) {
  const sliceId = normalizeToken(options.sliceId);
  const targetBranch = normalizeToken(options.targetBranch);
  const config = loadLedgerConfig({
    rootDir: options.repoRoot ?? options.cwd,
    configPath: options.configPath,
    config: options.config
  });
  const cwd = options.cwd ?? options.repoRoot;
  const promptFile = normalizePath(options.promptFile);
  const resultFile = normalizePath(options.resultFile);
  const changedFiles = normalizeChangedFiles(options.changedFiles);
  const includePush = options.includePush === true;

  const addPaths = uniquePaths([promptFile, resultFile, ...changedFiles]);
  const checkoutArgs =
    config.stableTargetBranches.includes(targetBranch)
      ? ["checkout", targetBranch]
      : ["checkout", "-B", targetBranch];
  const commands = [
    gitCommand("status", ["status", "--short", "--branch"]),
    gitCommand("checkoutTargetBranch", checkoutArgs),
    gitCommand("addRunFiles", ["add", ...addPaths]),
    gitCommand("commit", ["commit", "-m", `codex: complete ${sliceId}`])
  ];

  if (includePush) {
    commands.push(gitCommand("push", ["push", "origin", targetBranch]));
  }

  const plan = {
    gitPlanVersion: 1,
    sliceId,
    targetBranch,
    cwd,
    promptFile,
    resultFile,
    changedFiles,
    usesShell: false,
    willExecute: false,
    commands
  };
  const validation = validateGitCommandPreview(plan, { config });

  if (!validation.valid) {
    throw new Error(validation.errors.join("; "));
  }

  return plan;
}

export function validateGitCommandPreview(plan = {}, options = {}) {
  const errors = [];
  const config = options.config ?? loadLedgerConfig({ rootDir: plan.cwd });

  if (plan.gitPlanVersion !== 1) {
    errors.push("gitPlanVersion must be 1");
  }

  errors.push(...validateSliceId(plan.sliceId));
  errors.push(...validateTargetBranch(plan.targetBranch, plan.sliceId, config));

  if (!plan.cwd) {
    errors.push("cwd or repoRoot must be present");
  }

  errors.push(...validatePromptFile(plan.promptFile, config));
  errors.push(...validateResultFile(plan.resultFile, config));

  if (plan.usesShell !== false) {
    errors.push("plan usesShell must be false");
  }

  if (plan.willExecute !== false) {
    errors.push("plan willExecute must be false");
  }

  if (!Array.isArray(plan.commands)) {
    errors.push("commands must be an array");
  } else {
    for (const command of plan.commands) {
      errors.push(...validateGitCommand(command));
    }
  }

  return {
    errors,
    valid: errors.length === 0
  };
}

function gitCommand(name, args) {
  return {
    name,
    executable: "git",
    args,
    usesShell: false,
    willExecute: false
  };
}

function validateGitCommand(command = {}) {
  const errors = [];

  if (command.executable !== "git") {
    errors.push("every command executable must be exactly git");
  }

  if (!Array.isArray(command.args)) {
    errors.push("every command args must be an array");
  }

  if (command.usesShell !== false) {
    errors.push("every command usesShell must be false");
  }

  if (command.willExecute !== false) {
    errors.push("every command willExecute must be false");
  }

  return errors;
}

function validateSliceId(sliceId) {
  if (typeof sliceId !== "string" || sliceId.length === 0) {
    return ["sliceId must be present"];
  }

  return validateSafeToken(sliceId, "sliceId");
}

function validateTargetBranch(targetBranch, sliceId, config) {
  const errors = [];

  if (typeof targetBranch !== "string" || targetBranch.length === 0) {
    return ["targetBranch must be present"];
  }

  errors.push(...validateSafeToken(targetBranch, "targetBranch"));

  if (config.forbiddenTargetBranches.includes(targetBranch)) {
    errors.push(`targetBranch must not be ${targetBranch}`);
  }

  if (sliceId && !isAllowedTargetBranch(targetBranch, sliceId, config)) {
    errors.push(`targetBranch must be ${describeAllowedBranches(config, sliceId)}`);
  }

  return errors;
}

function validatePromptFile(promptFile, config) {
  const errors = validateRunFile(promptFile, "promptFile", config);

  if (typeof promptFile === "string" && !normalizePath(promptFile).endsWith("-prompt.md")) {
    errors.push("promptFile must end with -prompt.md");
  }

  return errors;
}

function validateResultFile(resultFile, config) {
  const errors = validateRunFile(resultFile, "resultFile", config);

  if (typeof resultFile === "string" && !normalizePath(resultFile).endsWith("-result.md")) {
    errors.push("resultFile must end with -result.md");
  }

  return errors;
}

function validateRunFile(filePath, label, config) {
  const errors = [];

  if (typeof filePath !== "string" || filePath.length === 0) {
    return [`${label} must be present`];
  }

  const normalized = normalizePath(filePath);

  if (path.isAbsolute(filePath)) {
    errors.push(`${label} must be a relative path`);
  }

  if (shellControlPattern.test(filePath)) {
    errors.push(`${label} must not contain shell control characters`);
  }

  if (!isPathUnderAllowedRoots(normalized, [`${config.promptDir}/`])) {
    errors.push(`${label} must be under ${config.promptDir}/`);
  }

  if (normalized.split("/").includes("..")) {
    errors.push(`${label} must not contain parent-directory segments`);
  }

  return errors;
}

function validateSafeToken(value, label) {
  const errors = [];

  if (shellControlPattern.test(value)) {
    errors.push(`${label} must not contain shell control characters`);
  }

  return errors;
}

function normalizeToken(value) {
  return String(value ?? "");
}

function normalizePath(filePath) {
  return String(filePath ?? "").split(path.sep).join("/");
}

function normalizeChangedFiles(changedFiles) {
  if (!Array.isArray(changedFiles)) {
    return [];
  }

  return changedFiles.map((filePath) => normalizePath(filePath));
}

function uniquePaths(paths) {
  return Array.from(new Set(paths.filter((filePath) => filePath.length > 0)));
}
