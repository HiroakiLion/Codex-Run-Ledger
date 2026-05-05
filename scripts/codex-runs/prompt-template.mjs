import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getExpectedSliceBranch, loadLedgerConfig } from "./config.mjs";
import { normalizeSliceId } from "./detect-approved-prompts.mjs";

export function buildPromptTemplate(options = {}) {
  const rootDir = path.resolve(options.rootDir ?? process.cwd());
  const config = loadLedgerConfig({
    rootDir,
    configPath: options.configPath,
    config: options.config
  });
  const sliceId = normalizeSliceId(options.sliceId);
  const promptFile = `${config.promptDir}/${sliceId}-prompt.md`;
  const resultFile = `${config.promptDir}/${sliceId}-result.md`;
  const reviewProtocolFile = `${config.promptDir}/REVIEW_PROTOCOL.md`;
  const status = normalizeStatus(options.status ?? "draft");
  const approvedAt = normalizeNullable(options.approvedAt);
  const createdAt = normalizeNullable(options.createdAt) ?? new Date().toISOString();
  const targetRepo = normalizeRequired(
    options.targetRepo ?? config.targetRepo ?? "owner/repo",
    "target repo"
  );
  const targetBranch = normalizeRequired(
    options.targetBranch ?? getExpectedSliceBranch(config, sliceId),
    "target branch"
  );
  const owner = normalizeRequired(options.owner ?? "chatgpt-planner", "owner");
  const title = normalizeRequired(options.title ?? titleFromSliceId(sliceId), "title");

  validateApprovalState({ status, approvedAt });

  const promptDir = config.promptDir;

  return {
    promptTemplateVersion: 1,
    rootDir,
    sliceId,
    promptFile,
    resultFile,
    status,
    targetRepo,
    targetBranch,
    content: renderPromptTemplate({
      sliceId,
      title,
      status,
      owner,
      targetRepo,
      targetBranch,
      resultFile,
      promptDir,
      reviewProtocolFile,
      verificationCommands: config.defaultVerificationCommands,
      createdAt,
      approvedAt
    })
  };
}

export function writePromptTemplate(options = {}) {
  const template = buildPromptTemplate(options);
  const absolutePromptPath = path.resolve(template.rootDir, template.promptFile);
  const promptDirPath = path.resolve(template.rootDir, path.dirname(template.promptFile));

  if (!isPathInsideDirectory(absolutePromptPath, promptDirPath)) {
    throw new Error(`Prompt file path is outside ${path.dirname(template.promptFile)}: ${template.promptFile}`);
  }

  if (existsSync(absolutePromptPath)) {
    throw new Error(`Prompt file already exists: ${template.promptFile}`);
  }

  mkdirSync(path.dirname(absolutePromptPath), { recursive: true });
  writeFileSync(absolutePromptPath, template.content);

  return {
    promptTemplateWriteVersion: 1,
    wrote: true,
    promptFile: template.promptFile,
    resultFile: template.resultFile,
    sliceId: template.sliceId,
    status: template.status
  };
}

export function renderPromptTemplateCliOutput(result) {
  return [
    "Codex Run Ledger prompt template written",
    "",
    `Prompt: ${result.promptFile}`,
    `Result: ${result.resultFile}`,
    `Slice: ${result.sliceId}`,
    `Status: ${result.status}`,
    "",
    "Next:",
    `- review ${result.promptFile}`,
    "- set status and approved_at only after human approval",
    `- run: npx codex-run-ledger detect --slice-id ${result.sliceId}`,
    ""
  ].join("\n");
}

export function runPromptTemplateCli(args = process.argv.slice(2), options = {}) {
  try {
    const parsed = parseCliArgs(args);
    const rootDir = path.resolve(options.rootDir ?? process.cwd());
    const templateOptions = {
      rootDir,
      configPath: parsed.config,
      sliceId: parsed.sliceId,
      title: parsed.title,
      targetRepo: parsed.targetRepo,
      targetBranch: parsed.targetBranch,
      owner: parsed.owner,
      status: parsed.status,
      approvedAt: parsed.approvedAt
    };

    if (parsed.stdout) {
      const template = buildPromptTemplate(templateOptions);
      return {
        exitCode: 0,
        stdout: template.content,
        stderr: ""
      };
    }

    const writeResult = writePromptTemplate(templateOptions);

    if (parsed.json) {
      return {
        exitCode: 0,
        stdout: `${JSON.stringify(writeResult, null, 2)}\n`,
        stderr: ""
      };
    }

    return {
      exitCode: 0,
      stdout: renderPromptTemplateCliOutput(writeResult),
      stderr: ""
    };
  } catch (error) {
    return {
      exitCode: 1,
      stdout: "",
      stderr: `${error instanceof Error ? error.message : String(error)}\n`
    };
  }
}

function renderPromptTemplate({
  sliceId,
  title,
  status,
  owner,
  targetRepo,
  targetBranch,
  resultFile,
  promptDir,
  reviewProtocolFile,
  verificationCommands,
  createdAt,
  approvedAt
}) {
  const promptFile = `${path.dirname(resultFile).split(path.sep).join("/")}/${sliceId}-prompt.md`;
  const verificationSection = renderVerificationSection(verificationCommands);

  return `---\n` +
    `codex_run_protocol: 1\n` +
    `slice_id: ${sliceId}\n` +
    `status: ${status}\n` +
    `owner: ${owner}\n` +
    `target_repo: ${targetRepo}\n` +
    `target_branch: ${targetBranch}\n` +
    `result_file: ${resultFile}\n` +
    `created_at: ${createdAt}\n` +
    `approved_at: ${approvedAt ?? "null"}\n` +
    `---\n\n` +
    `# Codex Slice Prompt: ${title}\n\n` +
    `## Objective\n\n` +
    `Describe the single bounded outcome Codex should complete.\n\n` +
    `## Scope\n\n` +
    `Describe what Codex may change.\n\n` +
    `## Out of Scope\n\n` +
    `- Anything unrelated to this slice.\n` +
    `- Deploys, tags, releases, and publishing unless explicitly approved.\n\n` +
    `## Allowed Files / Areas\n\n` +
    `- \`README.md\`\n` +
    `- \`docs/codex-runs/\`\n\n` +
    `## Required Changes\n\n` +
    `- List the specific changes Codex should make.\n\n` +
    `## Acceptance Criteria\n\n` +
    `- List the observable conditions that mean the slice is done.\n\n` +
    `## Verification Commands\n\n` +
    `${verificationSection}\n\n` +
    `## Deployment / Runtime Checks\n\n` +
    `None.\n\n` +
    `## Risk Level\n\n` +
    `Low.\n\n` +
    `## Review Requirement\n\n` +
    `Human review required before merge or release.\n\n` +
    `## Result File Instructions\n\n` +
    `Write the paired result file:\n\n` +
    `\`${resultFile}\`\n\n` +
    `Write the paired review packet:\n\n` +
  `\`${promptDir}/${sliceId}-review.md\`\n\n` +
    `Do not overwrite an existing result file.\n\n` +
    `Do not overwrite an existing review packet file.\n\n` +
    `The result file must include a \`Review Handoff\` section with:\n\n` +
    `- Review protocol: \`${reviewProtocolFile}\`\n` +
    `- Prompt file: \`${promptFile}\`\n` +
    `- Result file: \`${resultFile}\`\n` +
    `- Base ref used for review, if known\n` +
    `- Head ref or final commit SHA, if known\n` +
    `- Verification commands and outcomes\n` +
    `- Skipped checks, deviations, risks, or unresolved issues\n\n` +
    `## Final Response Requirement\n\n` +
    `In the final chat response, include this one-line review handoff:\n\n` +
    `\`Review handoff: run codex-run-ledger review --slice-id ${sliceId} --write-review-summary --markdown\\n` +
    `Then run protocol checks using ${reviewProtocolFile}.\`\n\n` +
    `## Commit / Push Instructions\n\n` +
    `Create focused subtask commits. Push only if explicitly approved.\n`;
}

function renderVerificationSection(verificationCommands) {
  const commands = Array.isArray(verificationCommands) && verificationCommands.length > 0
    ? verificationCommands
    : ["git diff --check"];
  const commandLines = commands.map((command) => `- \`${command}\``).join("\n");
  const defaultCommandsLabel = `If your repo uses different checks, replace or extend this list in \`codex-run-ledger.config.json\` under \`defaultVerificationCommands\`.`;

  return `${commandLines}\n\n${defaultCommandsLabel}`;
}

function parseCliArgs(args) {
  const parsed = {
    stdout: false,
    json: false,
    status: "draft"
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === "--slice-id") {
      parsed.sliceId = args[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--title") {
      parsed.title = args[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--target-repo") {
      parsed.targetRepo = args[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--target-branch") {
      parsed.targetBranch = args[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--owner") {
      parsed.owner = args[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--status") {
      parsed.status = args[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--approved-at") {
      parsed.approvedAt = args[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--config") {
      parsed.config = args[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--stdout") {
      parsed.stdout = true;
      continue;
    }

    if (arg === "--json") {
      parsed.json = true;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  if (!parsed.sliceId) {
    throw new Error("--slice-id is required");
  }

  return parsed;
}

function normalizeStatus(value) {
  const status = String(value ?? "").trim();

  if (!["draft", "approved"].includes(status)) {
    throw new Error(`Unsupported prompt status: ${status}`);
  }

  return status;
}

function validateApprovalState({ status, approvedAt }) {
  if (status === "approved" && !approvedAt) {
    throw new Error("--approved-at is required when --status approved");
  }

  if (status === "draft" && approvedAt) {
    throw new Error("--approved-at requires --status approved");
  }
}

function normalizeRequired(value, label) {
  const normalized = String(value ?? "").trim();

  if (!normalized) {
    throw new Error(`${label} is required`);
  }

  return normalized;
}

function normalizeNullable(value) {
  const normalized = String(value ?? "").trim();

  return normalized || null;
}

function titleFromSliceId(sliceId) {
  return sliceId
    .replace(/^\d{4}-\d{2}-\d{2}-slice-\d+-/, "")
    .split("-")
    .filter(Boolean)
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join(" ") || sliceId;
}

function isPathInsideDirectory(filePath, directoryPath) {
  const relative = path.relative(directoryPath, filePath);

  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

const currentFile = fileURLToPath(import.meta.url);

if (process.argv[1] && path.resolve(process.argv[1]) === currentFile) {
  const result = runPromptTemplateCli();

  process.stdout.write(result.stdout);
  process.stderr.write(result.stderr);
  process.exitCode = result.exitCode;
}
