import { readFileSync } from "node:fs";
import { isPathUnderAllowedRoots, loadLedgerConfig } from "./config.mjs";

const allowedSectionName = "Allowed Files / Areas";
const outOfScopeSectionName = "Out of Scope";
const broadEntries = new Set([
  ".",
  "./",
  "**",
  "*",
  "repo",
  "repository",
  "all",
  "all files",
  "all docs",
  "docs",
  "documentation"
]);

export function parsePromptSections(content) {
  const sections = new Map();
  let currentName = null;
  let currentLines = [];

  for (const line of String(content ?? "").split(/\r?\n/)) {
    const match = line.match(/^##\s+(.+?)\s*$/);

    if (match) {
      if (currentName) {
        sections.set(currentName, currentLines.join("\n").trim());
      }

      currentName = match[1].trim();
      currentLines = [];
      continue;
    }

    if (currentName) {
      currentLines.push(line);
    }
  }

  if (currentName) {
    sections.set(currentName, currentLines.join("\n").trim());
  }

  return Object.fromEntries(sections);
}

export function extractAllowedFilesAndAreas(content) {
  const sections = parsePromptSections(content);
  const allowedSection = sections[allowedSectionName];

  if (!allowedSection) {
    return [];
  }

  return allowedSection
    .split(/\r?\n/)
    .map((line) => extractBulletEntry(line))
    .filter(Boolean);
}

export function evaluateDocsOnlyScope(options = {}) {
  const config = loadLedgerConfig({
    rootDir: options.rootDir,
    configPath: options.configPath,
    config: options.config
  });
  const content = options.content ?? readPromptContent(options.promptFile);
  const sections = parsePromptSections(content);
  const missingAllowedSection = !Object.hasOwn(sections, allowedSectionName);
  const allowedPaths = [];
  const forbiddenPaths = [];
  const violations = [];
  const warnings = [];
  const allowedEntries = missingAllowedSection
    ? []
    : extractAllowedFilesAndAreas(content);

  if (missingAllowedSection) {
    violations.push("Missing Allowed Files / Areas section.");
  }

  if (!missingAllowedSection && allowedEntries.length === 0) {
    violations.push("Allowed Files / Areas section has no explicit allowed paths.");
  }

  for (const entry of allowedEntries) {
    const normalized = normalizeEntry(entry);
    const validation = validateAllowedEntry(normalized, config);

    if (validation.allowed) {
      allowedPaths.push(normalized);
    } else {
      forbiddenPaths.push(normalized);
      violations.push(validation.message);
    }
  }

  if (sections[outOfScopeSectionName]?.includes("apps/")) {
    warnings.push("Out of Scope mentions apps/, which remains forbidden for docs-only execution.");
  }

  return {
    scopePolicyVersion: 1,
    docsOnly: violations.length === 0 && allowedPaths.length > 0,
    allowedPaths,
    forbiddenPaths,
    missingAllowedSection,
    violations,
    warnings
  };
}

function readPromptContent(promptFile) {
  if (!promptFile) {
    return "";
  }

  return readFileSync(promptFile, "utf8");
}

function extractBulletEntry(line) {
  const match = String(line ?? "").match(/^\s*[-*]\s+(?:\[[ xX]\]\s+)?(.+?)\s*$/);

  if (!match) {
    return null;
  }

  const text = match[1].trim();
  const inlineCode = text.match(/`([^`]+)`/);
  const candidate = inlineCode ? inlineCode[1] : text.split(/\s+-\s+|\s+#\s+/)[0];

  return candidate
    .trim()
    .replace(/^["']|["']$/g, "")
    .replace(/[.,;:]$/g, "")
    .trim();
}

function normalizeEntry(entry) {
  return String(entry ?? "")
    .trim()
    .replace(/\\/g, "/")
    .replace(/^\.\/+/, "");
}

function validateAllowedEntry(entry, config) {
  const lower = entry.toLowerCase();

  if (!entry) {
    return {
      allowed: false,
      message: "Allowed Files / Areas entry is empty."
    };
  }

  if (broadEntries.has(lower) || lower.includes("all files")) {
    return {
      allowed: false,
      message: `Allowed Files / Areas entry is too broad for docs-only execution: ${entry}`
    };
  }

  if (entry.includes("*")) {
    return {
      allowed: false,
      message: `Wildcard scopes are not allowed for docs-only execution: ${entry}`
    };
  }

  if (entry.includes("..") || entry.startsWith("/") || /^[A-Za-z]:\//.test(entry)) {
    return {
      allowed: false,
      message: `Path is outside the allowed docs-only scope: ${entry}`
    };
  }

  if (
    lower.startsWith("apps/") ||
    lower === "apps" ||
    lower.startsWith("packages/") ||
    lower === "packages" ||
    lower.startsWith("scripts/") ||
    lower === "scripts" ||
    lower.startsWith(".github/workflows/") ||
    lower === ".github/workflows"
  ) {
    return {
      allowed: false,
      message: `Path is forbidden for docs-only execution: ${entry}`
    };
  }

  if (!isPathUnderAllowedRoots(entry, config.docsOnlyAllowedRoots)) {
    return {
      allowed: false,
      message: `Path must be under configured docs-only roots (${config.docsOnlyAllowedRoots.join(", ")}): ${entry}`
    };
  }

  return { allowed: true };
}
