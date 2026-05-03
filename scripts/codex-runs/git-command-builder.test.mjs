import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import {
  buildGitCommandPreview,
  buildGitExecutionPlan,
  validateGitCommandPreview
} from "./git-command-builder.mjs";

const sliceId = "2026-05-02-slice-006-example";
const targetBranch = `codex/${sliceId}`;
const promptFile = `docs/codex-runs/${sliceId}-prompt.md`;
const resultFile = `docs/codex-runs/${sliceId}-result.md`;
const repoRoot = path.resolve(".");

function buildValidPlan(options = {}) {
  return buildGitExecutionPlan({
    sliceId,
    targetBranch,
    repoRoot,
    promptFile,
    resultFile,
    ...options
  });
}

test("builds safe Git plan for valid slice input", () => {
  const plan = buildValidPlan();

  assert.equal(plan.gitPlanVersion, 1);
  assert.equal(plan.targetBranch, targetBranch);
  assert.equal(plan.usesShell, false);
  assert.equal(plan.willExecute, false);
  assert.equal(Array.isArray(plan.commands), true);
  assert.ok(plan.commands.length > 0);

  for (const command of plan.commands) {
    assert.equal(command.executable, "git");
    assert.equal(Array.isArray(command.args), true);
    assert.equal(command.usesShell, false);
    assert.equal(command.willExecute, false);
  }
});

test("builds safe Git plan for workbench target branch", () => {
  const plan = buildValidPlan({ targetBranch: "workbench" });
  const checkout = plan.commands.find(
    (command) => command.name === "checkoutTargetBranch"
  );

  assert.equal(plan.targetBranch, "workbench");
  assert.deepEqual(checkout.args, ["checkout", "workbench"]);
  assert.equal(plan.usesShell, false);
  assert.equal(plan.willExecute, false);
  assert.equal(
    plan.commands.every(
      (command) =>
        command.executable === "git" &&
        command.usesShell === false &&
        command.willExecute === false
    ),
    true
  );
});

test("buildGitCommandPreview aliases the same safe plan shape", () => {
  const plan = buildGitCommandPreview({
    sliceId,
    targetBranch,
    repoRoot,
    promptFile,
    resultFile
  });

  assert.equal(plan.gitPlanVersion, 1);
  assert.equal(plan.commands.every((command) => command.executable === "git"), true);
});

test("includes no push command by default", () => {
  const plan = buildValidPlan();

  assert.equal(plan.commands.some((command) => command.name === "push"), false);
});

test("includes push preview only when includePush true", () => {
  const plan = buildValidPlan({ includePush: true });
  const push = plan.commands.find((command) => command.name === "push");

  assert.ok(push);
  assert.deepEqual(push.args, ["push", "origin", targetBranch]);
  assert.equal(push.willExecute, false);
});

test("rejects targetBranch main", () => {
  assert.throws(() => buildValidPlan({ targetBranch: "main" }), /main/);
});

test("rejects targetBranch master", () => {
  assert.throws(() => buildValidPlan({ targetBranch: "master" }), /master/);
});

test("rejects targetBranch not allowed by policy", () => {
  assert.throws(
    () => buildValidPlan({ targetBranch: `feature/${sliceId}` }),
    /workbench or codex/
  );
});

test("rejects targetBranch not equal to codex/<sliceId>", () => {
  assert.throws(
    () => buildValidPlan({ targetBranch: "codex/2026-05-02-slice-999-other" }),
    /workbench or codex\/2026-05-02-slice-006-example/
  );
});

test("rejects targetBranch containing newline", () => {
  assert.throws(
    () => buildValidPlan({ targetBranch: `codex/${sliceId}\n` }),
    /shell control/
  );
});

test("rejects targetBranch containing shell control characters", () => {
  for (const char of [";", "&", "|", "`", "$", ">", "<"]) {
    assert.throws(
      () => buildValidPlan({ targetBranch: `codex/${sliceId}${char}` }),
      /shell control/
    );
  }
});

test("rejects promptFile outside docs/codex-runs", () => {
  assert.throws(
    () => buildValidPlan({ promptFile: "README.md" }),
    /docs\/codex-runs/
  );
});

test("rejects resultFile outside docs/codex-runs", () => {
  assert.throws(
    () => buildValidPlan({ resultFile: "README.md" }),
    /docs\/codex-runs/
  );
});

test("rejects promptFile not ending with -prompt.md", () => {
  assert.throws(
    () => buildValidPlan({ promptFile: `docs/codex-runs/${sliceId}.md` }),
    /-prompt\.md/
  );
});

test("rejects resultFile not ending with -result.md", () => {
  assert.throws(
    () => buildValidPlan({ resultFile: `docs/codex-runs/${sliceId}.md` }),
    /-result\.md/
  );
});

test("rejects missing cwd or repoRoot", () => {
  assert.throws(
    () =>
      buildGitExecutionPlan({
        sliceId,
        targetBranch,
        promptFile,
        resultFile
      }),
    /cwd or repoRoot/
  );
});

test("rejects command objects that use shell mode", () => {
  const plan = buildValidPlan();
  const validation = validateGitCommandPreview({
    ...plan,
    usesShell: true
  });

  assert.equal(validation.valid, false);
  assert.ok(validation.errors.some((error) => error.includes("usesShell")));
});

test("rejects command objects that claim willExecute true", () => {
  const plan = buildValidPlan();
  const validation = validateGitCommandPreview({
    ...plan,
    willExecute: true
  });

  assert.equal(validation.valid, false);
  assert.ok(validation.errors.some((error) => error.includes("willExecute")));
});

test("source file does not import or use process execution helpers", () => {
  const source = readFileSync(
    new URL("./git-command-builder.mjs", import.meta.url),
    "utf8"
  );

  assert.equal(source.includes("child_process"), false);
  assert.equal(source.includes("exec("), false);
  assert.equal(source.includes("spawn("), false);
  assert.equal(source.includes("execFile("), false);
});

test("JSON serialization is stable and parseable", () => {
  const plan = buildValidPlan();
  const parsed = JSON.parse(JSON.stringify(plan));

  assert.equal(parsed.gitPlanVersion, 1);
  assert.equal(parsed.sliceId, sliceId);
  assert.equal(parsed.targetBranch, targetBranch);
  assert.equal(parsed.usesShell, false);
  assert.equal(parsed.willExecute, false);
  assert.equal(parsed.commands.every((command) => command.executable === "git"), true);
});
