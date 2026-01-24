import assert from "node:assert/strict";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

function sha256Hex(text) {
  return crypto.createHash("sha256").update(Buffer.from(text, "utf8")).digest("hex");
}

function runNode(scriptPath, args) {
  const res = spawnSync(process.execPath, [scriptPath, ...args], { encoding: "utf8" });
  return { status: res.status, stdout: res.stdout, stderr: res.stderr };
}

function repoRoot() {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
}

test("fmt canonicalizes JSONL rows by primaryKey", async () => {
  const root = repoRoot();
  const fmtTool = path.join(root, "tools", "fmt_calcdown.js");

  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "calcdown-fmt-jsonl-"));
  const file = path.join(dir, "example.calc.md");

  const before = `---\ncalcdown: 0.6\n---\n\n\`\`\`data\nname: t\nprimaryKey: id\ncolumns:\n  id: string\n  n: number\n---\n{\"id\":\"b\",\"n\":1.20}\n\n{\"id\":\"a\",\"n\":2}\n\`\`\`\n`;
  await fs.writeFile(file, before, "utf8");

  const res = runNode(fmtTool, [file]);
  assert.equal(res.status, 0, res.stderr || res.stdout || "fmt exited non-zero");

  const after = await fs.readFile(file, "utf8");
  const block = after.split("---\n").pop() ?? "";
  assert.ok(after.includes('{"id":"a","n":2}'), "expected row 'a' to be present");
  assert.ok(after.includes('{"id":"b","n":1.2}'), "expected numeric normalization for 1.20 -> 1.2");

  const dataLines = after.split(/\r?\n/).filter((l) => l.trim().startsWith("{\"id\""));
  assert.deepEqual(dataLines, ['{"id":"a","n":2}', '{"id":"b","n":1.2}']);
  assert.ok(!block.includes("\n\n\n"), "expected blank JSONL lines to be removed");
});

test("lock + validate --lock detects doc/data drift", async () => {
  const root = repoRoot();
  const tool = path.join(root, "tools", "calcdown.js");

  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "calcdown-lock-"));
  const entry = path.join(dir, "entry.calc.md");
  const child = path.join(dir, "child.calc.md");
  const csvPath = path.join(dir, "items.csv");
  const lockPath = path.join(dir, "calcdown.lock.json");

  const csv1 = `id,qty\nx,2\ny,3\n`;
  await fs.writeFile(csvPath, csv1, "utf8");
  const h1 = sha256Hex(csv1);

  await fs.writeFile(
    child,
    `---\ncalcdown: 0.6\n---\n\n\`\`\`inputs\nk : integer = 1\n\`\`\`\n`,
    "utf8"
  );

  await fs.writeFile(
    entry,
    `---\ncalcdown: 0.6\ninclude:\n  - ./child.calc.md\n---\n\n\`\`\`data\nname: items\nprimaryKey: id\nsource: ./items.csv\nformat: csv\nhash: sha256:${h1}\ncolumns:\n  id: string\n  qty: integer\n---\n# external\n\`\`\`\n\n\`\`\`calc\nconst total = std.table.sum(items, \"qty\");\n\`\`\`\n`,
    "utf8"
  );

  const lockRes = runNode(tool, ["lock", entry, lockPath]);
  assert.equal(lockRes.status, 0, lockRes.stderr || lockRes.stdout || "lock exited non-zero");

  const okValidate = runNode(tool, ["validate", entry, "--lock", lockPath]);
  assert.equal(okValidate.status, 0, okValidate.stderr || okValidate.stdout || "validate --lock should succeed");

  const csv2 = `id,qty\nx,2\ny,4\n`;
  await fs.writeFile(csvPath, csv2, "utf8");
  const h2 = sha256Hex(csv2);
  const updatedEntry = (await fs.readFile(entry, "utf8")).replace(`sha256:${h1}`, `sha256:${h2}`);
  await fs.writeFile(entry, updatedEntry, "utf8");

  const badValidate = runNode(tool, ["validate", entry, "--lock", lockPath]);
  assert.equal(badValidate.status, 1, "validate --lock should fail after drift");

  const parsed = JSON.parse(badValidate.stdout);
  const codes = new Set(parsed.messages.map((m) => m.code).filter(Boolean));
  assert.ok(codes.has("CD_LOCK_DOC_HASH_MISMATCH"), "expected doc hash mismatch");
  assert.ok(codes.has("CD_LOCK_SOURCE_HASH_MISMATCH"), "expected data source hash mismatch");
});

test("export omits view line numbers and includes values", async () => {
  const root = repoRoot();
  const tool = path.join(root, "tools", "calcdown.js");

  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "calcdown-export-"));
  const entry = path.join(dir, "entry.calc.md");

  await fs.writeFile(
    entry,
    `---\ncalcdown: 0.6\n---\n\n\`\`\`inputs\na : integer = 2\nb : integer = 3\n\`\`\`\n\n\`\`\`calc\nconst sum = a + b;\n\`\`\`\n\n\`\`\`view\n{\n  \"id\": \"summary\",\n  \"type\": \"cards\",\n  \"library\": \"calcdown\",\n  \"spec\": { \"items\": [ { \"key\": \"sum\" } ] }\n}\n\`\`\`\n`,
    "utf8"
  );

  const res = runNode(tool, ["export", entry]);
  assert.equal(res.status, 0, res.stderr || res.stdout || "export exited non-zero");

  const out = JSON.parse(res.stdout);
  assert.equal(out.calcdown, "0.6");
  assert.equal(out.values.inputs.a, 2);
  assert.equal(out.values.nodes.sum, 5);
  assert.equal(Array.isArray(out.views), true);
  assert.equal(out.views[0].id, "summary");
  assert.equal(Object.prototype.hasOwnProperty.call(out.views[0], "line"), false);
});

test("diff includes tableRows by primaryKey", async () => {
  const root = repoRoot();
  const tool = path.join(root, "tools", "calcdown.js");

  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "calcdown-diff-"));
  const a = path.join(dir, "a.calc.md");
  const b = path.join(dir, "b.calc.md");

  const base = `---\ncalcdown: 0.6\n---\n\n\`\`\`data\nname: items\nprimaryKey: id\ncolumns:\n  id: string\n  qty: integer\n---\n`;

  await fs.writeFile(
    a,
    `${base}{"id":"i1","qty":1}\n{"id":"i2","qty":2}\n\`\`\`\n`,
    "utf8"
  );
  await fs.writeFile(
    b,
    `${base}{"id":"i1","qty":9}\n{"id":"i3","qty":3}\n\`\`\`\n`,
    "utf8"
  );

  const res = runNode(tool, ["diff", a, b]);
  assert.equal(res.status, 0, res.stderr || res.stdout || "diff exited non-zero");

  const out = JSON.parse(res.stdout);
  assert.ok(out.diff && out.diff.tableRows && out.diff.tableRows.items);
  assert.deepEqual(out.diff.tableRows.items.added, ["i3"]);
  assert.deepEqual(out.diff.tableRows.items.removed, ["i2"]);
  assert.deepEqual(out.diff.tableRows.items.changed, ["i1"]);
  assert.deepEqual(out.diff.tableRows.items.changedKeys.i1, ["qty"]);
});

