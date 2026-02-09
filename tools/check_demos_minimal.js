#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

function usage() {
  return [
    "Usage:",
    "  node tools/check_demos_minimal.js",
    "",
    "Checks:",
    "  - demos/demo*/index.html uses CalcDown base styling (body has class=calcdown-root).",
    "  - Demo pages do not restyle CalcDown component primitives via local CSS.",
    "  - src/demo*.ts installs CalcDown base styles via installCalcdownStyles().",
  ].join("\n");
}

function rel(root, abs) {
  return path.relative(root, abs).split(path.sep).join("/");
}

function stripCssComments(css) {
  return css.replace(/\/\*[\s\S]*?\*\//g, "");
}

function extractStyleBlocks(html) {
  const out = [];
  const re = /<style\b[^>]*>([\s\S]*?)<\/style>/gi;
  let match;
  while ((match = re.exec(html))) {
    out.push(match[1] ?? "");
  }
  return out;
}

function parseCssProperties(blockBody) {
  const props = [];
  const cleaned = stripCssComments(blockBody);
  for (const chunk of cleaned.split(";")) {
    const trimmed = chunk.trim();
    if (!trimmed) continue;
    const idx = trimmed.indexOf(":");
    if (idx === -1) continue;
    const prop = trimmed.slice(0, idx).trim();
    if (prop) props.push(prop);
  }
  return props;
}

function checkDemoCss(file, cssText) {
  const css = stripCssComments(cssText);

  const forbidden = [
    { re: /\.view\b/i, why: "do not restyle CalcDown view containers (.view)" },
    { re: /\.cards\b/i, why: "do not restyle CalcDown cards (.cards)" },
    { re: /\.card\b/i, why: "do not restyle CalcDown cards (.card)" },
    { re: /\.calcdown-(?!root\b)[a-z0-9_-]+\b/i, why: "do not restyle CalcDown component classes (.calcdown-*)" },
    { re: /\.chart-legend\b/i, why: "do not restyle CalcDown chart legend (.chart-legend)" },
    { re: /\btable\b[^;{]*\{/i, why: "do not restyle CalcDown tables (table/th/td)" },
    { re: /\bth\b[^;{]*\{/i, why: "do not restyle CalcDown tables (table/th/td)" },
    { re: /\btd\b[^;{]*\{/i, why: "do not restyle CalcDown tables (table/th/td)" },
    { re: /\bpre\b[^;{]*\{/i, why: "do not restyle CalcDown message blocks (pre)" },
  ];

  const errors = [];

  for (const item of forbidden) {
    if (item.re.test(css)) errors.push(item.why);
  }

  const rootRuleRe = /\.calcdown-root\s*\{([\s\S]*?)\}/gi;
  for (const match of css.matchAll(rootRuleRe)) {
    const body = match[1] ?? "";
    const props = parseCssProperties(body);
    for (const prop of props) {
      if (prop === "color-scheme") continue;
      if (prop.startsWith("--calcdown-")) continue;
      errors.push(`.calcdown-root should only set CalcDown CSS variables (found '${prop}')`);
    }
  }

  return errors.length ? { ok: false, file, errors } : { ok: true, file, errors: [] };
}

async function listDemoIndexHtmlFiles(demosRoot) {
  const out = [];
  const entries = await fs.readdir(demosRoot, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (!/^demo\d+$/.test(entry.name)) continue;
    const indexHtml = path.join(demosRoot, entry.name, "index.html");
    try {
      await fs.access(indexHtml);
      out.push(indexHtml);
    } catch {
      // ignore
    }
  }
  out.sort((a, b) => a.localeCompare(b));
  return out;
}

async function listDemoTsFiles(srcRoot) {
  const out = [];
  const entries = await fs.readdir(srcRoot, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    if (!/^demo(\d+)?\.ts$/.test(entry.name)) continue;
    out.push(path.join(srcRoot, entry.name));
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

  const demoHtmlFiles = await listDemoIndexHtmlFiles(path.join(repoRoot, "demos"));
  const demoTsFiles = await listDemoTsFiles(path.join(repoRoot, "src"));

  const failures = [];

  for (const abs of demoHtmlFiles) {
    const text = await fs.readFile(abs, "utf8");

    if (!/<body\b[^>]*class=["'][^"']*\bcalcdown-root\b/i.test(text)) {
      failures.push({ file: rel(repoRoot, abs), errors: ["body must have class='calcdown-root' to enable CalcDown base styles"] });
    }

    const styles = extractStyleBlocks(text);
    for (const css of styles) {
      const res = checkDemoCss(rel(repoRoot, abs), css);
      if (!res.ok) failures.push({ file: res.file, errors: res.errors });
    }
  }

  for (const abs of demoTsFiles) {
    const text = await fs.readFile(abs, "utf8");
    if (!/\binstallCalcdownStyles\s*\(/.test(text)) {
      failures.push({ file: rel(repoRoot, abs), errors: ["missing installCalcdownStyles() call (demos should not re-implement base styling)"] });
    }
  }

  if (failures.length) {
    process.stdout.write("Demo minimalism check failed:\n");
    for (const failure of failures) {
      for (const err of failure.errors) process.stdout.write(`- ${failure.file}: ${err}\n`);
    }
    process.exitCode = 1;
    return;
  }

  process.stdout.write(`Demo minimalism OK (${demoHtmlFiles.length} page(s), ${demoTsFiles.length} script(s)).\n`);
}

main().catch((err) => {
  process.stderr.write(`ERROR: ${err instanceof Error ? err.message : String(err)}\n`);
  process.stderr.write(`${usage()}\n`);
  process.exitCode = 1;
});

