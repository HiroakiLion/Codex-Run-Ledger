import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defaultLedgerConfig, normalizeLedgerConfig } from "./config.mjs";

export function initCodexRunLedger(options = {}) {
  const rootDir = path.resolve(options.rootDir ?? process.cwd());
  const targetRepo = String(options.targetRepo ?? path.basename(rootDir)).trim();
  const config = normalizeLedgerConfig({
    ...defaultLedgerConfig,
    targetRepo,
    promptDir: options.promptDir ?? defaultLedgerConfig.promptDir
  });
  const configPath = path.join(rootDir, "codex-run-ledger.config.json");
  const promptDir = path.join(rootDir, config.promptDir);
  const promptReadmePath = path.join(promptDir, "README.md");
  const reviewProtocolPath = path.join(promptDir, "REVIEW_PROTOCOL.md");
  const written = [];
  const skipped = [];

  if (!options.force && existsSync(configPath)) {
    skipped.push("codex-run-ledger.config.json already exists");
  } else {
    writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`);
    written.push(path.relative(rootDir, configPath).split(path.sep).join("/"));
  }

  mkdirSync(promptDir, { recursive: true });

  if (!options.force && existsSync(promptReadmePath)) {
    skipped.push(`${config.promptDir}/README.md already exists`);
  } else {
    writeFileSync(promptReadmePath, buildPromptDirReadme(config));
    written.push(path.relative(rootDir, promptReadmePath).split(path.sep).join("/"));
  }

  if (!options.force && existsSync(reviewProtocolPath)) {
    skipped.push(`${config.promptDir}/REVIEW_PROTOCOL.md already exists`);
  } else {
    writeFileSync(reviewProtocolPath, loadReviewProtocolTemplate());
    written.push(path.relative(rootDir, reviewProtocolPath).split(path.sep).join("/"));
  }

  return {
    initVersion: 1,
    rootDir,
    config,
    written,
    skipped
  };
}

export function renderInitHumanOutput(result) {
  const lines = [
    "Codex Run Ledger initialized",
    "",
    `Target repo: ${result.config.targetRepo}`,
    `Prompt directory: ${result.config.promptDir}`,
    ""
  ];

  if (result.written.length > 0) {
    lines.push("Written:");
    for (const file of result.written) {
      lines.push(`- ${file}`);
    }
    lines.push("");
  }

  if (result.skipped.length > 0) {
    lines.push("Skipped:");
    for (const item of result.skipped) {
      lines.push(`- ${item}`);
    }
    lines.push("");
  }

  lines.push("Next:");
  lines.push(`- create an approved prompt in ${result.config.promptDir}/`);
  lines.push("- run: npx codex-run-ledger detect");

  return `${lines.join("\n")}\n`;
}

export function renderInitJsonOutput(result) {
  return `${JSON.stringify(result, null, 2)}\n`;
}

function main() {
  let args;
  let result;

  try {
    args = parseCliArgs(process.argv.slice(2));
    result = initCodexRunLedger({
      targetRepo: args.targetRepo,
      promptDir: args.promptDir,
      force: args.force
    });
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
    return;
  }

  process.stdout.write(args.json ? renderInitJsonOutput(result) : renderInitHumanOutput(result));
}

function parseCliArgs(args) {
  const parsed = {};

  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === "--target-repo") {
      parsed.targetRepo = args[index + 1];
      index += 1;
      continue;
    }

    if (args[index] === "--prompt-dir") {
      parsed.promptDir = args[index + 1];
      index += 1;
      continue;
    }

    if (args[index] === "--force") {
      parsed.force = true;
      continue;
    }

    if (args[index] === "--json") {
      parsed.json = true;
      continue;
    }

    throw new Error(`Unknown argument: ${args[index]}`);
  }

  return parsed;
}

function buildPromptDirReadme(config) {
  return `# Codex Run Ledger\n\n` +
    `This directory stores approved Codex run prompts and paired result files.\n\n` +
    `Default file pattern:\n\n` +
    `\`\`\`text\n` +
    `YYYY-MM-DD-slice-NNN-short-name-prompt.md\n` +
    `YYYY-MM-DD-slice-NNN-short-name-result.md\n` +
    `\`\`\`\n\n` +
    `Useful commands:\n\n` +
    `\`\`\`sh\n` +
    `npx codex-run-ledger detect\n` +
    `npx codex-run-ledger dry-run --slice-id <slice_id>\n` +
    `npx codex-run-ledger executor --slice-id <slice_id> --readiness-report\n` +
    `npx codex-run-ledger review --slice-id <slice_id> --markdown\n` +
    `\`\`\`\n\n` +
    `For GPT review handoff, use \`REVIEW_PROTOCOL.md\` with the approved prompt, paired result file, final diff, commits, and verification evidence.\n\n` +
    `Configured target repo: \`${config.targetRepo}\`\n`;
}

function loadReviewProtocolTemplate() {
  const protocolPath = path.resolve(
    path.dirname(currentFile),
    "..",
    "..",
    "docs",
    "codex-runs",
    "REVIEW_PROTOCOL.md"
  );

  if (existsSync(protocolPath)) {
    return readFileSync(protocolPath, "utf8");
  }

  return "# Codex Run Ledger Review Protocol\n\nReview the approved prompt, paired result file, final diff, commits, and verification evidence.\n";
}

const currentFile = fileURLToPath(import.meta.url);

if (process.argv[1] && path.resolve(process.argv[1]) === currentFile) {
  main();
}
