import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  parsePorcelainBranchStatus,
  validateCurrentBranchAgainstTarget
} from "./git-status-inspector.mjs";

test("parses clean porcelain status", () => {
  const parsed = parsePorcelainBranchStatus("## workbench...origin/workbench\n");

  assert.equal(parsed.currentBranch, "workbench");
  assert.equal(parsed.isDirty, false);
  assert.deepEqual(parsed.dirtyPaths, []);
});

test("parses dirty porcelain status", () => {
  const parsed = parsePorcelainBranchStatus(
    "## workbench...origin/workbench\n M docs/codex-runs/README.md\n?? temp.txt\n"
  );

  assert.equal(parsed.currentBranch, "workbench");
  assert.equal(parsed.isDirty, true);
  assert.deepEqual(parsed.dirtyPaths, [
    "docs/codex-runs/README.md",
    "temp.txt"
  ]);
});

test("allows workbench branch", () => {
  const result = validateCurrentBranchAgainstTarget({
    currentBranch: "workbench",
    targetBranch: "workbench",
    sliceId: "2026-05-02-slice-001-test-run"
  });

  assert.equal(result.branchAllowed, true);
  assert.equal(result.branchMatchesTarget, true);
  assert.equal(result.errors.length, 0);
});

test("allows codex slice branch when it matches target branch", () => {
  const sliceId = "2026-05-02-slice-001-test-run";
  const result = validateCurrentBranchAgainstTarget({
    currentBranch: `codex/${sliceId}`,
    targetBranch: `codex/${sliceId}`,
    sliceId
  });

  assert.equal(result.branchAllowed, true);
  assert.equal(result.branchMatchesTarget, true);
  assert.equal(result.errors.length, 0);
});

test("rejects main", () => {
  const result = validateCurrentBranchAgainstTarget({
    currentBranch: "main",
    targetBranch: "main",
    sliceId: "2026-05-02-slice-001-test-run"
  });

  assert.equal(result.branchAllowed, false);
  assert.ok(result.errors.some((error) => error.includes("must not be main") || error.includes("must not be master")));
});

test("rejects master", () => {
  const result = validateCurrentBranchAgainstTarget({
    currentBranch: "master",
    targetBranch: "master",
    sliceId: "2026-05-02-slice-001-test-run"
  });

  assert.equal(result.branchAllowed, false);
  assert.ok(result.errors.some((error) => error.includes("must not be main") || error.includes("must not be master")));
});

test("rejects branch with shell control characters", () => {
  for (const character of [";", "&", "|", "`", "$", ">", "<"]) {
    const result = validateCurrentBranchAgainstTarget({
      currentBranch: `workbench${character}`,
      targetBranch: "workbench",
      sliceId: "2026-05-02-slice-001-test-run"
    });

    assert.equal(result.branchAllowed, false);
    assert.ok(
      result.errors.some((error) =>
        error.includes("shell control characters")
      )
    );
  }
});

test("rejects branch with newline", () => {
  const result = validateCurrentBranchAgainstTarget({
    currentBranch: "workbench\nnext",
    targetBranch: "workbench",
    sliceId: "2026-05-02-slice-001-test-run"
  });

  assert.equal(result.branchAllowed, false);
  assert.ok(
    result.errors.some((error) => error.includes("shell control characters"))
  );
});

test("detects target branch mismatch", () => {
  const result = validateCurrentBranchAgainstTarget({
    currentBranch: "workbench",
    targetBranch: "codex/2026-05-02-slice-001-test-run",
    sliceId: "2026-05-02-slice-001-test-run"
  });

  assert.equal(result.branchAllowed, true);
  assert.equal(result.branchMatchesTarget, false);
  assert.ok(result.warnings.some((warning) => warning.includes("does not match")));
});

test("source uses read-only spawn-style Git commands", () => {
  const source = readFileSync(
    new URL("./git-status-inspector.mjs", import.meta.url),
    "utf8"
  );

  assert.equal(source.includes("shell: true"), false);
  assert.equal(source.includes("exec("), false);
  assert.equal(source.includes("execSync("), false);
  assert.doesNotMatch(source, /["']checkout["']/);
  assert.doesNotMatch(source, /["']commit["']/);
  assert.doesNotMatch(source, /["']push["']/);
});
