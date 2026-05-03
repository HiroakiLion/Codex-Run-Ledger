import assert from "node:assert/strict";
import test from "node:test";
import {
  evaluateDocsOnlyScope,
  extractAllowedFilesAndAreas,
  parsePromptSections
} from "./prompt-scope-enforcer.mjs";

test("allows single paired result file under docs/codex-runs", () => {
  const result = evaluateDocsOnlyScope({
    content: promptWithAllowed("- docs/codex-runs/example-result.md")
  });

  assert.equal(result.docsOnly, true);
  assert.deepEqual(result.allowedPaths, ["docs/codex-runs/example-result.md"]);
  assert.deepEqual(result.violations, []);
});

test("allows explicit docs/codex-runs documentation paths", () => {
  const result = evaluateDocsOnlyScope({
    content: promptWithAllowed(
      "- docs/codex-runs/RUNNER_PLAN.md\n- docs/codex-runs/example-result.md"
    )
  });

  assert.equal(result.docsOnly, true);
  assert.deepEqual(result.allowedPaths, [
    "docs/codex-runs/RUNNER_PLAN.md",
    "docs/codex-runs/example-result.md"
  ]);
});

test("rejects apps paths", () => {
  const result = evaluateDocsOnlyScope({
    content: promptWithAllowed("- apps/mission-control/src/app.ts")
  });

  assert.equal(result.docsOnly, false);
  assert.match(result.violations[0], /forbidden/);
});

test("rejects packages paths", () => {
  const result = evaluateDocsOnlyScope({
    content: promptWithAllowed("- packages/shared/src/index.ts")
  });

  assert.equal(result.docsOnly, false);
  assert.match(result.violations[0], /forbidden/);
});

test("rejects scripts paths", () => {
  const result = evaluateDocsOnlyScope({
    content: promptWithAllowed("- scripts/codex-runs/local-executor.mjs")
  });

  assert.equal(result.docsOnly, false);
  assert.match(result.violations[0], /forbidden/);
});

test("rejects github workflow paths", () => {
  const result = evaluateDocsOnlyScope({
    content: promptWithAllowed("- .github/workflows/codex.yml")
  });

  assert.equal(result.docsOnly, false);
  assert.match(result.violations[0], /forbidden/);
});

test("rejects wildcard and root scopes", () => {
  for (const entry of [".", "**", "repo", "all files"]) {
    const result = evaluateDocsOnlyScope({
      content: promptWithAllowed(`- ${entry}`)
    });

    assert.equal(result.docsOnly, false);
    assert.ok(result.violations.length > 0);
  }
});

test("rejects missing Allowed Files / Areas section", () => {
  const result = evaluateDocsOnlyScope({
    content: "# Prompt\n\n## Objective\n\nDo a thing.\n"
  });

  assert.equal(result.docsOnly, false);
  assert.equal(result.missingAllowedSection, true);
  assert.match(result.violations[0], /Missing Allowed Files/);
});

test("rejects empty Allowed Files / Areas section", () => {
  const result = evaluateDocsOnlyScope({
    content: "# Prompt\n\n## Allowed Files / Areas\n\n## Verification Commands\n"
  });

  assert.equal(result.docsOnly, false);
  assert.equal(result.missingAllowedSection, false);
  assert.match(result.violations[0], /no explicit allowed paths/);
});

test("handles inline code path formatting with backticks", () => {
  const content = promptWithAllowed("- `docs/codex-runs/example-result.md`");

  assert.deepEqual(extractAllowedFilesAndAreas(content), [
    "docs/codex-runs/example-result.md"
  ]);

  const result = evaluateDocsOnlyScope({ content });

  assert.equal(result.docsOnly, true);
});

test("rejects vague docs entry conservatively", () => {
  for (const entry of ["docs", "documentation"]) {
    const result = evaluateDocsOnlyScope({
      content: promptWithAllowed(`- ${entry}`)
    });

    assert.equal(result.docsOnly, false);
    assert.ok(result.violations.length > 0);
  }
});

test("parses prompt sections by heading", () => {
  const sections = parsePromptSections(promptWithAllowed("- docs/codex-runs/result.md"));

  assert.equal(sections.Objective, "Test.");
  assert.match(sections["Allowed Files / Areas"], /docs\/codex-runs/);
});

function promptWithAllowed(allowedLines) {
  return `# Codex Slice Prompt: example\n\n` +
    `## Objective\n\n` +
    `Test.\n\n` +
    `## Out of Scope\n\n` +
    `- apps/\n\n` +
    `## Allowed Files / Areas\n\n` +
    `${allowedLines}\n\n` +
    `## Verification Commands\n\n` +
    `- git diff --check\n`;
}
