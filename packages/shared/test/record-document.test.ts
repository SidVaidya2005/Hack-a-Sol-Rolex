import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  canShareDocument,
  decodeDocument,
  detectDocumentMime,
  DocumentError,
  encodeDocument,
  isDocumentPayload,
  MAX_DOCUMENT_BYTES,
  utf8Encode,
} from "../src/index.ts";

const pdf = utf8Encode("%PDF-1.4\nsynthetic\n%%EOF\n");
const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
const jpg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);
const encode = (name: string, bytes: Uint8Array = pdf) =>
  encodeDocument({ name, category: "lab-report", bytes });

/** Replaces the header while keeping the payload's layout, as a modified client could. */
function withHeader(header: unknown, bytes: Uint8Array = pdf): Uint8Array {
  const magic = utf8Encode("RADODOC1");
  const json = utf8Encode(JSON.stringify(header));
  const output = new Uint8Array(magic.length + 2 + json.length + bytes.length);
  output.set(magic);
  new DataView(output.buffer).setUint16(magic.length, json.length);
  output.set(json, magic.length + 2);
  output.set(bytes, magic.length + 2 + json.length);
  return output;
}

describe("record documents", () => {
  it("round-trips the exact bytes and details of each allowed type", () => {
    for (const [name, bytes, mime] of [
      ["report.pdf", pdf, "application/pdf"],
      ["scan.PNG", png, "image/png"],
      ["photo.jpeg", jpg, "image/jpeg"],
      ["photo.jpg", jpg, "image/jpeg"],
    ] as const) {
      const decoded = decodeDocument(encode(name, bytes));
      assert.deepEqual([...decoded.bytes], [...bytes]);
      assert.equal(decoded.name, name);
      assert.equal(decoded.mime, mime);
      assert.equal(decoded.category, "lab-report");
      assert.equal(decoded.size, bytes.length);
    }
  });

  it("reads a payload from inside a larger buffer", () => {
    const payload = encode("report.pdf");
    const larger = new Uint8Array(payload.length + 9);
    larger.set(payload, 4);
    assert.deepEqual([...decodeDocument(larger.subarray(4, 4 + payload.length)).bytes], [...pdf]);
  });

  it("detects the type from content, not the extension", () => {
    assert.throws(() => encode("report.pdf", png), DocumentError);
    assert.throws(() => encode("scan.png", pdf), DocumentError);
    assert.throws(
      () => encode("report.pdf", utf8Encode("<html><script>x</script>")),
      DocumentError,
    );
    assert.throws(() => encode("image.svg", utf8Encode("<svg onload='x'/>")), DocumentError);
    assert.equal(detectDocumentMime(utf8Encode("<svg/>")), null);
  });

  it("rejects empty and oversized files, and accepts exactly the limit", () => {
    assert.throws(() => encode("report.pdf", new Uint8Array()), DocumentError);
    const limit = new Uint8Array(MAX_DOCUMENT_BYTES);
    limit.set(pdf);
    assert.equal(decodeDocument(encode("report.pdf", limit)).size, MAX_DOCUMENT_BYTES);
    const over = new Uint8Array(MAX_DOCUMENT_BYTES + 1);
    over.set(pdf);
    assert.throws(() => encode("report.pdf", over), DocumentError);
  });

  it("rejects unsafe names and strips folder paths", () => {
    for (const name of [
      "",
      ".pdf",
      ".hidden.pdf",
      "report\u202Efdp.exe.pdf",
      "bad\nname.pdf",
      `${"a".repeat(121)}.pdf`,
      "report.pdf.exe",
    ]) {
      assert.throws(() => encode(name), DocumentError, JSON.stringify(name));
    }
    assert.equal(decodeDocument(encode("C:\\fakepath\\report.pdf")).name, "report.pdf");
    assert.equal(decodeDocument(encode("../../report.pdf")).name, "report.pdf");
  });

  it("rejects an unknown category", () => {
    assert.throws(
      () => encodeDocument({ name: "a.pdf", category: "x" as "other", bytes: pdf }),
      DocumentError,
    );
  });

  it("rejects altered or malformed payloads", () => {
    const good = {
      name: "report.pdf",
      mime: "application/pdf",
      category: "other",
      size: pdf.length,
    };
    assert.equal(decodeDocument(withHeader(good)).name, "report.pdf");
    for (const header of [
      { ...good, size: pdf.length + 1 },
      { ...good, mime: "image/png" },
      { ...good, mime: "text/html" },
      { ...good, category: "constructor" },
      { ...good, name: "report.exe" },
      { ...good, name: "../report.pdf" },
      { ...good, extra: true },
      null,
      [],
    ]) {
      assert.throws(() => decodeDocument(withHeader(header)), DocumentError);
    }
    assert.throws(() => decodeDocument(utf8Encode('{"resourceType":"Bundle"}')), DocumentError);
    assert.throws(() => decodeDocument(utf8Encode("RADODOC1")), DocumentError);
    assert.throws(() => decodeDocument(encode("report.pdf").slice(0, 12)), DocumentError);
  });

  it("tells documents apart from FHIR records", () => {
    assert.equal(isDocumentPayload(encode("report.pdf")), true);
    assert.equal(isDocumentPayload(utf8Encode('{"resourceType":"Bundle"}')), false);
  });

  it("limits each category to its approved provider types", () => {
    assert.equal(canShareDocument("prescription", "pharmacy"), true);
    assert.equal(canShareDocument("prescription", "lab"), false);
    assert.equal(canShareDocument("lab-report", "lab"), true);
    assert.equal(canShareDocument("lab-report", "pharmacy"), false);
    for (const kind of ["lab", "pharmacy"] as const) {
      assert.equal(canShareDocument("other", kind), false);
    }
    for (const category of ["prescription", "lab-report", "other"] as const) {
      assert.equal(canShareDocument(category, "hospital"), true);
      assert.equal(canShareDocument(category, "doctor"), true);
      assert.equal(canShareDocument(category, undefined), false);
    }
  });
});
