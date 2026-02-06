#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_SOFT_LIMIT = 2000;
const DEFAULT_SCAN_DIR = ".";
const DEFAULT_MAX_HEADER_WORDS_PER_LINE = 20;

function usage() {
  return [
    "Usage:",
    "  node tools/check_ts_policy.js [--dir <path>] [--soft-limit <words>] [--strict-word-limit]",
    "",
    "Checks:",
    "  - Every .ts file has a concise top-of-file header with Purpose + Intent lines.",
    "  - Reports files whose total word count exceeds a soft limit.",
  ].join("\n");
}

function parsePositiveInt(raw, flagName) {
  const n = Number(raw);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n <= 0) {
    throw new Error(`${flagName} expects a positive integer`);
  }
  return n;
}

function parseArgs(argv) {
  let scanDir = DEFAULT_SCAN_DIR;
  let softLimit = DEFAULT_SOFT_LIMIT;
  let strictWordLimit = false;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") {
      return { help: true, scanDir, softLimit, strictWordLimit };
    }
    if (arg === "--dir") {
      const raw = argv[i + 1];
      if (!raw) throw new Error("--dir expects a path");
      scanDir = raw;
      i++;
      continue;
    }
    if (arg === "--soft-limit") {
      const raw = argv[i + 1];
      if (!raw) throw new Error("--soft-limit expects a positive integer");
      softLimit = parsePositiveInt(raw, "--soft-limit");
      i++;
      continue;
    }
    if (arg === "--strict-word-limit") {
      strictWordLimit = true;
      continue;
    }
    if (arg && arg.startsWith("-")) {
      throw new Error(`Unknown flag: ${arg}`);
    }
    throw new Error(`Unexpected argument: ${arg}`);
  }

  return { help: false, scanDir, softLimit, strictWordLimit };
}

function countWords(text) {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).filter(Boolean).length;
}

function topHeaderInfo(text) {
  const withoutBom = text.replace(/^\uFEFF/, "");
  const block = withoutBom.match(/^\/\*\*([\s\S]*?)\*\/\s*/);
  if (!block) {
    return { ok: false, errors: ["missing top-of-file header block"] };
  }

  const headerBody = block[1] ?? "";
  const purposeMatch = headerBody.match(/^\s*\*\s*Purpose:\s*(.+)\s*$/m);
  const intentMatch = headerBody.match(/^\s*\*\s*Intent:\s*(.+)\s*$/m);
  const errors = [];

  const purpose = purposeMatch?.[1]?.trim() ?? "";
  const intent = intentMatch?.[1]?.trim() ?? "";

  if (!purpose) errors.push("header missing 'Purpose:' line");
  if (!intent) errors.push("header missing 'Intent:' line");

  if (purpose && countWords(purpose) > DEFAULT_MAX_HEADER_WORDS_PER_LINE) {
    errors.push(`Purpose line is too long (>${DEFAULT_MAX_HEADER_WORDS_PER_LINE} words)`);
  }
  if (intent && countWords(intent) > DEFAULT_MAX_HEADER_WORDS_PER_LINE) {
    errors.push(`Intent line is too long (>${DEFAULT_MAX_HEADER_WORDS_PER_LINE} words)`);
  }

  return { ok: errors.length === 0, errors, purpose, intent };
}

async function listTsFiles(root) {
  const out = [];

  async function walk(dir) {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const abs = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === "node_modules" || entry.name === ".git" || entry.name === "dist" || entry.name === "build") continue;
        await walk(abs);
        continue;
      }
      if (entry.isFile() && entry.name.endsWith(".ts")) out.push(abs);
    }
  }

  await walk(root);
  out.sort((a, b) => a.localeCompare(b));
  return out;
}

function rel(root, abs) {
  return path.relative(root, abs).split(path.sep).join("/");
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) {
    process.stdout.write(`${usage()}\n`);
    return;
  }

  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const scanRoot = path.resolve(repoRoot, opts.scanDir);
  const files = await listTsFiles(scanRoot);

  const headerFailures = [];
  const overSoftLimit = [];

  for (const file of files) {
    const text = await fs.readFile(file, "utf8");
    const header = topHeaderInfo(text);
    if (!header.ok) {
      headerFailures.push({ file: rel(repoRoot, file), errors: header.errors });
    }

    const words = countWords(text);
    if (words > opts.softLimit) {
      overSoftLimit.push({ file: rel(repoRoot, file), words });
    }
  }

  if (headerFailures.length > 0) {
    process.stdout.write("Header policy failures:\n");
    for (const failure of headerFailures) {
      for (const reason of failure.errors) {
        process.stdout.write(`- ${failure.file}: ${reason}\n`);
      }
    }
  } else {
    process.stdout.write(`Header policy OK (${files.length} file(s)).\n`);
  }

  if (overSoftLimit.length > 0) {
    process.stdout.write(
      `Soft word-limit exceeded (${opts.softLimit} words). Consider refactoring these files:\n`
    );
    for (const item of overSoftLimit) {
      process.stdout.write(`- ${item.file}: ${item.words} words\n`);
    }
  } else {
    process.stdout.write(`Soft word-limit OK (${opts.softLimit} words).\n`);
  }

  if (headerFailures.length > 0) {
    process.exitCode = 1;
    return;
  }
  if (opts.strictWordLimit && overSoftLimit.length > 0) {
    process.exitCode = 1;
  }
}

main().catch((err) => {
  process.stderr.write(`ERROR: ${err instanceof Error ? err.message : String(err)}\n`);
  process.stderr.write(`${usage()}\n`);
  process.exitCode = 1;
});
