import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import {
  buildCodexExecutionEnvironment,
  buildCodexExecutionAdapterResult,
  buildNodeAvailabilityPreflight,
  checkCodexCliAvailability,
  invokeCodexForDocsOnlyPrompt
} from "./codex-execution-adapter.mjs";

test("no flags blocks execution", () => {
  const result = buildCodexExecutionAdapterResult();

  assert.equal(result.adapterVersion, 1);
  assert.equal(result.executionRequested, false);
  assert.equal(result.executionAllowed, false);
  assert.equal(result.executionImplemented, true);
  assert.equal(result.wouldInvokeCodex, false);
  assert.match(result.reason, /execution flag not provided/);
});

test("docs-only without enable flag blocks execution", () => {
  const result = buildCodexExecutionAdapterResult({ docsOnly: true });

  assert.equal(result.docsOnly, true);
  assert.equal(result.executionRequested, false);
  assert.equal(result.executionAllowed, false);
  assert.match(result.reason, /execution flag not provided/);
});

test("enable flag without docs-only blocks execution", () => {
  const result = buildCodexExecutionAdapterResult({
    enableCodexExecution: true
  });

  assert.equal(result.executionRequested, true);
  assert.equal(result.docsOnly, false);
  assert.equal(result.executionAllowed, false);
  assert.match(result.reason, /docs-only flag required/);
});

test("both flags without run-codex-now allow evaluation but do not invoke", () => {
  const result = buildCodexExecutionAdapterResult({
    enableCodexExecution: true,
    docsOnly: true,
    readinessReport: cleanReadinessReport(),
    plan: plan(),
    commandPreview: commandPreview(),
    dirtyTreePolicy: cleanDirtyTreePolicy(),
    scopePolicy: docsOnlyScopePolicy(),
    cliCheck: availableCliCheck()
  });

  assert.equal(result.executionRequested, true);
  assert.equal(result.docsOnly, true);
  assert.equal(result.runCodexNow, false);
  assert.equal(result.executionImplemented, true);
  assert.equal(result.executionAllowed, true);
  assert.equal(result.wouldInvokeCodex, false);
  assert.match(result.reason, /evaluation only/);
});

test("all three flags with passing readiness and fake runner invokes fake runner", () => {
  let invoked = false;
  const evaluation = buildCodexExecutionAdapterResult({
    enableCodexExecution: true,
    docsOnly: true,
    runCodexNow: true,
    readinessReport: cleanReadinessReport({ executionEnabled: true }),
    plan: plan(),
    commandPreview: commandPreview(),
    dirtyTreePolicy: cleanDirtyTreePolicy(),
    scopePolicy: docsOnlyScopePolicy(),
    cliCheck: availableCliCheck()
  });

  assert.equal(evaluation.executionAllowed, true);
  assert.equal(evaluation.wouldInvokeCodex, true);

  const result = invokeCodexForDocsOnlyPrompt({
    commandPreview: commandPreview(),
    runner: ({ executable, args, cwd }) => {
      invoked = true;
      assert.equal(executable, "codex");
      assert.equal(Array.isArray(args), true);
      assert.equal(cwd, "repo");

      return {
        invoked: true,
        exitCode: 0,
        stdout: "fake stdout",
        stderr: ""
      };
    }
  });

  assert.equal(invoked, true);
  assert.equal(result.invoked, true);
  assert.equal(result.exitCode, 0);
  assert.equal(result.stdout, "fake stdout");
});

test("all three flags with dirty tree blocks and does not invoke", () => {
  const result = buildCodexExecutionAdapterResult({
    enableCodexExecution: true,
    docsOnly: true,
    runCodexNow: true,
    readinessReport: dirtyReadinessReport(),
    plan: plan(),
    commandPreview: commandPreview(),
    dirtyTreePolicy: {
      futureExecutionBlocked: true,
      reason: "dirty working tree blocks execution"
    },
    scopePolicy: docsOnlyScopePolicy(),
    cliCheck: availableCliCheck()
  });

  assert.equal(result.executionAllowed, false);
  assert.equal(result.wouldInvokeCodex, false);
  assert.ok(result.blockers.some((blocker) => blocker.includes("dirty working tree")));
});

test("all three flags with non-docs-only scope blocks and does not invoke", () => {
  const result = buildCodexExecutionAdapterResult({
    enableCodexExecution: true,
    docsOnly: true,
    runCodexNow: true,
    readinessReport: scopeViolationReadinessReport(),
    plan: plan(),
    commandPreview: commandPreview(),
    dirtyTreePolicy: cleanDirtyTreePolicy(),
    scopePolicy: {
      docsOnly: false
    },
    cliCheck: availableCliCheck()
  });

  assert.equal(result.executionAllowed, false);
  assert.equal(result.wouldInvokeCodex, false);
  assert.ok(result.blockers.some((blocker) => blocker.includes("docs-only scope")));
});

test("all three flags with missing selected prompt blocks and does not invoke", () => {
  const result = buildCodexExecutionAdapterResult({
    enableCodexExecution: true,
    docsOnly: true,
    runCodexNow: true,
    readinessReport: cleanReadinessReport({ executionEnabled: true }),
    commandPreview: commandPreview(),
    dirtyTreePolicy: cleanDirtyTreePolicy(),
    scopePolicy: docsOnlyScopePolicy(),
    cliCheck: availableCliCheck()
  });

  assert.equal(result.executionAllowed, false);
  assert.equal(result.wouldInvokeCodex, false);
  assert.ok(result.blockers.some((blocker) => blocker.includes("selected prompt missing")));
});

test("invocation function rejects shell mode", () => {
  assert.throws(
    () =>
      invokeCodexForDocsOnlyPrompt({
        commandPreview: {
          ...commandPreview(),
          usesShell: true
        },
        runner: () => {
          throw new Error("runner should not be called");
        }
      }),
    /usesShell must be false/
  );
});

test("invocation function rejects executable other than codex", () => {
  assert.throws(
    () =>
      invokeCodexForDocsOnlyPrompt({
        commandPreview: {
          ...commandPreview(),
          executable: "node"
        },
        runner: () => {
          throw new Error("runner should not be called");
        }
      }),
    /executable must be exactly codex/
  );
});

test("invocation function uses injected fake runner in tests and never calls real Codex", () => {
  let invoked = false;

  const result = invokeCodexForDocsOnlyPrompt({
    commandPreview: commandPreview(),
    runner: () => {
      invoked = true;

      return {
        invoked: true,
        exitCode: 0,
        stdout: "",
        stderr: ""
      };
    }
  });

  assert.equal(invoked, true);
  assert.equal(result.invoked, true);
});

test("CLI available with fake runner passes", () => {
  const result = checkCodexCliAvailability({
    runner: ({ executable, args }) => {
      assert.equal(executable, "codex");
      assert.deepEqual(args, ["--version"]);

      return {
        exitCode: 0,
        stdout: "codex 1.2.3\n",
        stderr: ""
      };
    }
  });

  assert.equal(result.cliCheckVersion, 1);
  assert.equal(result.available, true);
  assert.deepEqual(result.command, ["codex", "--version"]);
  assert.match(result.stdoutPreview, /codex 1\.2\.3/);
});

test("CLI missing with fake runner reports unavailable", () => {
  const result = checkCodexCliAvailability({
    runner: () => ({
      exitCode: 1,
      stdout: "",
      stderr: "",
      errorMessage: "spawn codex ENOENT"
    })
  });

  assert.equal(result.available, false);
  assert.ok(result.errors.some((error) => error.includes("ENOENT")));
});

test("CLI check does not call codex exec", () => {
  const result = checkCodexCliAvailability({
    runner: ({ args }) => {
      assert.deepEqual(args, ["--version"]);
      assert.equal(args.includes("exec"), false);

      return {
        exitCode: 0,
        stdout: "codex 1.2.3",
        stderr: ""
      };
    }
  });

  assert.equal(result.available, true);
});

test("adapter blocks execution if CLI unavailable", () => {
  const result = buildCodexExecutionAdapterResult({
    enableCodexExecution: true,
    docsOnly: true,
    runCodexNow: true,
    readinessReport: cleanReadinessReport({ executionEnabled: true }),
    plan: plan(),
    commandPreview: commandPreview(),
    dirtyTreePolicy: cleanDirtyTreePolicy(),
    scopePolicy: docsOnlyScopePolicy(),
    cliCheck: unavailableCliCheck()
  });

  assert.equal(result.executionAllowed, false);
  assert.equal(result.wouldInvokeCodex, false);
  assert.ok(result.blockers.some((blocker) => blocker.includes("CLI")));
});

test("adapter can evaluate allowed only when CLI is available", () => {
  const result = buildCodexExecutionAdapterResult({
    enableCodexExecution: true,
    docsOnly: true,
    readinessReport: cleanReadinessReport(),
    plan: plan(),
    commandPreview: commandPreview(),
    dirtyTreePolicy: cleanDirtyTreePolicy(),
    scopePolicy: docsOnlyScopePolicy(),
    cliCheck: availableCliCheck()
  });

  assert.equal(result.executionAllowed, true);
  assert.equal(result.wouldInvokeCodex, false);
  assert.match(result.reason, /evaluation only/);
});

test("Node executable path is detected from process exec path", () => {
  const execPath = fakeNodeExecPath();
  const result = buildNodeAvailabilityPreflight({
    env: {
      PATH: path.join(path.sep, "system", "bin")
    },
    execPath,
    version: "v22.0.0"
  });

  assert.equal(result.nodePreflightVersion, 1);
  assert.equal(result.available, true);
  assert.equal(result.processExecPath, execPath);
  assert.equal(result.processVersion, "v22.0.0");
  assert.equal(result.explicitNodeBinaryPathAvailable, true);
  assert.equal(result.nodeBinaryDirectory, path.dirname(execPath));
});

test("Node binary directory is prepended to PATH when missing", () => {
  const execPath = fakeNodeExecPath();
  const originalPath = [
    path.join(path.sep, "system", "bin"),
    path.join(path.sep, "git", "bin")
  ].join(path.delimiter);
  const result = buildCodexExecutionEnvironment({
    env: {
      PATH: originalPath
    },
    nodeExecPath: execPath
  });

  assert.equal(result.pathWasAugmented, true);
  assert.equal(
    result.env.PATH.startsWith(`${path.dirname(execPath)}${path.delimiter}`),
    true
  );
  assert.equal(result.augmentedPathPreview[0], path.dirname(execPath));
});

test("controlled environment preview redacts secret values", () => {
  const result = buildCodexExecutionEnvironment({
    env: {
      PATH: path.join(path.sep, "system", "bin"),
      OPENAI_API_KEY: "super-secret-value",
      NORMAL_SETTING: "visible-value"
    },
    nodeExecPath: fakeNodeExecPath()
  });
  const serializedPreview = JSON.stringify(result.envPreview);

  assert.equal(serializedPreview.includes("super-secret-value"), false);
  assert.equal(serializedPreview.includes("[redacted]"), true);
  assert.equal(serializedPreview.includes("visible-value"), false);
  assert.equal(serializedPreview.includes("[present]"), true);
});

test("Codex invocation passes controlled env to injected fake runner", () => {
  const execPath = fakeNodeExecPath();
  let observedEnv = null;

  const result = invokeCodexForDocsOnlyPrompt({
    commandPreview: commandPreview(),
    nodePreflight: buildNodeAvailabilityPreflight({
      env: {
        PATH: path.join(path.sep, "system", "bin"),
        OPENAI_API_KEY: "secret"
      },
      execPath,
      version: "v22.0.0"
    }),
    env: {
      PATH: path.join(path.sep, "system", "bin"),
      OPENAI_API_KEY: "secret"
    },
    runner: ({ env, executable }) => {
      observedEnv = env;
      assert.equal(executable, "codex");

      return {
        invoked: true,
        exitCode: 0,
        stdout: "ok",
        stderr: ""
      };
    }
  });

  assert.equal(result.invoked, true);
  assert.ok(observedEnv);
  assert.equal(observedEnv.OPENAI_API_KEY, "secret");
  assert.equal(
    observedEnv.PATH.startsWith(`${path.dirname(execPath)}${path.delimiter}`),
    true
  );
});

test("adapter blocks execution if Node preflight fails", () => {
  const result = buildCodexExecutionAdapterResult({
    enableCodexExecution: true,
    docsOnly: true,
    runCodexNow: true,
    readinessReport: cleanReadinessReport({ executionEnabled: true }),
    plan: plan(),
    commandPreview: commandPreview(),
    dirtyTreePolicy: cleanDirtyTreePolicy(),
    scopePolicy: docsOnlyScopePolicy(),
    cliCheck: availableCliCheck(),
    nodePreflight: {
      available: false,
      errors: ["process.execPath is unavailable"]
    }
  });

  assert.equal(result.executionAllowed, false);
  assert.equal(result.wouldInvokeCodex, false);
  assert.ok(result.blockers.some((blocker) => blocker.includes("Node availability")));
});

test("adapter source does not use shell true or shell-interpolated exec", () => {
  const source = readFileSync(
    new URL("./codex-execution-adapter.mjs", import.meta.url),
    "utf8"
  );

  assert.equal(source.includes("shell: true"), false);
  assert.equal(source.includes("exec("), false);
  assert.equal(source.includes("execSync("), false);
  assert.equal(source.includes("execFile("), false);
});

test("JSON serialization is stable and parseable", () => {
  const result = buildCodexExecutionAdapterResult({
    enableCodexExecution: true,
    docsOnly: true,
    readinessReport: cleanReadinessReport(),
    plan: plan(),
    commandPreview: commandPreview(),
    dirtyTreePolicy: cleanDirtyTreePolicy(),
    scopePolicy: docsOnlyScopePolicy(),
    cliCheck: availableCliCheck()
  });
  const parsed = JSON.parse(JSON.stringify(result));

  assert.equal(parsed.adapterVersion, 1);
  assert.equal(parsed.executionRequested, true);
  assert.equal(parsed.executionAllowed, true);
  assert.equal(parsed.wouldInvokeCodex, false);
});

function cleanReadinessReport(options = {}) {
  return {
    checks: [
      {
        name: "detector validation",
        passed: true,
        severity: "blocker",
        details: "0 validation errors"
      },
      {
        name: "single runnable prompt",
        passed: true,
        severity: "blocker",
        details: "1 runnable approved prompts"
      },
      {
        name: "working tree clean",
        passed: true,
        severity: "blocker",
        details: "working tree clean"
      },
      {
        name: "docs-only scope",
        passed: true,
        severity: "blocker",
        details: "1 allowed docs/codex-runs paths"
      },
      {
        name: "real Codex execution implemented",
        passed: Boolean(options.executionEnabled),
        severity: "blocker",
        details: options.executionEnabled
          ? "real Codex execution adapter is implemented and enabled for this run"
          : "real Codex execution is not enabled for this run"
      }
    ]
  };
}

function dirtyReadinessReport() {
  return {
    checks: [
      ...cleanReadinessReport().checks,
      {
        name: "working tree clean",
        passed: false,
        severity: "blocker",
        details: "1 dirty paths"
      }
    ]
  };
}

function scopeViolationReadinessReport() {
  return {
    checks: [
      ...cleanReadinessReport().checks,
      {
        name: "docs-only scope",
        passed: false,
        severity: "blocker",
        details: "1 scope violations"
      }
    ]
  };
}

function plan() {
  return {
    promptFile: "docs/codex-runs/example-prompt.md",
    resultFile: "docs/codex-runs/example-result.md"
  };
}

function commandPreview() {
  return {
    executable: "codex",
    args: ["exec", "--full-auto", "--", "Read prompt"],
    cwd: "repo",
    promptFile: "docs/codex-runs/example-prompt.md",
    usesShell: false,
    willExecute: false
  };
}

function cleanDirtyTreePolicy() {
  return {
    futureExecutionBlocked: false
  };
}

function docsOnlyScopePolicy() {
  return {
    docsOnly: true
  };
}

function availableCliCheck() {
  return {
    available: true
  };
}

function unavailableCliCheck() {
  return {
    available: false,
    errors: ["missing"]
  };
}

function fakeNodeExecPath() {
  return path.join(path.sep, "tools", "node", process.platform === "win32" ? "node.exe" : "node");
}
