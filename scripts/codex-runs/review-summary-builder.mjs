import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadLedgerConfig } from "./config.mjs";
import { normalizeSliceId, parseFrontmatter } from "./detect-approved-prompts.mjs";

export function deriveReviewSummaryArtifactPath(sliceId, options = {}) {
  const config = loadLedgerConfig({
    rootDir: options.rootDir,
    configPath: options.configPath,
    config: options.config
  });
  const normalizedSliceId = normalizeSliceId(sliceId);

  return `${config.promptDir}/${normalizedSliceId}-review.md`;
}

export function buildReviewSummaryPacket(options = {}) {
  const rootDir = path.resolve(options.rootDir ?? process.cwd());
  const config = loadLedgerConfig({
    rootDir,
    configPath: options.configPath,
    config: options.config
  });
  const sliceId = normalizeSliceId(options.sliceId);
  const promptFile = `${config.promptDir}/${sliceId}-prompt.md`;
  const promptPath = path.resolve(rootDir, promptFile);

  if (!existsSync(promptPath)) {
    throw new Error(`Prompt file not found for slice id ${sliceId}: ${promptFile}`);
  }

  const promptContent = readFileSync(promptPath, "utf8");
  const promptFrontmatter = parseFrontmatter(promptContent);

  if (!promptFrontmatter) {
    throw new Error(`Prompt frontmatter is missing or malformed: ${promptFile}`);
  }

  const resultFile = String(
    promptFrontmatter.result_file ?? `${config.promptDir}/${sliceId}-result.md`
  );
  const result = readResultArtifact({ rootDir, resultFile });
  const verification = readVerificationArtifact({ rootDir, sliceId, config });
  const attempts = readAttemptArtifacts({ rootDir, sliceId, config });
  const latestAttempt = attempts.at(-1) ?? null;
  const promptStatus = String(promptFrontmatter.status ?? "unknown");
  const resultStatus = result.frontmatter?.status ?? null;
  const warnings = [];

  if (result.exists && !verification.exists) {
    warnings.push("Result file exists without a verification artifact.");
  }

  if (verification.exists && verification.parseError) {
    warnings.push(`Verification artifact could not be parsed: ${verification.parseError}`);
  }

  for (const attempt of attempts) {
    if (attempt.parseError) {
      warnings.push(`Attempt artifact could not be parsed: ${attempt.path}: ${attempt.parseError}`);
    }
  }

  const runnableStatus = determineRunnableStatus({
    promptStatus,
    resultExists: result.exists,
    attempts,
    latestAttempt
  });
  const recommendedNextAction = determineRecommendedNextAction({
    promptStatus,
    resultExists: result.exists,
    resultStatus,
    verification,
    latestAttempt
  });

  return {
    reviewSummaryVersion: 1,
    sliceId,
    reviewProtocolFile: `${config.promptDir}/REVIEW_PROTOCOL.md`,
    promptFile,
    promptStatus,
    resultFile,
    resultExists: result.exists,
    resultStatus,
    verificationArtifactFile: verification.exists ? verification.path : null,
    verificationSummary: verification.exists ? verification.summary : null,
    attemptArtifactFiles: attempts.map((attempt) => attempt.path),
    latestAttemptStatus: latestAttempt?.status ?? null,
    latestAttempt: latestAttempt
      ? {
          attemptNumber: latestAttempt.attemptNumber,
          status: latestAttempt.status,
          stage: latestAttempt.stage,
          reason: latestAttempt.reason,
          codexInvoked: latestAttempt.codexInvoked,
          resultFileCreated: latestAttempt.resultFileCreated
        }
      : null,
    runnableStatus,
    changedFilesSummary: result.sections.filesChanged,
    commandsRunSummary: result.sections.commandsRun,
    risksKnownIssues: result.sections.knownIssuesRisks,
    recommendedNextAction,
    warnings,
    humanSummary: buildHumanSummary({
      sliceId,
      promptStatus,
      resultExists: result.exists,
      resultStatus,
      runnableStatus,
      recommendedNextAction,
      verification,
      latestAttempt
    })
  };
}

export function renderReviewSummaryJson(packet) {
  return `${JSON.stringify(packet, null, 2)}\n`;
}

export function renderReviewSummaryMarkdown(packet) {
  const lines = [
    `# Codex Review Summary: ${packet.sliceId}`,
    "",
    "## Status",
    "",
    `- Prompt status: ${packet.promptStatus}`,
    `- Runnable status: ${packet.runnableStatus}`,
    `- Result status: ${packet.resultStatus ?? "none"}`,
    "- Packet role: human review handoff (not a final approval)",
    `- Recommended next action: ${packet.recommendedNextAction}`,
    "",
    "## Summary",
    "",
    packet.humanSummary,
    ""
  ];

  if (packet.warnings.length > 0) {
    lines.push("Warnings:", "");
    for (const warning of packet.warnings) {
      lines.push(`- ${warning}`);
    }
    lines.push("");
  }

  lines.push(
    "## Files",
    "",
    `- Prompt: ${packet.promptFile}`,
    `- Result: ${packet.resultFile}${packet.resultExists ? "" : " (absent)"}`,
    `- Review protocol: ${packet.reviewProtocolFile}`
  );

  if (packet.verificationArtifactFile) {
    lines.push(`- Verification artifact: ${packet.verificationArtifactFile}`);
  }

  for (const attemptFile of packet.attemptArtifactFiles) {
    lines.push(`- Attempt artifact: ${attemptFile}`);
  }

  appendListSection(lines, "Changed Files", packet.changedFilesSummary);
  lines.push("", "## Verification", "");

  if (packet.verificationSummary) {
    lines.push(
      `- Passed: ${String(packet.verificationSummary.passed)}`,
      `- Command count: ${packet.verificationSummary.commandCount}`,
      `- Failed command count: ${packet.verificationSummary.failedCommandCount}`
    );
  } else {
    lines.push("- No verification artifact found.");
  }

  lines.push("", "## Attempts", "");

  if (packet.latestAttempt) {
    lines.push(
      `- Latest attempt: ${packet.latestAttempt.attemptNumber}`,
      `- Status: ${packet.latestAttempt.status}`,
      `- Stage: ${packet.latestAttempt.stage ?? "unknown"}`,
      `- Reason: ${packet.latestAttempt.reason ?? "none"}`
    );
  } else {
    lines.push("- No attempt artifacts found.");
  }

  appendListSection(lines, "Commands Run", packet.commandsRunSummary);
  appendListSection(lines, "Known Issues / Risks", packet.risksKnownIssues);
  lines.push(
    "",
    "## Recommended Next Action",
    "",
    packet.recommendedNextAction,
    ""
  );

  return `${lines.join("\n")}\n`;
}

export function writeReviewSummaryArtifact(options = {}) {
  const rootDir = path.resolve(options.rootDir ?? process.cwd());
  const config = loadLedgerConfig({
    rootDir,
    configPath: options.configPath,
    config: options.config
  });
  const sliceId = normalizeSliceId(options.sliceId);
  const artifactPath = deriveReviewSummaryArtifactPath(sliceId, { config, rootDir });
  const absoluteArtifactPath = path.resolve(rootDir, artifactPath);
  const codexRunsDir = path.resolve(rootDir, config.promptDir);

  if (!isPathInsideDirectory(absoluteArtifactPath, codexRunsDir)) {
    return {
      reviewSummaryWriteVersion: 1,
      requested: true,
      wrote: false,
      path: artifactPath,
      reason: `review summary path is outside ${config.promptDir}`,
      errors: [`Review summary path outside ${config.promptDir}: ${artifactPath}`]
    };
  }

  if (existsSync(absoluteArtifactPath)) {
    return {
      reviewSummaryWriteVersion: 1,
      requested: true,
      wrote: false,
      path: artifactPath,
      reason: "review summary already exists",
      errors: [`Review summary already exists: ${artifactPath}`]
    };
  }

  const packet = options.packet ?? buildReviewSummaryPacket({ rootDir, sliceId, config });
  mkdirSync(path.dirname(absoluteArtifactPath), { recursive: true });
  writeFileSync(absoluteArtifactPath, renderReviewSummaryMarkdown(packet));

  return {
    reviewSummaryWriteVersion: 1,
    requested: true,
    wrote: true,
    path: artifactPath,
    reason: "review summary written",
    errors: []
  };
}

export function runReviewSummaryBuilderCli(args = process.argv.slice(2), options = {}) {
  try {
    const parsed = parseCliArgs(args);
    const rootDir = path.resolve(options.rootDir ?? process.cwd());
    const packet = buildReviewSummaryPacket({
      rootDir,
      sliceId: parsed.sliceId,
      configPath: parsed.config
    });
    let writeResult = null;

    if (parsed.writeReviewSummary) {
      writeResult = writeReviewSummaryArtifact({
        rootDir,
        sliceId: parsed.sliceId,
        packet,
        configPath: parsed.config
      });

      if (!writeResult.wrote) {
        return {
          exitCode: 1,
          stdout: "",
          stderr: `${writeResult.reason}: ${writeResult.errors.join("; ")}\n`
        };
      }
    }

    if (parsed.json) {
      return {
        exitCode: 0,
        stdout: renderReviewSummaryJson(writeResult ? { packet, reviewSummaryWrite: writeResult } : packet),
        stderr: ""
      };
    }

    const output = renderReviewSummaryMarkdown(packet);

    return {
      exitCode: 0,
      stdout: writeResult ? `${output}\nReview summary written: ${writeResult.path}\n` : output,
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

function readResultArtifact({ rootDir, resultFile }) {
  const resultPath = path.resolve(rootDir, resultFile);

  if (!existsSync(resultPath)) {
    return {
      exists: false,
      frontmatter: null,
      sections: emptyResultSections()
    };
  }

  const content = readFileSync(resultPath, "utf8");

  return {
    exists: true,
    frontmatter: parseFrontmatter(content) ?? {},
    sections: {
      filesChanged: extractSectionLines(content, "Files Changed"),
      commandsRun: extractSectionLines(content, "Commands Run"),
      knownIssuesRisks: extractSectionLines(content, "Known Issues / Risks")
    }
  };
}

function readVerificationArtifact({ rootDir, sliceId, config }) {
  const artifactPath = `${config.promptDir}/${sliceId}-verification.json`;
  const absolutePath = path.resolve(rootDir, artifactPath);

  if (!existsSync(absolutePath)) {
    return {
      exists: false,
      path: artifactPath,
      summary: null,
      parseError: null
    };
  }

  try {
    const payload = JSON.parse(readFileSync(absolutePath, "utf8"));
    const verification = payload.verification ?? {};

    return {
      exists: true,
      path: artifactPath,
      summary: {
        passed: verification.passed ?? null,
        ran: verification.ran ?? null,
        commandCount: Array.isArray(verification.commands) ? verification.commands.length : 0,
        failedCommandCount: verification.failedCommandCount ?? null,
        reason: verification.reason ?? null
      },
      parseError: null
    };
  } catch (error) {
    return {
      exists: true,
      path: artifactPath,
      summary: null,
      parseError: error instanceof Error ? error.message : String(error)
    };
  }
}

function readAttemptArtifacts({ rootDir, sliceId, config }) {
  const codexRunsDir = path.resolve(rootDir, config.promptDir);

  if (!existsSync(codexRunsDir)) {
    return [];
  }

  return readdirSync(codexRunsDir)
    .filter((filename) => filename.startsWith(`${sliceId}-attempt-`) && filename.endsWith(".json"))
    .map((filename) => readAttemptArtifact(rootDir, `${config.promptDir}/${filename}`))
    .sort((left, right) => left.attemptNumber - right.attemptNumber);
}

function readAttemptArtifact(rootDir, relativePath) {
  const fallbackAttemptNumber = Number(
    path.basename(relativePath).match(/-attempt-(\d{3})\.json$/)?.[1] ?? 0
  );

  try {
    const payload = JSON.parse(readFileSync(path.resolve(rootDir, relativePath), "utf8"));

    return {
      path: relativePath,
      attemptNumber: Number(payload.attemptNumber ?? fallbackAttemptNumber),
      status: payload.status ?? null,
      stage: payload.stage ?? null,
      reason: payload.reason ?? null,
      codexInvoked: payload.codexInvoked ?? null,
      resultFileCreated: payload.resultFileCreated ?? null,
      parseError: null
    };
  } catch (error) {
    return {
      path: relativePath,
      attemptNumber: fallbackAttemptNumber,
      status: null,
      stage: null,
      reason: null,
      codexInvoked: null,
      resultFileCreated: null,
      parseError: error instanceof Error ? error.message : String(error)
    };
  }
}

function determineRunnableStatus({ promptStatus, resultExists, attempts, latestAttempt }) {
  if (promptStatus === "canceled") {
    return "canceled";
  }

  if (resultExists) {
    return "completed";
  }

  if (attempts.length > 0 && latestAttempt?.status === "blocked") {
    return "blocked/no-result";
  }

  if (attempts.length > 0) {
    return "attempted/no-result";
  }

  if (promptStatus === "approved") {
    return "runnable";
  }

  return "pending";
}

function determineRecommendedNextAction({
  promptStatus,
  resultExists,
  resultStatus,
  verification,
  latestAttempt
}) {
  if (promptStatus === "canceled") {
    return "canceled_no_action";
  }

  if (!resultExists && latestAttempt?.status === "blocked") {
    return "blocked_needs_human_decision";
  }

  if (!resultExists && latestAttempt) {
    return "needs_retry_prompt";
  }

  if (!resultExists) {
    return "pending_execution";
  }

  if (resultStatus === "blocked") {
    return "blocked_needs_human_decision";
  }

  if (resultStatus === "failed") {
    return "needs_retry_prompt";
  }

  if (verification.exists && verification.summary?.passed === false) {
    return "needs_retry_prompt";
  }

  return "ready_for_human_review";
}

function buildHumanSummary({
  sliceId,
  promptStatus,
  resultExists,
  resultStatus,
  runnableStatus,
  recommendedNextAction,
  verification,
  latestAttempt
}) {
  if (promptStatus === "canceled") {
    return `${sliceId} is canceled and needs no further action.`;
  }

  if (!resultExists && latestAttempt?.status === "blocked") {
    return `${sliceId} has a blocked attempt and no paired result; human review is needed before retry.`;
  }

  if (!resultExists) {
    return `${sliceId} is ${runnableStatus} and is waiting for execution.`;
  }

  const verificationPhrase = verification.exists
    ? ` Verification passed: ${String(verification.summary?.passed)}.`
    : " No verification artifact was found.";

  return `${sliceId} has a ${resultStatus ?? "present"} result and is ${recommendedNextAction}.${verificationPhrase}`;
}

function extractSectionLines(content, heading) {
  const lines = String(content ?? "").split(/\r?\n/);
  const headingPattern = new RegExp(`^##\\s+${escapeRegExp(heading)}\\s*$`, "i");
  const section = [];
  let insideSection = false;

  for (const line of lines) {
    if (headingPattern.test(line.trim())) {
      insideSection = true;
      continue;
    }

    if (insideSection && /^##\s+/.test(line.trim())) {
      break;
    }

    if (insideSection) {
      const normalized = line.trim().replace(/^[-*]\s+/, "").trim();

      if (normalized && normalized !== "None.") {
        section.push(normalized);
      }
    }
  }

  return section;
}

function appendListSection(lines, label, values) {
  if (!Array.isArray(values) || values.length === 0) {
    return;
  }

  lines.push("", `## ${label}`, "");

  for (const value of values) {
    lines.push(`- ${value}`);
  }
}

function emptyResultSections() {
  return {
    filesChanged: [],
    commandsRun: [],
    knownIssuesRisks: []
  };
}

function parseCliArgs(args) {
  const parsed = {
    json: false,
    markdown: false,
    writeReviewSummary: false,
    sliceId: null,
    config: null
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === "--slice-id") {
      parsed.sliceId = args[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--json") {
      parsed.json = true;
      continue;
    }

    if (arg === "--markdown") {
      parsed.markdown = true;
      continue;
    }

    if (arg === "--write-review-summary") {
      parsed.writeReviewSummary = true;
      continue;
    }

    if (arg === "--config") {
      parsed.config = args[index + 1];
      index += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  if (!parsed.sliceId) {
    throw new Error("--slice-id is required");
  }

  return parsed;
}

function isPathInsideDirectory(filePath, directoryPath) {
  const relative = path.relative(directoryPath, filePath);

  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const currentFile = fileURLToPath(import.meta.url);

if (process.argv[1] && path.resolve(process.argv[1]) === currentFile) {
  const result = runReviewSummaryBuilderCli();

  process.stdout.write(result.stdout);
  process.stderr.write(result.stderr);
  process.exitCode = result.exitCode;
}
