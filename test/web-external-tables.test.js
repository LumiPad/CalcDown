import assert from "node:assert/strict";
import { test } from "node:test";

import { loadExternalTables } from "../dist/web/external_tables.js";

function type(name, args = []) {
  return { name, args, raw: args.length ? `${name}(${args.join(",")})` : name };
}

function table(name, columns, source = undefined) {
  return {
    name,
    primaryKey: "id",
    columns,
    rows: [],
    ...(source ? { source } : {}),
    line: 1,
  };
}

async function sha256Hex(text) {
  const encoder = new TextEncoder();
  const bytes = encoder.encode(text);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const arr = new Uint8Array(digest);
  let out = "";
  for (const b of arr) out += b.toString(16).padStart(2, "0");
  return out;
}

async function withFakeFetch(fakeFetch, fn) {
  const prevDesc = Object.getOwnPropertyDescriptor(globalThis, "fetch");
  try {
    Object.defineProperty(globalThis, "fetch", { value: fakeFetch, configurable: true, writable: true });
  } catch {
    globalThis.fetch = fakeFetch;
  }

  try {
    return await fn();
  } finally {
    if (prevDesc) Object.defineProperty(globalThis, "fetch", prevDesc);
    else delete globalThis.fetch;
  }
}

test("web external tables: source read errors and hash mismatch produce stable diagnostics", async () => {
  const origin = "https://example.com/base/";

  await withFakeFetch(
    async () => {
      throw new Error("offline");
    },
    async () => {
      const res = await loadExternalTables(
        [table("t", { id: type("string"), qty: type("integer") }, { uri: "missing.csv", format: "csv", hash: "sha256:00" })],
        origin
      );
      assert.equal(res.ok, false);
      assert.equal(res.messages.length, 1);
      assert.equal(res.messages[0].code, "CD_DATA_SOURCE_READ");
      assert.equal(res.messages[0].nodeName, "t");
      assert.equal(res.messages[0].file, "https://example.com/base/missing.csv");
    }
  );

  const csvText = "id,qty\n1,2\n";
  await withFakeFetch(
    async () => ({
      ok: true,
      status: 200,
      async text() {
        return csvText;
      },
    }),
    async () => {
      const res = await loadExternalTables(
        [table("t", { id: type("string"), qty: type("integer") }, { uri: "data.csv", format: "csv", hash: "sha256:deadbeef" })],
        origin
      );
      assert.equal(res.ok, false);
      assert.ok(res.messages.some((m) => m.code === "CD_DATA_HASH_MISMATCH"));
      assert.ok(!Object.prototype.hasOwnProperty.call(res.overrides, "t"));

      // Sanity: expected hash would match when provided.
      const expected = await sha256Hex(csvText);
      assert.ok(expected.length === 64);
    }
  );
});

test("web external tables: non-ok fetch responses become CD_DATA_SOURCE_READ", async () => {
  const origin = "https://example.com/base/";

  await withFakeFetch(
    async () => ({
      ok: false,
      status: 404,
      async text() {
        return "ignored";
      },
    }),
    async () => {
      const res = await loadExternalTables(
        [table("t", { id: type("string"), qty: type("integer") }, { uri: "data.csv", format: "csv", hash: "sha256:00" })],
        origin
      );
      assert.equal(res.ok, false);
      assert.ok(res.messages.some((m) => m.code === "CD_DATA_SOURCE_READ"));
      assert.ok(res.messages[0].message.includes("HTTP 404"));
    }
  );
});

test("web external tables: hash without sha256: prefix fails fast", async () => {
  const origin = "https://example.com/base/";

  const csvText = "id,qty\n1,2\n";
  await withFakeFetch(
    async () => ({
      ok: true,
      status: 200,
      async text() {
        return csvText;
      },
    }),
    async () => {
      const res = await loadExternalTables(
        [table("t", { id: type("string"), qty: type("integer") }, { uri: "data.csv", format: "csv", hash: "deadbeef" })],
        origin
      );
      assert.equal(res.ok, false);
      assert.ok(res.messages.some((m) => m.code === "CD_DATA_HASH_MISMATCH"));
    }
  );
});

test("web external tables: csv loads, coerces, and flags missing columns", async () => {
  const origin = "https://example.com/base/";

  const csvText = ["id,qty,ok,ok0,maybe,custom,amt,note", "a,2.9,1,0,maybe,x,3.5,hello", "b,0,false,0,,y,,"].join("\n");
  const expectedHex = await sha256Hex(csvText);

  await withFakeFetch(
    async (url) => {
      assert.equal(String(url), "https://example.com/base/data.csv");
      return {
        ok: true,
        status: 200,
        async text() {
          return csvText;
        },
      };
    },
    async () => {
      const res = await loadExternalTables(
        [
          table("skip", { id: type("string") }),
          table(
            "t",
            {
              id: type("string"),
              qty: type("integer"),
              ok: type("boolean"),
              ok0: type("boolean"),
              maybe: type("boolean"),
              custom: type("custom"),
              amt: type("number"),
              note: type("string"),
              missing: type("string"),
            },
            { uri: "data.csv", format: "csv", hash: `sha256:${expectedHex}` }
          ),
        ],
        origin
      );

      assert.equal(res.ok, false);
      assert.ok(res.messages.some((m) => m.code === "CD_DATA_CSV_MISSING_COLUMN"));

      const rows = res.overrides.t;
      assert.ok(Array.isArray(rows));
      assert.equal(rows.length, 2);
      assert.equal(rows[0].id, "a");
      assert.equal(rows[0].qty, 2);
      assert.equal(rows[0].ok, true);
      assert.equal(rows[0].ok0, false);
      assert.equal(rows[0].amt, 3.5);
      assert.equal(rows[0].note, "hello");
      assert.equal(rows[1].id, "b");
    }
  );
});

test("web external tables: empty csv header, blank header keys, and extra columns are handled deterministically", async () => {
  const origin = "https://example.com/base/";

  const empty = "";
  const emptyHex = await sha256Hex(empty);
  await withFakeFetch(
    async () => ({
      ok: true,
      status: 200,
      async text() {
        return empty;
      },
    }),
    async () => {
      const res = await loadExternalTables(
        [table("t", { id: type("string"), qty: type("integer") }, { uri: "empty.csv", format: "csv", hash: `sha256:${emptyHex}` })],
        origin
      );
      assert.equal(res.ok, false);
      assert.ok(res.messages.some((m) => m.code === "CD_DATA_CSV_MISSING_COLUMN"));
    }
  );

  // Includes a blank header key and rows with missing trailing cells (row[i] ?? "").
  const csvText = ["id,,qty,when,at,maybeInt,maybeNum,extra", "a,,2,2025-01-01,2025-01-01T00:00:00Z,ok,ok2,hello", "b,,3,2025-01-02"].join("\n");
  const expectedHex = await sha256Hex(csvText);
  await withFakeFetch(
    async () => ({
      ok: true,
      status: 200,
      async text() {
        return csvText;
      },
    }),
    async () => {
      const res = await loadExternalTables(
        [
          table(
            "t",
            {
              id: type("string"),
              qty: type("integer"),
              when: type("date"),
              at: type("datetime"),
              maybeInt: type("integer"),
              maybeNum: type("number"),
            },
            { uri: "mixed.csv", format: "csv", hash: `sha256:${expectedHex}` }
          ),
        ],
        origin
      );

      // Extra columns and invalid int/num coercions should surface as messages.
      assert.equal(res.ok, false);
      assert.ok(res.messages.some((m) => m.severity === "error"));
      assert.ok(Array.isArray(res.overrides.t));
      assert.equal(res.overrides.t[0].id, "a");
    }
  );
});

test("web external tables: unknown formats still coerce empty rows", async () => {
  const origin = "https://example.com/base/";

  const text = "ignored";
  const expectedHex = await sha256Hex(text);
  await withFakeFetch(
    async () => ({
      ok: true,
      status: 200,
      async text() {
        return text;
      },
    }),
    async () => {
      const res = await loadExternalTables(
        [table("t", { id: type("string") }, { uri: "data.txt", format: "txt", hash: `sha256:${expectedHex}` })],
        origin
      );
      assert.equal(res.ok, true);
      assert.ok(Array.isArray(res.overrides.t));
      assert.equal(res.overrides.t.length, 0);
    }
  );
});

test("web external tables: json sources validate parse and array shape", async () => {
  const origin = "https://example.com/base/";

  const mk = async (text) => {
    const expectedHex = await sha256Hex(text);
    return withFakeFetch(
      async () => ({
        ok: true,
        status: 200,
        async text() {
          return text;
        },
      }),
      async () =>
        loadExternalTables(
          [table("t", { id: type("string"), qty: type("integer") }, { uri: "data.json", format: "json", hash: `sha256:${expectedHex}` })],
          origin
        )
    );
  };

  const bad = await mk("{");
  assert.equal(bad.ok, false);
  assert.ok(bad.messages.some((m) => m.code === "CD_DATA_JSON_PARSE"));

  const notArray = await mk('{"x":1}');
  assert.equal(notArray.ok, false);
  assert.ok(notArray.messages.some((m) => m.code === "CD_DATA_JSON_NOT_ARRAY"));

  const ok = await mk('[{"id":"a","qty":1}]');
  assert.equal(ok.ok, true);
  assert.ok(Array.isArray(ok.overrides.t));
  assert.equal(ok.overrides.t[0].id, "a");
});
