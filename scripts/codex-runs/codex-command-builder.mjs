import path from "node:path";
import { isPathUnderAllowedRoots, loadLedgerConfig } from "./config.mjs";

const shellControlPattern = /[;&|`$><\r\n]/;

export function buildCodexInvocationCommand(options = {}) {
  const config = loadLedgerConfig({
    rootDir: options.repoRoot ?? options.cwd,
    configPath: options.configPath,
    config: options.config
  });
  const promptFile = normalizePromptPath(options.promptFile);
  const promptInput = `Read and follow the Codex prompt file at ${promptFile}. Do not create any files outside the prompt scope. Write the paired result file required by the prompt.`;
  const cwd = options.cwd ?? options.repoRoot;
  const mode = options.mode ?? "exec";
  const extraArgs = Array.isArray(options.extraArgs) ? options.extraArgs : [];
  const command = {
    executable: "codex",
    args: [
      mode,
      "--full-auto",
      ...extraArgs,
      "--",
      "-"
    ],
    cwd,
    promptFile,
    promptInput,
    usesShell: false,
    willExecute: false
  };
  const validation = validateCodexInvocationCommand(command, { config });

  if (!validation.valid) {
    throw new Error(validation.errors.join("; "));
  }

  return command;
}

export function validateCodexInvocationCommand(command = {}, options = {}) {
  const errors = [];
  const config = options.config ?? loadLedgerConfig({ rootDir: command.cwd });

  if (command.executable !== "codex") {
    errors.push("executable must be exactly codex");
  }

  if (!Array.isArray(command.args)) {
    errors.push("args must be an array");
  } else {
    if (!command.args.includes("exec")) {
      errors.push("args must include exec");
    }

    if (!command.args.includes("--")) {
      errors.push("args must include --");
    }
  }

  errors.push(...validatePromptFile(command.promptFile, config));

  if (!command.cwd) {
    errors.push("cwd or repoRoot must be present");
  }

  if (command.usesShell !== false) {
    errors.push("usesShell must be false");
  }

  if (command.willExecute !== false) {
    errors.push("willExecute must be false");
  }

  if (typeof command.promptInput !== "string" || command.promptInput.length === 0) {
    errors.push("promptInput must be present");
  }

  return {
    errors,
    valid: errors.length === 0
  };
}

function validatePromptFile(promptFile, config) {
  const errors = [];

  if (typeof promptFile !== "string" || promptFile.length === 0) {
    return ["promptFile must be present"];
  }

  const normalized = normalizePromptPath(promptFile);

  if (path.isAbsolute(promptFile)) {
    errors.push("promptFile must be a relative path");
  }

  if (shellControlPattern.test(promptFile)) {
    errors.push("promptFile must not contain shell control characters");
  }

  if (!isPathUnderAllowedRoots(normalized, [`${config.promptDir}/`])) {
    errors.push(`promptFile must be under ${config.promptDir}/`);
  }

  if (!normalized.endsWith("-prompt.md")) {
    errors.push("promptFile must end with -prompt.md");
  }

  if (normalized.split("/").includes("..")) {
    errors.push("promptFile must not contain parent-directory segments");
  }

  return errors;
}

function normalizePromptPath(promptFile) {
  return String(promptFile ?? "").split(path.sep).join("/");
}
