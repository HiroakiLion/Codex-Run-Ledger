import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

export const defaultLedgerConfig = {
  protocolVersion: 1,
  promptDir: "docs/codex-runs",
  targetRepo: null,
  defaultVerificationCommands: ["git diff --check"],
  stableTargetBranches: ["workbench"],
  sliceBranchPrefix: "codex/",
  forbiddenTargetBranches: ["main", "master"],
  docsOnlyAllowedRoots: ["docs/codex-runs/"]
};

export function loadLedgerConfig(options = {}) {
  const rootDir = path.resolve(options.rootDir ?? process.cwd());
  const configPath = options.configPath
    ? path.resolve(rootDir, options.configPath)
    : path.join(rootDir, "codex-run-ledger.config.json");
  const fileConfig = existsSync(configPath)
    ? JSON.parse(readFileSync(configPath, "utf8"))
    : {};

  return normalizeLedgerConfig({
    ...defaultLedgerConfig,
    ...fileConfig,
    ...(options.config ?? {})
  });
}

export function normalizeLedgerConfig(config = {}) {
  return {
    protocolVersion: 1,
    promptDir: normalizeDir(config.promptDir ?? defaultLedgerConfig.promptDir),
    targetRepo: config.targetRepo ? String(config.targetRepo) : null,
    defaultVerificationCommands: normalizeStringList(
      config.defaultVerificationCommands,
      defaultLedgerConfig.defaultVerificationCommands
    ),
    stableTargetBranches: normalizeStringList(
      config.stableTargetBranches,
      defaultLedgerConfig.stableTargetBranches
    ),
    sliceBranchPrefix: normalizeBranchPrefix(
      config.sliceBranchPrefix ?? defaultLedgerConfig.sliceBranchPrefix
    ),
    forbiddenTargetBranches: normalizeStringList(
      config.forbiddenTargetBranches,
      defaultLedgerConfig.forbiddenTargetBranches
    ),
    docsOnlyAllowedRoots: normalizeRootList(
      config.docsOnlyAllowedRoots,
      defaultLedgerConfig.docsOnlyAllowedRoots
    )
  };
}

export function getExpectedSliceBranch(config, sliceId) {
  return sliceId ? `${config.sliceBranchPrefix}${sliceId}` : undefined;
}

export function isAllowedTargetBranch(targetBranch, sliceId, config) {
  const expectedSliceBranch = getExpectedSliceBranch(config, sliceId);

  return (
    config.stableTargetBranches.includes(targetBranch) ||
    targetBranch === expectedSliceBranch
  );
}

export function describeAllowedBranches(config, sliceId) {
  const allowed = [...config.stableTargetBranches];
  const expectedSliceBranch = getExpectedSliceBranch(config, sliceId);

  if (expectedSliceBranch) {
    allowed.push(expectedSliceBranch);
  } else {
    allowed.push(`${config.sliceBranchPrefix}<slice_id>`);
  }

  return allowed.join(" or ");
}

export function isPathUnderAllowedRoots(filePath, roots) {
  const normalized = normalizePath(filePath);

  return roots.some((root) => normalized === root.replace(/\/$/, "") || normalized.startsWith(root));
}

export function normalizePath(filePath) {
  return String(filePath ?? "").trim().replace(/\\/g, "/").replace(/^\.\/+/, "");
}

function normalizeStringList(value, fallback) {
  const source = Array.isArray(value) ? value : fallback;

  return source.map((item) => String(item).trim()).filter(Boolean);
}

function normalizeRootList(value, fallback) {
  return normalizeStringList(value, fallback).map((item) => {
    const normalized = normalizePath(item);
    return normalized.endsWith("/") ? normalized : `${normalized}/`;
  });
}

function normalizeDir(value) {
  return normalizePath(value).replace(/\/$/, "");
}

function normalizeBranchPrefix(value) {
  const prefix = String(value ?? "").trim();
  return prefix.endsWith("/") ? prefix : `${prefix}/`;
}
