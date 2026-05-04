#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const commands = {
  init: "init.mjs",
  "prompt:new": "prompt-template.mjs",
  detect: "detect-approved-prompts.mjs",
  "dry-run": "local-runner-dry-run.mjs",
  executor: "local-executor.mjs",
  review: "review-summary-builder.mjs"
};

const aliases = {
  runner: "dry-run",
  execute: "executor",
  "review-summary": "review"
};

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const [rawCommand, ...args] = process.argv.slice(2);
const command = aliases[rawCommand] ?? rawCommand;

if (!command || command === "help" || command === "--help" || command === "-h") {
  printHelp();
  process.exit(0);
}

const script = commands[command];

if (!script) {
  process.stderr.write(`Unknown command: ${rawCommand}\n\n`);
  printHelp(process.stderr.write.bind(process.stderr));
  process.exit(1);
}

const result = spawnSync(process.execPath, [path.join(currentDir, script), ...args], {
  cwd: process.cwd(),
  env: process.env,
  stdio: "inherit",
  shell: false
});

if (result.error) {
  process.stderr.write(`${result.error.message}\n`);
  process.exit(1);
}

process.exit(result.status ?? 0);

function printHelp(write = process.stdout.write.bind(process.stdout)) {
  write(
    [
      "Codex Run Ledger",
      "",
      "Usage:",
      "  codex-run-ledger init [--target-repo <name>] [--prompt-dir <path>] [--force]",
      "  codex-run-ledger prompt:new --slice-id <slice_id> [--stdout] [--status draft|approved]",
      "  codex-run-ledger detect [--json] [--slice-id <slice_id>] [--config <path>]",
      "  codex-run-ledger dry-run [--json] [--slice-id <slice_id>] [--config <path>]",
      "  codex-run-ledger executor [flags] [--slice-id <slice_id>] [--config <path>]",
      "  codex-run-ledger review --slice-id <slice_id> [--json|--markdown]",
      "",
      "Aliases:",
      "  crl prompt:new --slice-id <slice_id>",
      "  crl detect",
      "  crl dry-run",
      "  crl executor",
      "  crl review",
      ""
    ].join("\n")
  );
}
