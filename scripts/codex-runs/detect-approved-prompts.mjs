import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  describeAllowedBranches,
  getExpectedSliceBranch,
  isAllowedTargetBranch,
  loadLedgerConfig
} from "./config.mjs";

const promptFilenamePattern =
  /^(\d{4}-\d{2}-\d{2}-slice-\d{3}-[a-z0-9]+(?:-[a-z0-9]+)*)-prompt\.md$/;
const sliceIdPattern = /^\d{4}-\d{2}-\d{2}-slice-\d{3}-[a-z0-9]+(?:-[a-z0-9]+)*$/;
const allowedStatuses = new Set(["draft", "approved", "canceled"]);
const shellControlPattern = /[;&|`$><\r\n]|\\[rn]/;

export function detectCodexRunPrompts(options = {}) {
  const rootDir = path.resolve(options.rootDir ?? process.cwd());
  const config = loadLedgerConfig({
    rootDir,
    configPath: options.configPath,
    config: options.config
  });
  const scanDir = path.resolve(rootDir, options.dir ?? config.promptDir);
  const selectedSliceId = options.sliceId ? normalizeSliceId(options.sliceId) : null;
  const promptFiles = existsSync(scanDir) ? listPromptFiles(scanDir, rootDir) : [];
  const runnable = [];
  const skipped = [];
  const validationErrors = [];
  const selectionErrors = [];
  let validPromptCount = 0;

  for (const promptRecord of promptFiles) {
    const content = readFileSync(promptRecord.absolutePath, "utf8");

    if (promptRecord.basename.startsWith("0000-00-00-")) {
      skipped.push({
        path: promptRecord.relativePath,
        reason: "example file",
        sliceId: getSliceIdFromPromptRecord(promptRecord)
      });
      continue;
    }

    if (content.includes("EXAMPLE ONLY")) {
      skipped.push({
        path: promptRecord.relativePath,
        reason: "example marker",
        sliceId: getSliceIdFromPromptRecord(promptRecord)
      });
      continue;
    }

    const result = validatePromptFile({
      ...promptRecord,
      content,
      rootDir,
      config
    });

    if (result.errors.length > 0) {
      validationErrors.push(...result.errors);
      continue;
    }

    validPromptCount += 1;

    if (result.skipReason) {
      skipped.push({
        path: promptRecord.relativePath,
        reason: result.skipReason,
        sliceId: result.sliceId,
        targetBranch: result.targetBranch,
        resultFile: result.resultFile
      });
      continue;
    }

    runnable.push({
      path: promptRecord.relativePath,
      sliceId: result.sliceId,
      targetBranch: result.targetBranch,
      resultFile: result.resultFile
    });
  }

  const selected = buildSelectedPromptState({
    selectedSliceId,
    promptFiles,
    runnable,
    skipped,
    validationErrors
  });

  if (selected && !selected.runnable) {
    selectionErrors.push(selected.reason);
  }

  return {
    promptFilesScanned: promptFiles.length,
    scanDir: toPosixRelative(rootDir, scanDir) || ".",
    config,
    validPromptCount,
    selectedSliceId,
    selected,
    runnable,
    skipped,
    validationErrors,
    selectionErrors
  };
}

export function normalizeSliceId(sliceId) {
  const normalizedSliceId = String(sliceId ?? "").trim();

  if (!sliceIdPattern.test(normalizedSliceId)) {
    throw new Error(`Invalid slice id: ${normalizedSliceId || "missing"}`);
  }

  if (shellControlPattern.test(normalizedSliceId)) {
    throw new Error(`Invalid slice id contains shell control characters: ${normalizedSliceId}`);
  }

  return normalizedSliceId;
}

function buildSelectedPromptState({
  selectedSliceId,
  promptFiles,
  runnable,
  skipped,
  validationErrors
}) {
  if (!selectedSliceId) {
    return null;
  }

  const runnablePrompt = runnable.find((item) => item.sliceId === selectedSliceId);

  if (runnablePrompt) {
    return {
      requested: true,
      sliceId: selectedSliceId,
      state: "selected",
      runnable: true,
      promptFile: runnablePrompt.path,
      targetBranch: runnablePrompt.targetBranch,
      resultFile: runnablePrompt.resultFile,
      reason: "selected runnable prompt"
    };
  }

  const skippedPrompt = skipped.find((item) => item.sliceId === selectedSliceId);

  if (skippedPrompt) {
    return {
      requested: true,
      sliceId: selectedSliceId,
      state: "not_runnable",
      runnable: false,
      promptFile: skippedPrompt.path,
      targetBranch: skippedPrompt.targetBranch ?? null,
      resultFile: skippedPrompt.resultFile ?? null,
      reason: `selected slice is not runnable: ${skippedPrompt.reason}`
    };
  }

  const matchingPrompt = promptFiles.find(
    (promptRecord) => getSliceIdFromPromptRecord(promptRecord) === selectedSliceId
  );

  if (matchingPrompt) {
    const validationMatches = validationErrors.filter((error) =>
      error.startsWith(`${matchingPrompt.relativePath}:`)
    );

    return {
      requested: true,
      sliceId: selectedSliceId,
      state: "not_runnable",
      runnable: false,
      promptFile: matchingPrompt.relativePath,
      targetBranch: null,
      resultFile: null,
      reason:
        validationMatches.length > 0
          ? `selected slice is not runnable because validation failed: ${validationMatches.join("; ")}`
          : "selected slice is not runnable",
      validationErrors: validationMatches
    };
  }

  return {
    requested: true,
    sliceId: selectedSliceId,
    state: "missing",
    runnable: false,
    promptFile: null,
    targetBranch: null,
    resultFile: null,
    reason: `selected slice prompt was not found: ${selectedSliceId}`
  };
}

function getSliceIdFromPromptRecord(promptRecord) {
  return promptRecord.basename.match(promptFilenamePattern)?.[1] ?? null;
}

export function validatePromptFile(input) {
  const errors = [];
  const config = input.config ?? loadLedgerConfig({ rootDir: input.rootDir });
  const basename = input.basename ?? path.basename(input.absolutePath);
  const filenameMatch = basename.match(promptFilenamePattern);

  if (!filenameMatch) {
    errors.push(`${input.relativePath}: filename does not match required pattern`);
  }

  const frontmatter = parseFrontmatter(input.content);

  if (!frontmatter) {
    errors.push(`${input.relativePath}: frontmatter is missing or malformed`);
    return { errors };
  }

  const sliceId = filenameMatch?.[1];
  const expectedResultFile = sliceId
    ? `${config.promptDir}/${sliceId}-result.md`
    : undefined;

  if (String(frontmatter.codex_run_protocol) !== "1") {
    errors.push(`${input.relativePath}: codex_run_protocol must be 1`);
  }

  if (frontmatter.owner !== "chatgpt-planner") {
    errors.push(`${input.relativePath}: owner must be chatgpt-planner`);
  }

  if (config.targetRepo && frontmatter.target_repo !== config.targetRepo) {
    errors.push(`${input.relativePath}: target_repo must be ${config.targetRepo}`);
  }

  if (!config.targetRepo && !frontmatter.target_repo) {
    errors.push(`${input.relativePath}: target_repo must be present`);
  }

  if (!allowedStatuses.has(frontmatter.status)) {
    errors.push(`${input.relativePath}: status must be draft, approved, or canceled`);
  }

  if (sliceId && frontmatter.slice_id !== sliceId) {
    errors.push(`${input.relativePath}: slice_id must match filename base`);
  }

  errors.push(
    ...validateTargetBranch(frontmatter.target_branch, sliceId, input.relativePath, config)
  );

  if (expectedResultFile && frontmatter.result_file !== expectedResultFile) {
    errors.push(`${input.relativePath}: result_file must be ${expectedResultFile}`);
  }

  if (!frontmatter.created_at) {
    errors.push(`${input.relativePath}: created_at must be present`);
  }

  if (frontmatter.status === "approved" && !frontmatter.approved_at) {
    errors.push(`${input.relativePath}: approved_at must be non-null when approved`);
  }

  if (errors.length > 0) {
    return { errors };
  }

  if (frontmatter.status !== "approved") {
    return {
      errors: [],
      resultFile: frontmatter.result_file,
      skipReason: `status is ${frontmatter.status}`,
      sliceId,
      targetBranch: frontmatter.target_branch
    };
  }

  if (existsSync(path.join(input.rootDir ?? process.cwd(), frontmatter.result_file))) {
    return {
      errors: [],
      resultFile: frontmatter.result_file,
      skipReason: "paired result file already exists",
      sliceId,
      targetBranch: frontmatter.target_branch
    };
  }

  return {
    errors: [],
    resultFile: frontmatter.result_file,
    sliceId,
    targetBranch: frontmatter.target_branch
  };
}

function validateTargetBranch(targetBranch, sliceId, relativePath, config) {
  const errors = [];
  const expectedSliceBranch = getExpectedSliceBranch(config, sliceId);

  if (typeof targetBranch !== "string" || targetBranch.length === 0) {
    return [`${relativePath}: target_branch must be present`];
  }

  if (shellControlPattern.test(targetBranch)) {
    errors.push(`${relativePath}: target_branch must not contain shell control characters`);
  }

  if (config.forbiddenTargetBranches.includes(targetBranch)) {
    errors.push(`${relativePath}: target_branch must not be ${targetBranch}`);
  }

  if (expectedSliceBranch && !isAllowedTargetBranch(targetBranch, sliceId, config)) {
    errors.push(
      `${relativePath}: target_branch must be ${describeAllowedBranches(config, sliceId)}`
    );
  }

  return errors;
}

export function parseFrontmatter(content) {
  const normalized = content.replace(/^\uFEFF/, "");

  if (!normalized.startsWith("---\n") && !normalized.startsWith("---\r\n")) {
    return undefined;
  }

  const lineEnding = normalized.startsWith("---\r\n") ? "\r\n" : "\n";
  const closingMarker = `${lineEnding}---${lineEnding}`;
  const endIndex = normalized.indexOf(closingMarker, 3);

  if (endIndex === -1) {
    return undefined;
  }

  const rawFrontmatter = normalized.slice(3 + lineEnding.length, endIndex);
  const parsed = {};

  for (const line of rawFrontmatter.split(/\r?\n/)) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const separatorIndex = trimmed.indexOf(":");

    if (separatorIndex === -1) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    const rawValue = trimmed.slice(separatorIndex + 1).trim();
    parsed[key] = parseScalar(rawValue);
  }

  return parsed;
}

export function printSummary(input, output = console.log) {
  output("Codex run dry-run detector");
  output("");
  output(`Prompt files scanned: ${input.promptFilesScanned}`);
  output(`Valid prompts: ${input.validPromptCount}`);
  output(`Runnable approved prompts: ${input.runnable.length}`);
  output(`Skipped prompts: ${input.skipped.length}`);
  output(`Selected slice: ${input.selectedSliceId ?? "none"}`);
  output("");

  if (input.selected) {
    output("Selected:");
    output(`- slice_id: ${input.selected.sliceId}`);
    output(`  state: ${input.selected.state}`);
    output(`  runnable: ${input.selected.runnable ? "yes" : "no"}`);
    output(`  prompt_file: ${input.selected.promptFile ?? "none"}`);
    output(`  reason: ${input.selected.reason}`);
    output("");
  }

  if (input.runnable.length > 0) {
    output("Runnable:");
    for (const item of input.runnable) {
      output(`- ${item.path}`);
      output(`  slice_id: ${item.sliceId}`);
      output(`  target_branch: ${item.targetBranch}`);
      output(`  result_file: ${item.resultFile}`);
    }
    output("");
  } else {
    output("Runnable:");
    output("- none");
    output("");
  }

  if (input.skipped.length > 0) {
    output("Skipped:");
    for (const item of input.skipped) {
      output(`- ${item.path}`);
      output(`  reason: ${item.reason}`);
    }
    output("");
  }

  if (input.validationErrors.length > 0) {
    output("Validation errors:");
    for (const error of input.validationErrors) {
      output(`- ${error}`);
    }
  }

  if ((input.selectionErrors ?? []).length > 0) {
    output("");
    output("Selection errors:");
    for (const error of input.selectionErrors) {
      output(`- ${error}`);
    }
  }
}

export function renderJsonSummary(input) {
  const payload = {
    protocolVersion: 1,
    scanDir: input.scanDir,
    summary: {
      promptFilesScanned: input.promptFilesScanned,
      validPrompts: input.validPromptCount,
      runnableApprovedPrompts: input.runnable.length,
      skippedPrompts: input.skipped.length,
      validationErrors: input.validationErrors.length,
      selectionErrors: input.selectionErrors?.length ?? 0
    },
    selectedSliceId: input.selectedSliceId ?? null,
    selected: input.selected
      ? {
          sliceId: input.selected.sliceId,
          state: input.selected.state,
          runnable: input.selected.runnable,
          promptFile: input.selected.promptFile,
          targetBranch: input.selected.targetBranch,
          resultFile: input.selected.resultFile,
          reason: input.selected.reason
        }
      : null,
    runnable: input.runnable.map((item) => ({
      promptFile: item.path,
      sliceId: item.sliceId,
      targetBranch: item.targetBranch,
      resultFile: item.resultFile
    })),
    skipped: input.skipped.map((item) => ({
      promptFile: item.path,
      sliceId: item.sliceId,
      reason: item.reason
    })),
    errors: [
      ...input.validationErrors.map(parseValidationError),
      ...(input.selectionErrors ?? []).map((message) => ({
        promptFile: input.selected?.promptFile ?? undefined,
        message
      }))
    ]
  };

  return `${JSON.stringify(payload, null, 2)}\n`;
}

function main() {
  let args;
  let result;

  try {
    args = parseCliArgs(process.argv.slice(2));
    result = detectCodexRunPrompts({
      dir: args.dir,
      sliceId: args.sliceId,
      configPath: args.config
    });
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
    return;
  }

  if (args.json) {
    process.stdout.write(renderJsonSummary(result));
  } else {
    printSummary(result);
  }

  if (result.validationErrors.length > 0 || result.selectionErrors.length > 0) {
    process.exitCode = 1;
  }
}

function listPromptFiles(directory, rootDir) {
  const files = [];

  for (const entry of readdirSync(directory)) {
    const absolutePath = path.join(directory, entry);
    const stats = statSync(absolutePath);

    if (stats.isDirectory()) {
      files.push(...listPromptFiles(absolutePath, rootDir));
      continue;
    }

    if (stats.isFile() && entry.endsWith("-prompt.md")) {
      files.push({
        absolutePath,
        basename: entry,
        relativePath: toPosixRelative(rootDir, absolutePath)
      });
    }
  }

  return files.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
}

function parseCliArgs(args) {
  const parsed = {};

  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === "--dir") {
      parsed.dir = args[index + 1];
      index += 1;
      continue;
    }

    if (args[index] === "--json") {
      parsed.json = true;
      continue;
    }

    if (args[index] === "--slice-id") {
      parsed.sliceId = args[index + 1];
      index += 1;
      continue;
    }

    if (args[index] === "--config") {
      parsed.config = args[index + 1];
      index += 1;
    }
  }

  return parsed;
}

function parseValidationError(error) {
  const separatorIndex = error.indexOf(": ");

  if (separatorIndex === -1) {
    return {
      promptFile: undefined,
      message: error
    };
  }

  return {
    promptFile: error.slice(0, separatorIndex),
    message: error.slice(separatorIndex + 2)
  };
}

function inferRootDir(scanDir) {
  const normalized = path.resolve(scanDir);
  const suffix = path.join("docs", "codex-runs");

  if (normalized.endsWith(suffix)) {
    return normalized.slice(0, -suffix.length).replace(/[\\/]$/, "") || path.parse(normalized).root;
  }

  return process.cwd();
}

function parseScalar(value) {
  if (value === "null") {
    return null;
  }

  if (
    (value.startsWith("\"") && value.endsWith("\"")) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }

  return value;
}

function toPosixRelative(rootDir, absolutePath) {
  return path.relative(rootDir, absolutePath).split(path.sep).join("/");
}

const currentFile = fileURLToPath(import.meta.url);

if (process.argv[1] && path.resolve(process.argv[1]) === currentFile) {
  main();
}
