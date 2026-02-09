#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

function usage() {
  return [
    "Usage:",
    "  node tools/check_agents_policy.js",
    "",
    "Checks:",
    "  - Key directories have an AGENTS.md file with the expected Scope.",
    "  - Every immediate subfolder of src/ has its own AGENTS.md with the expected Scope.",
    "  - Every demos/demo*/ folder has its own AGENTS.md with the expected Scope.",
  ].join("\n");
}

function rel(root, abs) {
  return path.relative(root, abs).split(path.sep).join("/");
}

async function exists(absPath) {
  try {
    await fs.access(absPath);
    return true;
  } catch {
    return false;
  }
}

function extractScope(text) {
  const match = text.match(/^\s*Scope:\s*`([^`]+)`\s*(?:\.\s*)?$/m);
  return match?.[1]?.trim() ?? null;
}

async function checkAgentsFile(opts) {
  const { repoRoot, agentsFile, expectedScope, required } = opts;

  const present = await exists(agentsFile);
  if (!present) {
    if (!required) return null;
    return { file: rel(repoRoot, agentsFile), errors: ["missing AGENTS.md"] };
  }

  const text = await fs.readFile(agentsFile, "utf8");
  const trimmed = text.trim();
  if (!trimmed) return { file: rel(repoRoot, agentsFile), errors: ["AGENTS.md is empty"] };

  if (expectedScope) {
    const scope = extractScope(text);
    if (!scope) {
      return { file: rel(repoRoot, agentsFile), errors: [`missing Scope line (expected: \`Scope: \\\`${expectedScope}\\\`\`)`] };
    }
    if (scope !== expectedScope) {
      return { file: rel(repoRoot, agentsFile), errors: [`Scope mismatch (expected \`${expectedScope}\`, found \`${scope}\`)`] };
    }
  }

  return null;
}

async function listImmediateDirs(absRoot) {
  const out = [];
  const entries = await fs.readdir(absRoot, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (entry.name.startsWith(".")) continue;
    out.push(entry.name);
  }
  out.sort((a, b) => a.localeCompare(b));
  return out;
}

async function main() {
  const argv = process.argv.slice(2);
  if (argv.includes("--help") || argv.includes("-h")) {
    process.stdout.write(`${usage()}\n`);
    return;
  }
  if (argv.length) throw new Error(`Unexpected arguments. Run with --help for usage.`);

  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const failures = [];

  const fixedScopes = [
    { dir: "docs", scope: "docs/**" },
    { dir: "demos", scope: "demos/**" },
    { dir: "make", scope: "make/**" },
    { dir: "src", scope: "src/**" },
    { dir: "test", scope: "test/**" },
    { dir: "tools", scope: "tools/**" },
    { dir: "conformance", scope: "conformance/**" },
  ];

  for (const item of fixedScopes) {
    const res = await checkAgentsFile({
      repoRoot,
      agentsFile: path.join(repoRoot, item.dir, "AGENTS.md"),
      expectedScope: item.scope,
      required: true,
    });
    if (res) failures.push(res);
  }

  const srcRoot = path.join(repoRoot, "src");
  if (await exists(srcRoot)) {
    const dirs = await listImmediateDirs(srcRoot);
    for (const name of dirs) {
      const res = await checkAgentsFile({
        repoRoot,
        agentsFile: path.join(srcRoot, name, "AGENTS.md"),
        expectedScope: `src/${name}/**`,
        required: true,
      });
      if (res) failures.push(res);
    }
  }

  const demosRoot = path.join(repoRoot, "demos");
  if (await exists(demosRoot)) {
    const dirs = await listImmediateDirs(demosRoot);
    for (const name of dirs) {
      if (!/^demo\d+$/.test(name)) continue;
      const res = await checkAgentsFile({
        repoRoot,
        agentsFile: path.join(demosRoot, name, "AGENTS.md"),
        expectedScope: `demos/${name}/**`,
        required: true,
      });
      if (res) failures.push(res);
    }
  }

  if (failures.length) {
    process.stdout.write("AGENTS policy check failed:\n");
    for (const failure of failures) {
      for (const err of failure.errors) process.stdout.write(`- ${failure.file}: ${err}\n`);
    }
    process.exitCode = 1;
    return;
  }

  process.stdout.write("AGENTS policy OK.\n");
}

main().catch((err) => {
  process.stderr.write(`ERROR: ${err instanceof Error ? err.message : String(err)}\n`);
  process.stderr.write(`${usage()}\n`);
  process.exitCode = 1;
});
