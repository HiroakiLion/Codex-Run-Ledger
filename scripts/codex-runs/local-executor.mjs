import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  describeAllowedBranches,
  isAllowedTargetBranch,
  isPathUnderAllowedRoots,
  loadLedgerConfig
} from "./config.mjs";
import { buildCodexInvocationCommand } from "./codex-command-builder.mjs";
import {
  buildSkippedCodexCliAvailabilityCheck,
  buildCodexExecutionAdapterResult,
  buildNodeAvailabilityPreflight,
  checkCodexCliAvailability,
  invokeCodexForDocsOnlyPrompt
} from "./codex-execution-adapter.mjs";
import { buildGitCommandPreview } from "./git-command-builder.mjs";
import { inspectGitStatus } from "./git-status-inspector.mjs";
import { buildLocalRunnerDryRunPlan } from "./local-runner-dry-run.mjs";
import { evaluateDocsOnlyScope } from "./prompt-scope-enforcer.mjs";
import {
  buildSkippedExecutionAttemptArtifactWrite,
  buildSkippedExecutorVerification,
  buildSkippedVerificationArtifactWrite,
  extractVerificationCommandsFromPrompt,
  runExecutorVerification,
  writeExecutionAttemptArtifact,
  writeExecutorVerificationArtifact
} from "./executor-verification-runner.mjs";

const executorSteps = [
  "checkout-or-create target branch",
  "would invoke Codex with prompt file",
  "would run prompt verification commands where feasible",
  "would require paired result file to exist after execution",
  "would commit code changes and result file to target branch"
];

export function buildLocalExecutorPlan(options = {}) {
  const codexExecutionRequested = Boolean(options.enableCodexExecution);
  const runCodexNow = Boolean(options.runCodexNow);
  const codexExecutionImplemented = true;
  const codexExecutionEnabled = codexExecutionRequested && Boolean(options.docsOnly) && runCodexNow;
  const docsOnly = Boolean(options.docsOnly);
  const skipCodexCliCheck = Boolean(options.skipCodexCliCheck);
  const runVerificationAfterCodex = Boolean(options.runVerificationAfterCodex);
  const writeVerificationArtifact = Boolean(options.writeVerificationArtifact);
  const writeAttemptArtifact = Boolean(options.writeAttemptArtifact);
  const fakeFixtureMode = Boolean(options.fakeCodexFixture);
  const readinessReportRequested = Boolean(options.readinessReport);
  const rootDir = path.resolve(options.rootDir ?? process.cwd());
  const config = loadLedgerConfig({
    rootDir,
    configPath: options.configPath,
    config: options.config
  });
  const scanDir = path.resolve(rootDir, options.dir ?? config.promptDir);
  const runner = buildLocalRunnerDryRunPlan({
    dir: scanDir,
    rootDir,
    sliceId: options.sliceId,
    config
  });
  const gitStatus = getGitStatusInspection({
    options,
    config,
    rootDir,
    runnerPlan: runner.plan
  });
  const codexCliCheck = getCodexCliAvailabilityCheck({
    options,
    rootDir
  });
  const nodePreflight = getNodeAvailabilityPreflight({
    options
  });
  const dirtyTreePolicy = buildDirtyTreePolicy(gitStatus);
  const errors = runner.errors.map((error) => ({
    message: error.message,
    source: error.source ?? "runner"
  }));
  const gates = [];
  let plan = null;
  let scopePolicy = null;
  let wroteResultFile = false;
  let codexInvocationResult = null;
  let resultFileObservedAfterCodex = false;
  let executorVerification = buildSkippedExecutorVerification(
    runVerificationAfterCodex
      ? "Codex was not invoked; executor-owned verification did not run"
      : "verification flag not provided"
  );
  let verificationArtifact = buildSkippedVerificationArtifactWrite(
    writeVerificationArtifact
      ? "executor-owned verification did not run"
      : "verification artifact flag not provided",
    { requested: writeVerificationArtifact }
  );
  let attemptArtifact = buildSkippedExecutionAttemptArtifactWrite(
    writeAttemptArtifact
      ? "no execution attempt artifact was needed"
      : "attempt artifact flag not provided",
    { requested: writeAttemptArtifact }
  );
  const writtenFiles = [];

  gates.push({
    name: "detector validation",
    passed: runner.summary.validationErrors === 0
  });

  for (const error of normalizeDetectorGateErrors(runner.detector.validationErrors)) {
    if (!errors.some((existing) => existing.message === error.message)) {
      errors.push(error);
    }
  }

  gates.push({
    name: "single runnable prompt",
    passed: runner.detector.runnable.length <= 1 || Boolean(options.sliceId && runner.plan)
  });

  gates.push({
    name: "git status inspection",
    passed: gitStatus.errors.length === 0
  });

  gates.push({
    name: "dirty working tree policy",
    passed: !dirtyTreePolicy.futureExecutionBlocked
  });

  if (runner.detector.runnable.length > 1 && !options.sliceId) {
    pushUniqueError(errors, {
      message: "Multiple runnable approved prompts found; executor fails closed.",
      source: "executor_selection"
    });
  }

  if (errors.length === 0 && runner.plan) {
    const promptPath = path.join(rootDir, runner.plan.promptFile);
    const resultPath = path.join(rootDir, runner.plan.resultFile);
    const promptContent = existsSync(promptPath)
      ? readFileSync(promptPath, "utf8")
      : null;
    scopePolicy = promptContent
      ? evaluateDocsOnlyScope({
        content: promptContent,
        rootDir,
        config
      })
      : null;
    const gateResults = [
      validatePromptExists(promptPath),
      validateTargetBranch(runner.plan.targetBranch, runner.plan.sliceId, config),
      validateResultFilePath(runner.plan.resultFile, config),
      validateResultFileAbsent(resultPath, runner.plan.resultFile),
      validateGitCurrentBranchAllowed(gitStatus),
      validateGitCurrentBranchMatchesTarget(gitStatus)
    ];

    gates.push(...gateResults.map(({ name, passed }) => ({ name, passed })));

    for (const gate of gateResults) {
      if (!gate.passed) {
        errors.push({
          message: gate.message,
          source: gate.name
        });
      }
    }

    if (errors.length === 0) {
      plan = {
        promptFile: runner.plan.promptFile,
        sliceId: runner.plan.sliceId,
        targetBranch: runner.plan.targetBranch,
        resultFile: runner.plan.resultFile,
        gitStatus,
        dirtyTreePolicy,
        scopePolicy,
        nodePreflight,
        codexCommandPreview: buildCodexInvocationCommand({
          promptFile: runner.plan.promptFile,
          repoRoot: rootDir,
          config
        }),
        verificationCommands: extractVerificationCommandsFromPrompt(promptContent),
        gitCommandPreview: buildGitCommandPreview({
          sliceId: runner.plan.sliceId,
          targetBranch: runner.plan.targetBranch,
          promptFile: runner.plan.promptFile,
          resultFile: runner.plan.resultFile,
          repoRoot: rootDir,
          config
        }),
        steps: [...executorSteps]
      };
    }
  }

  if (codexExecutionRequested && fakeFixtureMode) {
    errors.push({
      message: "Cannot combine --enable-codex-execution with --fake-codex-fixture.",
      source: "codex_execution"
    });
  }

  if (fakeFixtureMode && errors.length === 0 && runner.detector.runnable.length === 0) {
    errors.push({
      message: getNoRunnablePromptMessage(runner),
      source: "fake_fixture_selection"
    });
  }

  if (fakeFixtureMode && errors.length === 0 && !dirtyTreePolicy.fakeFixtureAllowed) {
    errors.push({
      message: dirtyTreePolicy.reason,
      source: "dirty working tree policy"
    });
  }

  if (fakeFixtureMode && errors.length === 0 && plan) {
    const resultPath = path.join(rootDir, plan.resultFile);

    if (existsSync(resultPath)) {
      errors.push({
        message: `Paired result file already exists: ${plan.resultFile}`,
        source: "fake_fixture_result_recheck"
      });
    } else {
      writeFileSync(resultPath, buildFakeFixtureResultFile(plan));
      wroteResultFile = true;
      writtenFiles.push(plan.resultFile);
    }
  }

  const result = {
    executorProtocolVersion: 1,
    mode: fakeFixtureMode ? "fake-codex-fixture" : "skeleton",
    readinessReportRequested,
    codexExecutionRequested,
    docsOnly,
    runCodexNow,
    skipCodexCliCheck,
    runVerificationAfterCodex,
    writeVerificationArtifact,
    writeAttemptArtifact,
    selectedSliceId: runner.selectedSliceId,
    codexExecutionImplemented,
    codexExecutionEnabled,
    codexCliCheck,
    nodePreflight,
    codexExecutionInvoked: false,
    codexInvocationResult,
    resultFileObservedAfterCodex,
    executorVerification,
    verificationArtifact,
    attemptArtifact,
    fakeFixtureMode,
    wroteResultFile,
    writtenFiles,
    gitStatus,
    dirtyTreePolicy,
    scopePolicy,
    runner,
    summary: {
      validationErrors: runner.summary.validationErrors,
      selectionErrors: runner.summary.selectionErrors,
      runnableApprovedPrompts: runner.detector.runnable.length,
      selectedPrompt: plan?.promptFile ?? null,
      wouldExecute: false
    },
    plan,
    gates,
    errors
  };

  result.readinessReport = buildReadinessReport(result);
  result.codexExecutionAdapter = buildCodexExecutionAdapterResult({
    enableCodexExecution: codexExecutionRequested,
    docsOnly,
    runCodexNow,
    readinessReport: result.readinessReport,
    plan,
    commandPreview: plan?.codexCommandPreview,
    dirtyTreePolicy,
    scopePolicy,
    cliCheck: codexCliCheck,
    nodePreflight
  });
  result.summary.wouldExecute = result.codexExecutionAdapter.wouldInvokeCodex;

  if (
    codexExecutionRequested &&
    !fakeFixtureMode &&
    result.codexExecutionAdapter.executionAllowed === false
  ) {
    errors.push({
      message: result.codexExecutionAdapter.reason,
      source: "codex_execution_adapter"
    });
  }

  if (
    result.codexExecutionAdapter.executionAllowed &&
    result.codexExecutionAdapter.wouldInvokeCodex &&
    plan
  ) {
    codexInvocationResult = invokeCodexForDocsOnlyPrompt({
      commandPreview: plan.codexCommandPreview,
      nodePreflight,
      runner: options.codexRunner
    });
    result.codexInvocationResult = codexInvocationResult;
    result.codexExecutionInvoked = codexInvocationResult.invoked;

    if (codexInvocationResult.exitCode !== 0) {
      errors.push({
        message: `Codex invocation exited with code ${codexInvocationResult.exitCode}`,
        source: "codex_execution_adapter"
      });
    }

    const resultPath = path.join(rootDir, plan.resultFile);
    resultFileObservedAfterCodex = existsSync(resultPath);
    result.resultFileObservedAfterCodex = resultFileObservedAfterCodex;

    if (!resultFileObservedAfterCodex) {
      errors.push({
        message: `Paired result file missing after Codex invocation: ${plan.resultFile}`,
        source: "codex_result_file"
      });
    }

    if (runVerificationAfterCodex) {
      executorVerification = runExecutorVerification({
        commands: plan.verificationCommands,
        cwd: rootDir,
        env: options.env,
        runner: options.verificationRunner
      });
      result.executorVerification = executorVerification;

      if (executorVerification.passed === false) {
        errors.push({
          message: "Executor-owned verification failed",
          source: "executor_verification"
        });
      }

      if (writeVerificationArtifact) {
        verificationArtifact = writeExecutorVerificationArtifact({
          rootDir,
          config,
          sliceId: plan.sliceId,
          promptFile: plan.promptFile,
          resultFile: plan.resultFile,
          verification: executorVerification
        });
        result.verificationArtifact = verificationArtifact;

        if (verificationArtifact.wrote) {
          writtenFiles.push(verificationArtifact.path);
        }

        for (const error of verificationArtifact.errors) {
          errors.push({
            message: error,
            source: "verification_artifact"
          });
        }
      }
    }
  }

  if (writeAttemptArtifact && !fakeFixtureMode) {
    attemptArtifact = maybeWriteExecutionAttemptArtifact({
      result,
      rootDir,
      config,
      options
    });
    result.attemptArtifact = attemptArtifact;

    if (attemptArtifact.wrote) {
      writtenFiles.push(attemptArtifact.path);
    }

    for (const error of attemptArtifact.errors) {
      errors.push({
        message: error,
        source: "attempt_artifact"
      });
    }
  }

  return result;
}

export function renderHumanOutput(result) {
  if (result.readinessReportRequested) {
    return renderReadinessReportHumanOutput(result);
  }

  const lines = [
    "Local Codex executor skeleton",
    "",
    `Mode: ${result.mode}`,
    `Codex execution enabled: ${result.codexExecutionEnabled}`,
    `Codex execution invoked: ${result.codexExecutionInvoked}`,
    `Codex execution requested: ${result.codexExecutionRequested}`,
    `Docs-only mode: ${result.docsOnly}`,
    `Run Codex now: ${result.runCodexNow}`,
    `Run verification after Codex: ${result.runVerificationAfterCodex}`,
    `Write verification artifact: ${result.writeVerificationArtifact}`,
    `Write attempt artifact: ${result.writeAttemptArtifact}`,
    `Selected slice: ${result.selectedSliceId ?? "none"}`,
    `Codex execution implemented: ${result.codexExecutionImplemented}`,
    `Codex CLI available: ${formatYesNo(result.codexCliCheck.available)}`,
    `Node preflight available: ${formatYesNo(result.nodePreflight.available)}`,
    `Execution allowed: ${result.codexExecutionAdapter.executionAllowed}`,
    `Would invoke Codex: ${result.codexExecutionAdapter.wouldInvokeCodex}`,
    `Execution adapter reason: ${result.codexExecutionAdapter.reason}`,
    `Executor verification: ${formatExecutorVerification(result.executorVerification)}`,
    `Verification artifact: ${formatVerificationArtifact(result.verificationArtifact)}`,
    `Attempt artifact: ${formatAttemptArtifact(result.attemptArtifact)}`,
    `Runnable prompts: ${result.summary.runnableApprovedPrompts}`,
    `Selected prompt: ${result.summary.selectedPrompt ?? "none"}`,
    `Execution status: ${getExecutionStatus(result)}`,
    `Current branch: ${result.gitStatus.currentBranch ?? "unknown"}`,
    `Target branch: ${result.plan?.targetBranch ?? result.gitStatus.targetBranch ?? "none"}`,
    `Branch allowed: ${formatYesNo(result.gitStatus.branchAllowed)}`,
    `Branch matches target: ${formatBranchMatch(result.gitStatus.branchMatchesTarget)}`,
    `Working tree: ${result.gitStatus.isDirty ? "dirty" : "clean"}`,
    `Dirty paths count: ${result.gitStatus.dirtyPaths.length}`,
    `Future real execution blocked: ${formatYesNo(result.dirtyTreePolicy.futureExecutionBlocked)}`,
    `Fake fixture allowed: ${formatYesNo(result.dirtyTreePolicy.fakeFixtureAllowed)}`,
    `Docs-only scope: ${formatScopePolicy(result.scopePolicy)}`,
    `Docs-only scope violations: ${result.scopePolicy?.violations.length ?? 0}`,
    result.writtenFiles.length > 0
      ? `Files written: ${result.writtenFiles.join(", ")}`
      : "No files written",
    "No commits pushed",
    "No execution was performed",
    "",
    result.plan && result.selectedSliceId
      ? `Review handoff: run codex-run-ledger review --slice-id ${result.selectedSliceId} --write-review-summary --markdown`
      : "Review handoff: npx codex-run-ledger review --slice-id <slice_id> --write-review-summary --markdown",
    "then run protocol checks using docs/codex-runs/REVIEW_PROTOCOL.md"
  ];

  if (result.plan) {
    lines.push("Gated execution plan:");
    lines.push(`- prompt_file: ${result.plan.promptFile}`);
    lines.push(`- slice_id: ${result.plan.sliceId}`);
    lines.push(`- target_branch: ${result.plan.targetBranch}`);
    lines.push(`- result_file: ${result.plan.resultFile}`);
    lines.push(`- Docs-only scope: ${formatScopePolicy(result.plan.scopePolicy)}`);
    lines.push("- Codex command preview: available");
    lines.push("- Command execution: disabled");
    lines.push(`- usesShell: ${result.plan.codexCommandPreview.usesShell}`);
    lines.push(`- willExecute: ${result.plan.codexCommandPreview.willExecute}`);
    lines.push("- Git command preview: available");
    lines.push("- Git command execution: disabled");
    lines.push(`- Git usesShell: ${result.plan.gitCommandPreview.usesShell}`);
    lines.push(`- Git willExecute: ${result.plan.gitCommandPreview.willExecute}`);
    for (const step of result.plan.steps) {
      lines.push(`- ${step}`);
    }
  } else {
    lines.push("No execution plan selected.");
  }

  if (result.gates.length > 0) {
    lines.push("");
    lines.push("Gates:");
    for (const gate of result.gates) {
      lines.push(`- ${gate.name}: ${gate.passed ? "passed" : "failed"}`);
    }
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
      executorProtocolVersion: result.executorProtocolVersion,
      mode: result.mode,
      codexExecutionRequested: result.codexExecutionRequested,
      docsOnly: result.docsOnly,
      runCodexNow: result.runCodexNow,
      skipCodexCliCheck: result.skipCodexCliCheck,
      runVerificationAfterCodex: result.runVerificationAfterCodex,
      writeVerificationArtifact: result.writeVerificationArtifact,
      writeAttemptArtifact: result.writeAttemptArtifact,
      selectedSliceId: result.selectedSliceId,
      codexExecutionImplemented: result.codexExecutionImplemented,
      codexExecutionEnabled: result.codexExecutionEnabled,
      codexCliCheck: result.codexCliCheck,
      nodePreflight: result.nodePreflight,
      codexExecutionInvoked: result.codexExecutionInvoked,
      codexExecutionAdapter: result.codexExecutionAdapter,
      codexInvocationResult: result.codexInvocationResult,
      resultFileObservedAfterCodex: result.resultFileObservedAfterCodex,
      executorVerification: result.executorVerification,
      verificationArtifact: result.verificationArtifact,
      attemptArtifact: result.attemptArtifact,
      fakeFixtureMode: result.fakeFixtureMode,
      wroteResultFile: result.wroteResultFile,
      writtenFiles: result.writtenFiles,
      summary: result.summary,
      plan: result.plan,
      gitStatus: result.gitStatus,
      dirtyTreePolicy: result.dirtyTreePolicy,
      scopePolicy: result.scopePolicy,
      readinessReport: result.readinessReport,
      gates: result.gates,
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
    result = buildLocalExecutorPlan({
      dir: args.dir,
      enableCodexExecution: args.enableCodexExecution,
      docsOnly: args.docsOnly,
      runCodexNow: args.runCodexNow,
      skipCodexCliCheck: args.skipCodexCliCheck,
      runVerificationAfterCodex: args.runVerificationAfterCodex,
      writeVerificationArtifact: args.writeVerificationArtifact,
      writeAttemptArtifact: args.writeAttemptArtifact,
      fakeCodexFixture: args.fakeCodexFixture,
      readinessReport: args.readinessReport,
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

function getGitStatusInspection({ options, config, rootDir, runnerPlan }) {
  if (options.gitStatusInspection) {
    return options.gitStatusInspection;
  }

  return inspectGitStatus({
    cwd: rootDir,
    sliceId: runnerPlan?.sliceId,
    targetBranch: runnerPlan?.targetBranch,
    config
  });
}

function getCodexCliAvailabilityCheck({ options, rootDir }) {
  if (options.codexCliCheck) {
    return options.codexCliCheck;
  }

  if (options.skipCodexCliCheck) {
    return buildSkippedCodexCliAvailabilityCheck();
  }

  return checkCodexCliAvailability({
    cwd: rootDir,
    runner: options.codexCliCheckRunner
  });
}

function getNodeAvailabilityPreflight({ options }) {
  if (options.nodePreflight) {
    return options.nodePreflight;
  }

  return buildNodeAvailabilityPreflight({
    env: options.env,
    execPath: options.nodeExecPath
  });
}

function maybeWriteExecutionAttemptArtifact({ result, rootDir, config, options }) {
  if (!result.codexExecutionRequested) {
    return buildSkippedExecutionAttemptArtifactWrite(
      "Codex execution was not requested",
      { requested: result.writeAttemptArtifact }
    );
  }

  if (!result.runCodexNow) {
    return buildSkippedExecutionAttemptArtifactWrite(
      "run-codex-now flag not provided; evaluation-only run did not create an attempt artifact",
      { requested: result.writeAttemptArtifact }
    );
  }

  const context = getAttemptArtifactContext(result);

  if (!context) {
    return buildSkippedExecutionAttemptArtifactWrite(
      "no selected prompt available for attempt artifact path",
      { requested: result.writeAttemptArtifact }
    );
  }

  const details = buildExecutionAttemptDetails({ result, context });

  if (!details) {
    return buildSkippedExecutionAttemptArtifactWrite(
      "execution attempt completed without an artifact-worthy state",
      { requested: result.writeAttemptArtifact }
    );
  }

  return writeExecutionAttemptArtifact({
    rootDir,
    config,
    sliceId: context.sliceId,
    promptFile: context.promptFile,
    resultFile: context.resultFile,
    verificationArtifactFile: result.verificationArtifact?.path ?? null,
    status: details.status,
    stage: details.stage,
    codexInvoked: result.codexExecutionInvoked,
    resultFileCreated: result.resultFileObservedAfterCodex || result.wroteResultFile,
    verificationRan: result.executorVerification?.ran === true,
    verificationArtifactCreated: result.verificationArtifact?.wrote === true,
    reason: details.reason,
    blockers: details.blockers,
    commandPreview: {
      codex: summarizeCodexCommandPreview(context.codexCommandPreview),
      git: summarizeGitCommandPreview(context.gitCommandPreview)
    },
    env: options.env
  });
}

function getAttemptArtifactContext(result) {
  if (result.plan) {
    return {
      sliceId: result.plan.sliceId,
      promptFile: result.plan.promptFile,
      resultFile: result.plan.resultFile,
      codexCommandPreview: result.plan.codexCommandPreview,
      gitCommandPreview: result.plan.gitCommandPreview
    };
  }

  const runnablePrompt = result.runner.detector.runnable[0];

  if (!runnablePrompt) {
    return null;
  }

  return {
    sliceId: runnablePrompt.sliceId,
    promptFile: runnablePrompt.path,
    resultFile: runnablePrompt.resultFile,
    codexCommandPreview: null,
    gitCommandPreview: null
  };
}

function buildExecutionAttemptDetails({ result }) {
  const blockers = collectExecutionAttemptBlockers(result);

  if (!result.codexExecutionInvoked) {
    if (
      result.codexExecutionAdapter?.executionAllowed === false ||
      result.readinessReport?.safeToAttemptDocsOnlyRealExecution === false ||
      blockers.length > 0
    ) {
      return {
        status: "blocked",
        stage: getBlockedAttemptStage(result),
        reason: result.codexExecutionAdapter?.reason ?? result.readinessReport?.reason ?? "execution blocked before Codex invocation",
        blockers
      };
    }

    return null;
  }

  if (result.codexInvocationResult?.exitCode !== 0) {
    return {
      status: "failed",
      stage: "codex_invocation",
      reason: `Codex invocation exited with code ${result.codexInvocationResult?.exitCode}`,
      blockers
    };
  }

  if (!result.resultFileObservedAfterCodex) {
    return {
      status: "failed",
      stage: "result_check",
      reason: "paired result file missing after Codex invocation",
      blockers
    };
  }

  if (result.executorVerification?.ran === true && result.executorVerification.passed === false) {
    return {
      status: "failed",
      stage: "verification",
      reason: "executor-owned verification failed",
      blockers
    };
  }

  if (result.verificationArtifact?.requested === true && result.verificationArtifact.wrote === false) {
    return {
      status: "failed",
      stage: "artifact_write",
      reason: result.verificationArtifact.reason ?? "verification artifact write failed",
      blockers
    };
  }

  return {
    status: "completed",
    stage: "result_check",
    reason: "Codex invocation completed and paired result file was observed",
    blockers
  };
}

function collectExecutionAttemptBlockers(result) {
  const blockers = result.errors.map((error) => error.message);

  if (result.readinessReport?.safeToAttemptDocsOnlyRealExecution === false) {
    blockers.push(result.readinessReport.reason);
  }

  if (result.dirtyTreePolicy?.futureExecutionBlocked) {
    blockers.push(result.dirtyTreePolicy.reason);
  }

  for (const blocker of result.codexExecutionAdapter?.blockers ?? []) {
    blockers.push(blocker);
  }

  return [...new Set(blockers.filter(Boolean))];
}

function getBlockedAttemptStage(result) {
  const reason = `${result.codexExecutionAdapter?.reason ?? ""} ${result.readinessReport?.reason ?? ""}`.toLowerCase();

  if (reason.includes("approval")) {
    return "approval";
  }

  return "preflight";
}

function summarizeCodexCommandPreview(commandPreview) {
  if (!commandPreview) {
    return null;
  }

  return {
    executable: commandPreview.executable,
    args: Array.isArray(commandPreview.args) ? [...commandPreview.args] : [],
    usesShell: commandPreview.usesShell,
    willExecute: commandPreview.willExecute
  };
}

function summarizeGitCommandPreview(commandPreview) {
  if (!commandPreview) {
    return null;
  }

  return {
    gitPlanVersion: commandPreview.gitPlanVersion,
    commandCount: Array.isArray(commandPreview.commands)
      ? commandPreview.commands.length
      : 0,
    usesShell: commandPreview.usesShell,
    willExecute: commandPreview.willExecute
  };
}

function buildDirtyTreePolicy(gitStatus) {
  const dirtyPaths = Array.isArray(gitStatus.dirtyPaths) ? gitStatus.dirtyPaths : [];
  const isDirty = Boolean(gitStatus.isDirty || dirtyPaths.length > 0);

  if (!isDirty) {
    return {
      policyVersion: 1,
      isDirty: false,
      dirtyPaths: [],
      preExistingDirtyPaths: [],
      futureExecutionBlocked: false,
      fakeFixtureAllowed: true,
      reason: "working tree clean"
    };
  }

  return {
    policyVersion: 1,
    isDirty: true,
    dirtyPaths: [...dirtyPaths],
    preExistingDirtyPaths: [...dirtyPaths],
    futureExecutionBlocked: true,
    fakeFixtureAllowed: false,
    reason: "dirty working tree blocks future real execution and fake fixture writes"
  };
}

function buildReadinessReport(result) {
  const runnableCount = result.runner.detector.runnable.length;
  const validationErrorCount = result.runner.summary.validationErrors;
  const explicitSelectionSatisfied = Boolean(result.selectedSliceId && result.runner.plan);
  const selectedRunnerPlan = runnableCount === 1 || explicitSelectionSatisfied
    ? result.runner.plan
    : null;
  const commandPreviews = getCommandPreviewReadiness(result.plan);
  const branchMatchesTarget = selectedRunnerPlan
    ? Boolean(result.gitStatus.branchMatchesTarget)
    : null;
  const docsOnlyScopePassed = selectedRunnerPlan
    ? Boolean(result.scopePolicy?.docsOnly)
    : null;
  const cliAvailable = result.codexCliCheck.available === true;
  const nodePreflightAvailable = result.nodePreflight.available === true;
  const realExecutionImplementedAndEnabled =
    result.codexExecutionImplemented && result.codexExecutionEnabled;
  const reason = getReadinessReason({
    runnableCount,
    result,
    commandPreviews,
    branchMatchesTarget,
    docsOnlyScopePassed,
    cliAvailable,
    nodePreflightAvailable,
    validationErrorCount,
    realExecutionImplementedAndEnabled,
    explicitSelectionSatisfied
  });
  const checks = [
    {
      name: "detector validation",
      passed: validationErrorCount === 0,
      severity: "blocker",
      details: `${validationErrorCount} validation errors`
    },
    {
      name: "single runnable prompt",
      passed: runnableCount === 1 || explicitSelectionSatisfied,
      severity: "blocker",
      details: explicitSelectionSatisfied
        ? `${runnableCount} runnable approved prompts; selected ${result.selectedSliceId}`
        : `${runnableCount} runnable approved prompts`
    },
    {
      name: "branch allowed",
      passed: result.gitStatus.branchAllowed === true,
      severity: "blocker",
      details: result.gitStatus.currentBranch
        ? `current branch ${result.gitStatus.currentBranch} is ${
            result.gitStatus.branchAllowed ? "allowed" : "not allowed"
          }`
        : "current branch unknown"
    },
    {
      name: "branch matches target",
      passed: selectedRunnerPlan ? branchMatchesTarget : null,
      severity: "blocker",
      details: selectedRunnerPlan
        ? `current branch ${result.gitStatus.currentBranch ?? "unknown"} ${
            branchMatchesTarget ? "matches" : "does not match"
          } target branch ${selectedRunnerPlan.targetBranch}`
        : "not applicable because no prompt selected"
    },
    {
      name: "working tree clean",
      passed: !result.dirtyTreePolicy.isDirty,
      severity: "blocker",
      details: result.dirtyTreePolicy.isDirty
        ? `${result.dirtyTreePolicy.dirtyPaths.length} dirty paths`
        : "working tree clean"
    },
    {
      name: "docs-only scope",
      passed: docsOnlyScopePassed,
      severity: "blocker",
      details: selectedRunnerPlan
        ? getScopePolicyDetails(result.scopePolicy)
        : "not applicable because no prompt selected"
    },
    {
      name: "Codex command preview",
      passed: selectedRunnerPlan ? commandPreviews.codex : null,
      severity: "blocker",
      details: selectedRunnerPlan
        ? commandPreviews.codexDetails
        : "not applicable because no prompt selected"
    },
    {
      name: "Codex CLI available",
      passed: selectedRunnerPlan ? cliAvailable : null,
      severity: "blocker",
      details: selectedRunnerPlan
        ? getCodexCliCheckDetails(result.codexCliCheck)
        : "not applicable because no prompt selected"
    },
    {
      name: "Node availability preflight",
      passed: selectedRunnerPlan ? nodePreflightAvailable : null,
      severity: "blocker",
      details: selectedRunnerPlan
        ? getNodePreflightDetails(result.nodePreflight)
        : "not applicable because no prompt selected"
    },
    {
      name: "Git command preview",
      passed: selectedRunnerPlan ? commandPreviews.git : null,
      severity: "blocker",
      details: selectedRunnerPlan
        ? commandPreviews.gitDetails
        : "not applicable because no prompt selected"
    },
    {
      name: "real Codex execution implemented",
      passed: realExecutionImplementedAndEnabled,
      severity: "blocker",
      details: realExecutionImplementedAndEnabled
        ? "real Codex execution adapter is implemented and enabled for this run"
        : "real Codex execution is not enabled for this run"
    }
  ];

  return {
    readinessReportVersion: 1,
    safeToAttemptDocsOnlyRealExecution: reason === null,
    reason: reason ?? "ready to attempt docs-only real execution",
    selectedPrompt: selectedRunnerPlan?.promptFile ?? null,
    targetBranch: selectedRunnerPlan?.targetBranch ?? null,
    currentBranch: result.gitStatus.currentBranch ?? null,
    checks
  };
}

function getCommandPreviewReadiness(plan) {
  const codexPreview = plan?.codexCommandPreview;
  const gitPreview = plan?.gitCommandPreview;
  const codex =
    Boolean(codexPreview) &&
    codexPreview.executable === "codex" &&
    Array.isArray(codexPreview.args) &&
    codexPreview.usesShell === false &&
    codexPreview.willExecute === false;
  const git =
    Boolean(gitPreview) &&
    gitPreview.gitPlanVersion === 1 &&
    Array.isArray(gitPreview.commands) &&
    gitPreview.usesShell === false &&
    gitPreview.willExecute === false &&
    gitPreview.commands.every(
      (command) =>
        command.executable === "git" &&
        Array.isArray(command.args) &&
        command.usesShell === false &&
        command.willExecute === false
    );

  return {
    codex,
    git,
    codexDetails: codex
      ? "Codex command preview is valid and non-shell"
      : "Codex command preview missing or invalid",
    gitDetails: git
      ? "Git command preview is valid and non-shell"
      : "Git command preview missing or invalid"
  };
}

function getReadinessReason({
  runnableCount,
  result,
  commandPreviews,
  branchMatchesTarget,
  docsOnlyScopePassed,
  cliAvailable,
  nodePreflightAvailable,
  validationErrorCount,
  realExecutionImplementedAndEnabled,
  explicitSelectionSatisfied
}) {
  if (validationErrorCount > 0) {
    return "detector validation errors block real execution";
  }

  if (runnableCount === 0) {
    return "no runnable approved prompt";
  }

  if (runnableCount > 1 && !explicitSelectionSatisfied) {
    return "multiple runnable approved prompts";
  }

  if (!result.gitStatus.branchAllowed) {
    return "current branch is not allowed";
  }

  if (branchMatchesTarget === false) {
    return "current branch does not match target branch";
  }

  if (docsOnlyScopePassed === false) {
    return "docs-only scope violation blocks real execution";
  }

  if (result.dirtyTreePolicy.futureExecutionBlocked) {
    return "dirty working tree blocks real execution";
  }

  if (!commandPreviews.codex) {
    return "Codex command preview missing or invalid";
  }

  if (!cliAvailable) {
    return "Codex CLI availability check failed";
  }

  if (!nodePreflightAvailable) {
    return "Node availability preflight failed";
  }

  if (!commandPreviews.git) {
    return "Git command preview missing or invalid";
  }

  if (!realExecutionImplementedAndEnabled) {
    return "real Codex execution is not implemented or enabled";
  }

  return null;
}

function validatePromptExists(promptPath) {
  const passed = existsSync(promptPath);

  return {
    name: "prompt file exists",
    passed,
    message: passed ? undefined : `Prompt file does not exist: ${promptPath}`
  };
}

function validateTargetBranch(targetBranch, sliceId, config) {
  const passed =
    typeof targetBranch === "string" &&
    !/[;&|`$><\r\n]|\\[rn]/.test(targetBranch) &&
    !config.forbiddenTargetBranches.includes(targetBranch) &&
    isAllowedTargetBranch(targetBranch, sliceId, config);

  return {
    name: "safe target branch",
    passed,
    message: passed
      ? undefined
      : `Unsafe target branch rejected: ${targetBranch ?? "missing"}; expected ${describeAllowedBranches(config, sliceId)}`
  };
}

function validateResultFilePath(resultFile, config) {
  const normalized = String(resultFile ?? "").split(path.sep).join("/");
  const passed =
    isPathUnderAllowedRoots(normalized, [`${config.promptDir}/`]) &&
    !normalized.includes("../") &&
    !path.isAbsolute(resultFile ?? "");

  return {
    name: "result file path scope",
    passed,
    message: passed
      ? undefined
      : `Result file must stay inside ${config.promptDir}: ${resultFile ?? "missing"}`
  };
}

function validateResultFileAbsent(resultPath, resultFile) {
  const passed = !existsSync(resultPath);

  return {
    name: "paired result file absent",
    passed,
    message: passed
      ? undefined
      : `Paired result file already exists: ${resultFile}`
  };
}

function validateGitCurrentBranchAllowed(gitStatus) {
  const inspectionUnavailable =
    !gitStatus.currentBranch &&
    gitStatus.errors.length === 0 &&
    gitStatus.warnings.length > 0;
  const passed = inspectionUnavailable || gitStatus.branchAllowed;

  return {
    name: "current branch allowed",
    passed,
    message: passed
      ? undefined
      : `Current branch is not allowed: ${gitStatus.currentBranch ?? "unknown"}`
  };
}

function validateGitCurrentBranchMatchesTarget(gitStatus) {
  const passed =
    gitStatus.branchMatchesTarget === null ||
    gitStatus.branchMatchesTarget === true;

  return {
    name: "current branch matches target",
    passed,
    message: passed
      ? undefined
      : `Current branch ${gitStatus.currentBranch ?? "unknown"} does not match target branch ${gitStatus.targetBranch ?? "unknown"}`
  };
}

function getExecutionStatus(result) {
  if (result.fakeFixtureMode) {
    return result.wroteResultFile ? "fake fixture completed" : "fake fixture blocked";
  }

  if (result.codexExecutionRequested && !result.codexExecutionImplemented) {
    return "not implemented";
  }

  return "disabled";
}

function formatYesNo(value) {
  return value ? "yes" : "no";
}

function formatBranchMatch(value) {
  if (value === null) {
    return "not applicable";
  }

  return value ? "yes" : "no";
}

function formatScopePolicy(scopePolicy) {
  if (!scopePolicy) {
    return "not applicable";
  }

  return scopePolicy.docsOnly ? "pass" : "fail";
}

function formatExecutorVerification(executorVerification) {
  if (!executorVerification || executorVerification.ran !== true) {
    return executorVerification?.reason ?? "not run";
  }

  const status = executorVerification.passed ? "passed" : "failed";

  return `${status}; ${executorVerification.commands.length} commands; ${executorVerification.failedCommandCount} failed`;
}

function formatVerificationArtifact(verificationArtifact) {
  if (!verificationArtifact) {
    return "not requested";
  }

  if (verificationArtifact.wrote) {
    return `written: ${verificationArtifact.path}`;
  }

  return verificationArtifact.reason ?? "not written";
}

function formatAttemptArtifact(attemptArtifact) {
  if (!attemptArtifact) {
    return "not requested";
  }

  if (attemptArtifact.wrote) {
    return `written: ${attemptArtifact.path}`;
  }

  return attemptArtifact.reason ?? "not written";
}

function getScopePolicyDetails(scopePolicy) {
  if (!scopePolicy) {
    return "scope policy unavailable";
  }

  if (scopePolicy.docsOnly) {
    return `${scopePolicy.allowedPaths.length} allowed docs-only paths`;
  }

  return `${scopePolicy.violations.length} scope violations`;
}

function getCodexCliCheckDetails(cliCheck) {
  if (!cliCheck) {
    return "Codex CLI availability check unavailable";
  }

  if (cliCheck.skipped) {
    return "Codex CLI availability check skipped";
  }

  if (cliCheck.available) {
    const preview = cliCheck.stdoutPreview || cliCheck.stderrPreview;

    return preview
      ? `Codex CLI available: ${preview.trim()}`
      : "Codex CLI available";
  }

  return cliCheck.errors?.[0] ?? "Codex CLI unavailable";
}

function getNodePreflightDetails(nodePreflight) {
  if (!nodePreflight) {
    return "Node availability preflight unavailable";
  }

  if (nodePreflight.available) {
    return `Node available at ${nodePreflight.processExecPath}; version ${nodePreflight.processVersion}`;
  }

  return nodePreflight.errors?.[0] ?? "Node availability preflight failed";
}

function renderReadinessReportHumanOutput(result) {
  const report = result.readinessReport;
  const lines = [
    "Real execution readiness report",
    "",
    `Safe to attempt docs-only real execution: ${
      report.safeToAttemptDocsOnlyRealExecution ? "yes" : "no"
    }`,
    `Reason: ${report.reason}`,
    `Selected prompt: ${report.selectedPrompt ?? "none"}`,
    `Current branch: ${report.currentBranch ?? "unknown"}`,
    `Target branch: ${report.targetBranch ?? "none"}`,
    `Codex execution requested: ${result.codexExecutionAdapter.executionRequested ? "yes" : "no"}`,
    `Docs-only mode: ${result.codexExecutionAdapter.docsOnly ? "yes" : "no"}`,
    `Run Codex now: ${result.codexExecutionAdapter.runCodexNow ? "yes" : "no"}`,
    `Codex CLI available: ${result.codexCliCheck.available ? "yes" : "no"}`,
    `Node preflight available: ${result.nodePreflight.available ? "yes" : "no"}`,
    `Execution allowed: ${result.codexExecutionAdapter.executionAllowed ? "yes" : "no"}`,
    `Execution implemented: ${result.codexExecutionAdapter.executionImplemented ? "yes" : "no"}`,
    `Would invoke Codex: ${result.codexExecutionAdapter.wouldInvokeCodex ? "yes" : "no"}`,
    `Execution adapter reason: ${result.codexExecutionAdapter.reason}`,
    "",
    "Checks:"
  ];

  for (const check of report.checks) {
    lines.push(`- ${check.name}: ${formatReadinessCheck(check.passed)}`);
  }

  lines.push("");
  lines.push("No execution was performed.");

  return `${lines.join("\n")}\n`;
}

function formatReadinessCheck(value) {
  if (value === null) {
    return "n/a";
  }

  return value ? "pass" : "fail";
}

function normalizeDetectorGateErrors(validationErrors) {
  return validationErrors
    .filter((error) => error.includes("target_branch"))
    .map((error) => ({
      message: `Unsafe target branch rejected by detector validation: ${error}`,
      source: "safe target branch"
    }));
}

function pushUniqueError(errors, error) {
  if (!errors.some((existing) => existing.message === error.message)) {
    errors.push(error);
  }
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

    if (args[index] === "--dry-run") {
      parsed.dryRun = true;
      continue;
    }

    if (args[index] === "--enable-codex-execution") {
      parsed.enableCodexExecution = true;
      continue;
    }

    if (args[index] === "--docs-only") {
      parsed.docsOnly = true;
      continue;
    }

    if (args[index] === "--run-codex-now") {
      parsed.runCodexNow = true;
      continue;
    }

    if (args[index] === "--run-verification-after-codex") {
      parsed.runVerificationAfterCodex = true;
      continue;
    }

    if (args[index] === "--write-verification-artifact") {
      parsed.writeVerificationArtifact = true;
      continue;
    }

    if (args[index] === "--write-attempt-artifact") {
      parsed.writeAttemptArtifact = true;
      continue;
    }

    if (args[index] === "--skip-codex-cli-check") {
      parsed.skipCodexCliCheck = true;
      continue;
    }

    if (args[index] === "--fake-codex-fixture") {
      parsed.fakeCodexFixture = true;
      continue;
    }

    if (args[index] === "--readiness-report") {
      parsed.readinessReport = true;
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

function getNoRunnablePromptMessage(runner) {
  const completedPrompt = runner.detector.skipped.find(
    (item) => item.reason === "paired result file already exists"
  );

  if (completedPrompt) {
    return `No runnable approved prompt found; paired result file already exists for ${completedPrompt.path}`;
  }

  return "No runnable approved prompt found; fake fixture mode requires exactly one runnable prompt.";
}

function buildFakeFixtureResultFile(plan) {
  const timestamp = new Date().toISOString();

  return `---\n` +
    `codex_run_protocol: 1\n` +
    `slice_id: ${plan.sliceId}\n` +
    `status: completed\n` +
    `owner: codex-worker\n` +
    `source_prompt: ${plan.promptFile}\n` +
    `branch: ${plan.targetBranch}\n` +
    `commit_sha: null\n` +
    `started_at: ${timestamp}\n` +
    `completed_at: ${timestamp}\n` +
    `---\n\n` +
    `# Codex Slice Result: ${plan.sliceId}\n\n` +
    `## Summary\n\n` +
    `This result was produced by local executor fake fixture mode. Codex execution was not invoked.\n\n` +
    `## Files Changed\n\n` +
    `- \`${plan.resultFile}\`\n\n` +
    `## Commands Run\n\n` +
    `No real commands were run by Codex. The executor fixture wrote this result file.\n\n` +
    `## Verification Results\n\n` +
    `Fake fixture validation only.\n\n` +
    `## Deployment / Runtime Results\n\n` +
    `None.\n\n` +
    `## Deviations From Prompt\n\n` +
    `Fake fixture mode did not implement the prompt body; it only simulated result-file creation.\n\n` +
    `## Known Issues / Risks\n\n` +
    `Not a real implementation.\n\n` +
    `## Suggested Next Slice\n\n` +
    `Continue toward guarded docs-only local execution after fixture behavior is proven.\n\n` +
    `## Commit / Branch Info\n\n` +
    `- Branch target from prompt: \`${plan.targetBranch}\`\n` +
    `- Commit SHA: \`null\`\n`;
}

function inferRootDir(scanDir) {
  const normalized = path.resolve(scanDir);
  const suffix = path.join("docs", "codex-runs");

  if (normalized.endsWith(suffix)) {
    return normalized.slice(0, -suffix.length).replace(/[\\/]$/, "") || path.parse(normalized).root;
  }

  return process.cwd();
}

const currentFile = fileURLToPath(import.meta.url);

if (process.argv[1] && path.resolve(process.argv[1]) === currentFile) {
  main();
}
