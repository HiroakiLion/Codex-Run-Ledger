import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import {
  buildCodexInvocationCommand,
  validateCodexInvocationCommand
} from "./codex-command-builder.mjs";

const validPromptFile =
  "docs/codex-runs/2026-05-02-slice-001-test-run-prompt.md";
const repoRoot = path.resolve(".");

test("builds a safe command object for a valid prompt path", () => {
  const command = buildCodexInvocationCommand({
    promptFile: validPromptFile,
    repoRoot
  });

  assert.equal(command.executable, "codex");
  assert.equal(Array.isArray(command.args), true);
  assert.equal(command.args.includes("exec"), true);
  assert.equal(command.args.includes("--"), true);
  assert.equal(command.args[command.args.length - 1], "-");
  assert.deepEqual(command.args.slice(-2), ["--", "-"]);
  assert.equal(command.usesShell, false);
  assert.equal(command.willExecute, false);
  assert.equal(command.promptFile, validPromptFile);
  assert.equal(
    command.promptInput,
    "Read and follow the Codex prompt file at docs/codex-runs/2026-05-02-slice-001-test-run-prompt.md. Do not create any files outside the prompt scope. Write the paired result file required by the prompt."
  );
});

test("rejects prompt path outside docs/codex-runs", () => {
  assert.throws(
    () => buildCodexInvocationCommand({ promptFile: "README.md", repoRoot }),
    /docs\/codex-runs/
  );
});

test("rejects prompt path not ending in -prompt.md", () => {
  assert.throws(
    () =>
      buildCodexInvocationCommand({
        promptFile: "docs/codex-runs/not-a-result.md",
        repoRoot
      }),
    /-prompt\.md/
  );
});

test("rejects prompt path containing newline", () => {
  assert.throws(
    () =>
      buildCodexInvocationCommand({
        promptFile: "docs/codex-runs/bad\n-prompt.md",
        repoRoot
      }),
    /shell control/
  );
});

test("rejects prompt path containing shell control characters", () => {
  for (const char of [";", "&", "|", "`", "$", ">", "<"]) {
    assert.throws(
      () =>
        buildCodexInvocationCommand({
          promptFile: `docs/codex-runs/bad${char}-prompt.md`,
          repoRoot
        }),
      /shell control/
    );
  }
});

test("rejects missing cwd or repoRoot", () => {
  assert.throws(
    () => buildCodexInvocationCommand({ promptFile: validPromptFile }),
    /cwd or repoRoot/
  );
});

test("rejects command objects that use shell mode", () => {
  const command = buildCodexInvocationCommand({
    promptFile: validPromptFile,
    repoRoot
  });

  const validation = validateCodexInvocationCommand({
    ...command,
    usesShell: true
  });

  assert.equal(validation.valid, false);
  assert.ok(validation.errors.some((error) => error.includes("usesShell")));
});

test("rejects command objects that claim willExecute true", () => {
  const command = buildCodexInvocationCommand({
    promptFile: validPromptFile,
    repoRoot
  });

  const validation = validateCodexInvocationCommand({
    ...command,
    willExecute: true
  });

  assert.equal(validation.valid, false);
  assert.ok(validation.errors.some((error) => error.includes("willExecute")));
});

test("does not import or use process execution helpers", () => {
  const source = readFileSync(
    new URL("./codex-command-builder.mjs", import.meta.url),
    "utf8"
  );

  assert.equal(source.includes("child_process"), false);
  assert.equal(source.includes("exec("), false);
  assert.equal(source.includes("spawn("), false);
  assert.equal(source.includes("execFile("), false);
});

test("JSON serialization is stable and parseable", () => {
  const command = buildCodexInvocationCommand({
    promptFile: validPromptFile,
    repoRoot
  });
  const parsed = JSON.parse(JSON.stringify(command));

  assert.equal(parsed.executable, "codex");
  assert.deepEqual(parsed.args, command.args);
  assert.equal(parsed.promptInput, command.promptInput);
  assert.equal(parsed.usesShell, false);
  assert.equal(parsed.willExecute, false);
  assert.equal(parsed.promptFile, validPromptFile);
});
