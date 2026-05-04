import { spawnSync } from "node:child_process";
import path from "node:path";
import {
  describeAllowedBranches,
  isAllowedTargetBranch,
  loadLedgerConfig
} from "./config.mjs";

const shellControlPattern = /[;&|`$><\r\n]|\\[rn]/;

export function inspectGitStatus(options = {}) {
  const cwd = path.resolve(options.cwd ?? options.repoRoot ?? process.cwd());
  const targetBranch = options.targetBranch ?? null;
  const sliceId = options.sliceId ?? null;
  const runReadOnlyGitCommand = typeof options.runGit === "function"
    ? options.runGit
    : runReadOnlyGit;
  const config = loadLedgerConfig({
    rootDir: cwd,
    configPath: options.configPath,
    config: options.config
  });
  const errors = [];
  const warnings = [];

  const branchResult = runReadOnlyGitCommand(["branch", "--show-current"], cwd);
  const statusResult = runReadOnlyGitCommand(["status", "--porcelain=v1", "--branch"], cwd);

  if (!branchResult.ok) {
    warnings.push(branchResult.message);
  }

  if (!statusResult.ok) {
    warnings.push(statusResult.message);
  }

  if (!branchResult.ok && !statusResult.ok) {
    warnings.push(
      "Branch detection failed: both `git branch --show-current` and `git status --porcelain=v1 --branch` failed."
    );
  }

  const parsed = statusResult.ok
    ? parsePorcelainBranchStatus(statusResult.stdout)
    : {
        currentBranch: branchResult.ok ? branchResult.stdout.trim() : null,
        dirtyPaths: [],
        isDirty: false
      };
  const branchFromShowCurrent = branchResult.ok ? branchResult.stdout.trim() : "";
  const currentBranch = branchFromShowCurrent || parsed.currentBranch;

  if (!branchFromShowCurrent && statusResult.ok && parsed.currentBranch) {
    warnings.push(
      "Branch detection fallback used: `git status --porcelain=v1 --branch` provided the branch name."
    );
  }

  const branchValidation = currentBranch
    ? validateCurrentBranchAgainstTarget({
        currentBranch,
        targetBranch,
        sliceId,
        config
      })
    : {
        branchAllowed: false,
        branchMatchesTarget: null,
        errors: [],
        warnings: targetBranch
          ? ["Current branch unavailable; target branch was not checked"]
          : []
      };

  return {
    gitStatusInspectionVersion: 1,
    cwd,
    currentBranch,
    isDirty: parsed.isDirty,
    dirtyPaths: parsed.dirtyPaths,
    branchAllowed: branchValidation.branchAllowed,
    branchMatchesTarget: branchValidation.branchMatchesTarget,
    targetBranch,
    errors: [...errors, ...branchValidation.errors],
    warnings: [...warnings, ...branchValidation.warnings]
  };
}

export function parsePorcelainBranchStatus(output = "") {
  const lines = String(output).split(/\r?\n/).filter((line) => line.length > 0);
  const branchLine = lines.find((line) => line.startsWith("## "));
  const dirtyPaths = [];

  for (const line of lines) {
    if (line.startsWith("## ")) {
      continue;
    }

    const pathText = line.length > 3 ? line.slice(3).trim() : line.trim();

    if (pathText) {
      dirtyPaths.push(pathText);
    }
  }

  return {
    currentBranch: parseBranchName(branchLine),
    dirtyPaths,
    isDirty: dirtyPaths.length > 0
  };
}

export function validateCurrentBranchAgainstTarget(options = {}) {
  const currentBranch = options.currentBranch ?? null;
  const targetBranch = options.targetBranch ?? null;
  const sliceId = options.sliceId ?? null;
  const config = options.config ?? loadLedgerConfig();
  const errors = [];
  const warnings = [];
  const currentValidation = validateAllowedBranch(currentBranch, sliceId, "current branch", config);
  const targetValidation = targetBranch
    ? validateAllowedBranch(targetBranch, sliceId, "target branch", config)
    : { errors: [], allowed: true };

  errors.push(...currentValidation.errors, ...targetValidation.errors);

  const branchMatchesTarget = targetBranch
    ? currentBranch === targetBranch
    : null;

  if (targetBranch && currentBranch && !branchMatchesTarget) {
    warnings.push(
      `Current branch ${currentBranch} does not match target branch ${targetBranch}`
    );
  }

  return {
    branchAllowed: currentValidation.allowed && targetValidation.allowed,
    branchMatchesTarget,
    errors,
    warnings
  };
}

function runReadOnlyGit(args, cwd) {
  const result = spawnSync("git", args, {
    cwd,
    encoding: "utf8",
    shell: false
  });

  if (result.error) {
    return {
      ok: false,
      message: `Git status inspection failed for git ${args.join(" ")}: ${result.error.message}`,
      stdout: ""
    };
  }

  if (result.status !== 0) {
    const stderr = String(result.stderr ?? "").trim();

    return {
      ok: false,
      message: `Git status inspection failed for git ${args.join(" ")}${stderr ? `: ${stderr}` : ""}`,
      stdout: String(result.stdout ?? "")
    };
  }

  return {
    ok: true,
    message: null,
    stdout: String(result.stdout ?? "")
  };
}

function parseBranchName(branchLine) {
  if (!branchLine) {
    return null;
  }

  const raw = branchLine.slice(3).trim();
  const onBranchMatch = raw.match(/^on branch\s+(.+)$/i);
  const noCommitsMatch = raw.match(/^no commits yet on\s+(.+)$/i);

  if (onBranchMatch) {
    return onBranchMatch[1].trim();
  }

  if (noCommitsMatch) {
    return noCommitsMatch[1].trim();
  }

  if (raw.startsWith("HEAD ")) {
    return raw;
  }

  return raw.split("...")[0].trim() || null;
}

function validateAllowedBranch(branch, sliceId, label, config) {
  const errors = [];

  if (typeof branch !== "string" || branch.length === 0) {
    return {
      allowed: false,
      errors: [`${label} is missing`]
    };
  }

  if (shellControlPattern.test(branch)) {
    errors.push(`${label} must not contain shell control characters`);
  }

  if (config.forbiddenTargetBranches.includes(branch)) {
    errors.push(`${label} must not be ${branch}`);
  }

  if (!isAllowedTargetBranch(branch, sliceId, config)) {
    errors.push(`${label} must be ${describeAllowedBranches(config, sliceId)}`);
  }

  return {
    allowed: errors.length === 0,
    errors
  };
}
