import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  inspectGitStatus,
  parsePorcelainBranchStatus,
  validateCurrentBranchAgainstTarget
} from "./git-status-inspector.mjs";
function makeRunGitMock({ branchError = false, statusOutput = "" }) {
  return (args) => {
    const [command, ...flags] = args;

    if (command === "branch" && flags[0] === "--show-current") {
      if (branchError) {
        return {
          ok: false,
          message: "Git status inspection failed for git branch --show-current: forced failure",
          stdout: ""
        };
      }

      return {
        ok: true,
        message: null,
        stdout: "workbench\n"
      };
    }

    if (command === "status" && flags[0] === "--porcelain=v1" && flags[1] === "--branch") {
      return {
        ok: statusOutput.length > 0,
        message: statusOutput.length > 0
          ? null
          : "Git status inspection failed for git status --porcelain=v1 --branch: forced failure",
        stdout: statusOutput
      };
    }

    return {
      ok: false,
      message: `Git status inspection failed for git ${args.join(" ")}: unexpected invocation`,
      stdout: ""
    };
  };
}

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

test("parses porcelain status even with legacy On branch format", () => {
  const parsed = parsePorcelainBranchStatus("## On branch workbench\n M docs/codex-runs/README.md\n");

  assert.equal(parsed.currentBranch, "workbench");
  assert.equal(parsed.isDirty, true);
  assert.deepEqual(parsed.dirtyPaths, ["docs/codex-runs/README.md"]);
});

test("inspectGitStatus prefers branch --show-current and falls back to porcelain branch parsing", () => {
  const result = inspectGitStatus({
    cwd: process.cwd(),
    runGit: makeRunGitMock({
      branchError: true,
      statusOutput: [
        "## workbench...origin/workbench",
        " M docs/codex-runs/README.md",
        "?? temp.txt"
      ].join("\r\n")
    })
  });

  assert.equal(result.currentBranch, "workbench");
  assert.equal(result.errors.length, 0);
  assert.equal(result.isDirty, true);
  assert.deepEqual(result.dirtyPaths, [
    "docs/codex-runs/README.md",
    "temp.txt"
  ]);
  assert.ok(
    result.warnings.some((warning) =>
      warning.includes("fallback used: `git status --porcelain=v1 --branch`")
    )
  );
});

test("inspectGitStatus keeps clean failure behavior when both branch and status commands fail", () => {
  const result = inspectGitStatus({
    cwd: process.cwd(),
    runGit: makeRunGitMock({
      branchError: true,
      statusOutput: ""
    })
  });

  assert.equal(result.currentBranch, null);
  assert.equal(result.errors.length, 0);
  assert.equal(result.warnings.length >= 2, true);
  assert.ok(
    result.warnings.some((warning) =>
      warning.includes("both `git branch --show-current` and `git status --porcelain=v1 --branch` failed")
    )
  );
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
