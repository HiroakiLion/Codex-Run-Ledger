import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { initCodexRunLedger, renderInitJsonOutput } from "./init.mjs";

test("initializes config and prompt directory readme", () => {
  const rootDir = mkdtempSync(path.join(tmpdir(), "codex-run-ledger-init-"));
  const result = initCodexRunLedger({
    rootDir,
    targetRepo: "sample-repo"
  });

  assert.deepEqual(result.written, [
    "codex-run-ledger.config.json",
    "docs/codex-runs/README.md",
    "docs/codex-runs/REVIEW_PROTOCOL.md"
  ]);
  assert.equal(result.config.targetRepo, "sample-repo");

  const config = JSON.parse(
    readFileSync(path.join(rootDir, "codex-run-ledger.config.json"), "utf8")
  );
  assert.equal(config.targetRepo, "sample-repo");
  assert.deepEqual(config.defaultVerificationCommands, ["git diff --check"]);

  const readme = readFileSync(path.join(rootDir, "docs", "codex-runs", "README.md"), "utf8");
  assert.match(readme, /npx codex-run-ledger detect/);
  assert.match(readme, /REVIEW_PROTOCOL\.md/);

  const protocol = readFileSync(
    path.join(rootDir, "docs", "codex-runs", "REVIEW_PROTOCOL.md"),
    "utf8"
  );
  assert.match(protocol, /Codex Run Ledger Review Protocol/);
});

test("does not overwrite existing files without force", () => {
  const rootDir = mkdtempSync(path.join(tmpdir(), "codex-run-ledger-init-"));

  initCodexRunLedger({ rootDir, targetRepo: "first-repo" });
  const result = initCodexRunLedger({ rootDir, targetRepo: "second-repo" });
  const config = JSON.parse(
    readFileSync(path.join(rootDir, "codex-run-ledger.config.json"), "utf8")
  );

  assert.equal(config.targetRepo, "first-repo");
  assert.equal(result.written.length, 0);
  assert.equal(result.skipped.length, 3);
});

test("force overwrites generated files", () => {
  const rootDir = mkdtempSync(path.join(tmpdir(), "codex-run-ledger-init-"));

  initCodexRunLedger({ rootDir, targetRepo: "first-repo" });
  initCodexRunLedger({ rootDir, targetRepo: "second-repo", force: true });
  const config = JSON.parse(
    readFileSync(path.join(rootDir, "codex-run-ledger.config.json"), "utf8")
  );

  assert.equal(config.targetRepo, "second-repo");
});

test("json output is parseable", () => {
  const rootDir = mkdtempSync(path.join(tmpdir(), "codex-run-ledger-init-"));
  const result = initCodexRunLedger({ rootDir, targetRepo: "json-repo" });
  const payload = JSON.parse(renderInitJsonOutput(result));

  assert.equal(payload.config.targetRepo, "json-repo");
});
