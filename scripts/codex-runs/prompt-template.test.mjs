import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import {
  buildPromptTemplate,
  runPromptTemplateCli,
  writePromptTemplate
} from "./prompt-template.mjs";

test("writes a draft prompt template under configured promptDir", () => {
  const rootDir = createFixture();
  const sliceId = "2026-05-04-slice-003-template-command";
  const result = writePromptTemplate({ rootDir, sliceId });
  const promptPath = path.join(rootDir, "ledger", `${sliceId}-prompt.md`);
  const content = readFileSync(promptPath, "utf8");

  assert.equal(result.promptFile, `ledger/${sliceId}-prompt.md`);
  assert.equal(result.resultFile, `ledger/${sliceId}-result.md`);
  assert.equal(result.status, "draft");
  assert.equal(existsSync(promptPath), true);
  assert.match(content, /target_repo: HiroakiLion\/Codex-Run-Ledger/);
  assert.match(content, new RegExp(`target_branch: codex/${sliceId}`));
  assert.match(content, /approved_at: null/);
  assert.match(content, /## Result File Instructions/);
  assert.match(content, /Review protocol: `ledger\/REVIEW_PROTOCOL\.md`/);
  assert.match(content, /## Final Response Requirement/);
  assert.match(
    content,
    /Review handoff: run codex-run-ledger review --slice-id 2026-05-04-slice-003-template-command --markdown/
  );
  assert.match(content, /then run protocol checks using ledger\/REVIEW_PROTOCOL\.md/);
});

test("stdout mode builds content without writing a prompt file", () => {
  const rootDir = createFixture();
  const sliceId = "2026-05-04-slice-004-stdout-template";
  const result = runPromptTemplateCli(["--slice-id", sliceId, "--stdout"], { rootDir });

  assert.equal(result.exitCode, 0);
  assert.match(result.stdout, new RegExp(`slice_id: ${sliceId}`));
  assert.equal(existsSync(path.join(rootDir, "ledger", `${sliceId}-prompt.md`)), false);
});

test("approved prompt requires approved_at", () => {
  const rootDir = createFixture();

  assert.throws(
    () =>
      buildPromptTemplate({
        rootDir,
        sliceId: "2026-05-04-slice-005-approved-template",
        status: "approved"
      }),
    /--approved-at is required/
  );
});

test("approved prompt includes approval timestamp", () => {
  const rootDir = createFixture();
  const template = buildPromptTemplate({
    rootDir,
    sliceId: "2026-05-04-slice-006-approved-template",
    status: "approved",
    approvedAt: "2026-05-04T10:00:00+09:00"
  });

  assert.match(template.content, /status: approved/);
  assert.match(template.content, /approved_at: 2026-05-04T10:00:00\+09:00/);
});

test("refuses to overwrite an existing prompt file", () => {
  const rootDir = createFixture();
  const sliceId = "2026-05-04-slice-007-no-overwrite";

  writePromptTemplate({ rootDir, sliceId });

  assert.throws(() => writePromptTemplate({ rootDir, sliceId }), /already exists/);
});

test("rejects unsafe slice ids", () => {
  const rootDir = createFixture();

  assert.throws(
    () => buildPromptTemplate({ rootDir, sliceId: "2026-05-04-slice-008-bad;id" }),
    /Invalid slice id/
  );
});

test("json output is parseable", () => {
  const rootDir = createFixture();
  const sliceId = "2026-05-04-slice-009-json-template";
  const result = runPromptTemplateCli(["--slice-id", sliceId, "--json"], { rootDir });
  const payload = JSON.parse(result.stdout);

  assert.equal(result.exitCode, 0);
  assert.equal(payload.promptFile, `ledger/${sliceId}-prompt.md`);
  assert.equal(payload.status, "draft");
});

function createFixture() {
  const rootDir = mkdtempSync(path.join(tmpdir(), "codex-run-ledger-prompt-template-"));

  writeFileSync(
    path.join(rootDir, "codex-run-ledger.config.json"),
    `${JSON.stringify(
      {
        protocolVersion: 1,
        promptDir: "ledger",
        targetRepo: "HiroakiLion/Codex-Run-Ledger",
        stableTargetBranches: ["workbench"],
        sliceBranchPrefix: "codex/",
        forbiddenTargetBranches: ["main", "master"],
        docsOnlyAllowedRoots: ["docs/codex-runs/"]
      },
      null,
      2
    )}\n`
  );

  return rootDir;
}
