import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadLedgerConfig } from "./config.mjs";
import { detectCodexRunPrompts } from "./detect-approved-prompts.mjs";

const runnerSteps = [
  "checkout-or-create target branch",
  "would invoke Codex with prompt file",
  "would run prompt verification commands where feasible",
  "would require paired result file to exist after execution",
  "would commit code changes and result file to target branch"
];

export function buildLocalRunnerDryRunPlan(options = {}) {
  const rootDir = path.resolve(options.rootDir ?? process.cwd());
  const config = loadLedgerConfig({
    rootDir,
    configPath: options.configPath,
    config: options.config
  });
  const scanDir = path.resolve(rootDir, options.dir ?? config.promptDir);
  const detector = detectCodexRunPrompts({
    dir: scanDir,
    rootDir,
    sliceId: options.sliceId,
    configPath: options.configPath,
    config
  });
  const errors = [
    ...detector.validationErrors.map((message) => ({
      message,
      source: "detector_validation"
    })),
    ...detector.selectionErrors.map((message) => ({
      message,
      source: "runner_selection"
    }))
  ];
  let plan = null;
  let candidates = detector.runnable.map(toRunnerCandidate);
  const explicitSelection = Boolean(options.sliceId);

  if (explicitSelection && detector.selected?.runnable) {
    candidates = [toRunnerCandidate({
      path: detector.selected.promptFile,
      sliceId: detector.selected.sliceId,
      targetBranch: detector.selected.targetBranch,
      resultFile: detector.selected.resultFile
    })];
  } else if (explicitSelection) {
    candidates = [];
  }

  if (
    errors.length === 0 &&
    candidates.length > 1 &&
    !options.allowMultiple &&
    !explicitSelection
  ) {
    errors.push({
      message:
        "Multiple runnable approved prompts found; local runner dry-run fails closed by default.",
      source: "runner_selection"
    });
  }

  if (errors.length === 0 && candidates.length === 1) {
    const selected = candidates[0];
    const resultPath = path.join(rootDir, selected.resultFile);

    if (existsSync(resultPath)) {
      errors.push({
        message: `Paired result file exists during final safety re-check: ${selected.resultFile}`,
        source: "result_file_recheck"
      });
      candidates = [];
    } else {
      plan = {
        promptFile: selected.promptFile,
        sliceId: selected.sliceId,
        targetBranch: selected.targetBranch,
        resultFile: selected.resultFile,
        steps: [...runnerSteps]
      };
    }
  }

  if (options.allowMultiple && candidates.length > 1) {
    plan = null;
  }

  return {
    runnerProtocolVersion: 1,
    mode: "dry-run",
    codexExecutionEnabled: false,
    selectedSliceId: detector.selectedSliceId,
    detector,
    summary: {
      validationErrors: detector.validationErrors.length,
      selectionErrors: detector.selectionErrors.length,
      runnableApprovedPrompts: detector.runnable.length,
      selectedPrompt: plan?.promptFile ?? null
    },
    plan,
    candidates,
    errors
  };
}

export function renderHumanOutput(result) {
  const lines = [
    "Codex local runner dry-run",
    "",
    "Codex execution is disabled in this dry run.",
    `Detector validation errors: ${result.summary.validationErrors}`,
    `Selection errors: ${result.summary.selectionErrors}`,
    `Selected slice: ${result.selectedSliceId ?? "none"}`,
    `Runnable approved prompts: ${result.summary.runnableApprovedPrompts}`,
    `Selected prompt: ${result.summary.selectedPrompt ?? "none"}`,
    ""
  ];

  if (result.plan) {
    lines.push("Execution plan:");
    lines.push(`- prompt_file: ${result.plan.promptFile}`);
    lines.push(`- slice_id: ${result.plan.sliceId}`);
    lines.push(`- target_branch: ${result.plan.targetBranch}`);
    lines.push(`- result_file: ${result.plan.resultFile}`);
    lines.push("- planned branch action: checkout-or-create target branch");
    lines.push("- planned Codex action: would invoke Codex with prompt file");
    lines.push(
      "- planned verification action: would run prompt verification commands where feasible"
    );
    lines.push(
      "- planned result check: would require paired result file to exist after execution"
    );
    lines.push(
      "- planned commit action: would commit code changes and result file to target branch"
    );
  } else if (result.candidates.length > 1) {
    lines.push("Runnable candidates:");
    for (const candidate of result.candidates) {
      lines.push(`- ${candidate.promptFile}`);
      lines.push(`  slice_id: ${candidate.sliceId}`);
      lines.push(`  target_branch: ${candidate.targetBranch}`);
      lines.push(`  result_file: ${candidate.resultFile}`);
    }
  } else {
    lines.push("No execution plan selected.");
  }

  if (result.errors.length > 0) {
    lines.push("");
    lines.push("Errors:");
    for (const error of result.errors) {
      lines.push(`- ${error.message}`);
    }
  }

  return `${lines.join("\n")}\n`;
}

export function renderJsonOutput(result) {
  return `${JSON.stringify(
    {
      runnerProtocolVersion: result.runnerProtocolVersion,
      mode: result.mode,
      codexExecutionEnabled: result.codexExecutionEnabled,
      selectedSliceId: result.selectedSliceId,
      summary: result.summary,
      plan: result.plan,
      candidates: result.candidates,
      errors: result.errors
    },
    null,
    2
  )}\n`;
}

function main() {
  let args;
  let result;

  try {
    args = parseCliArgs(process.argv.slice(2));
    result = buildLocalRunnerDryRunPlan({
      allowMultiple: args.allowMultiple,
      dir: args.dir,
      sliceId: args.sliceId,
      configPath: args.config
    });
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
    return;
  }

  process.stdout.write(args.json ? renderJsonOutput(result) : renderHumanOutput(result));

  if (result.errors.length > 0) {
    process.exitCode = 1;
  }
}

function toRunnerCandidate(item) {
  return {
    promptFile: item.path,
    sliceId: item.sliceId,
    targetBranch: item.targetBranch,
    resultFile: item.resultFile
  };
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

    if (args[index] === "--allow-multiple") {
      parsed.allowMultiple = true;
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

const currentFile = fileURLToPath(import.meta.url);

if (process.argv[1] && path.resolve(process.argv[1]) === currentFile) {
  main();
}
