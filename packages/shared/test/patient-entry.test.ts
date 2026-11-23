import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  breakGlassReasonText,
  buildPatientEntry,
  buildRecordSlice,
  BreakGlassReasonError,
  decodeBreakGlassReason,
  encodeBreakGlassReason,
  PatientEntryError,
  utf8Encode,
} from "../src/index.ts";
import type { PatientEntryType, PatientProfile } from "../src/index.ts";

const profile: PatientProfile = {
  fullName: "Entry Test Patient",
  dateOfBirth: "1990-01-15",
  bloodGroup: "O+",
  allergies: "",
  emergencyContact: "",
};
const build = (type: PatientEntryType, title: string, detail: string) =>
  buildPatientEntry({ type, title, detail }, profile);
const kinds = (bundle: { entry: { resource: { resourceType: string } }[] } | null) =>
  bundle?.entry.map(({ resource }) => resource.resourceType) ?? [];

describe("patient entries", () => {
  it("maps each type to its FHIR resource", () => {
    assert.deepEqual(kinds(build("condition", "Asthma", "")), ["Patient", "Condition"]);
    assert.deepEqual(kinds(build("medication", "Drug", "1 daily")), [
      "Patient",
      "MedicationRequest",
    ]);
    assert.deepEqual(kinds(build("allergy", "Latex", "high")), ["Patient", "AllergyIntolerance"]);
    assert.deepEqual(kinds(build("lab-result", "Panel", "Normal")), ["Patient", "Observation"]);
    assert.deepEqual(kinds(build("procedure", "Scan", "2026-01-02")), ["Patient", "Procedure"]);
    assert.deepEqual(kinds(build("note", "", "Line one\nLine two")), [
      "Patient",
      "DocumentReference",
    ]);
  });

  it("keeps limited copies to the right provider", () => {
    assert.deepEqual(kinds(buildRecordSlice(build("medication", "Drug", "1 daily"), "pharmacy")), [
      "Patient",
      "MedicationRequest",
    ]);
    assert.deepEqual(kinds(buildRecordSlice(build("lab-result", "Panel", "OK"), "lab")), [
      "Patient",
      "Observation",
    ]);
    assert.equal(buildRecordSlice(build("medication", "Drug", "1 daily"), "lab"), null);
    assert.equal(buildRecordSlice(build("condition", "Asthma", ""), "pharmacy"), null);
  });

  it("never gives a free-text note to a lab or pharmacy", () => {
    const note = build("note", "Visit", "Private text");
    assert.equal(buildRecordSlice(note, "lab"), null);
    assert.equal(buildRecordSlice(note, "pharmacy"), null);
  });

  for (const [label, type, title, detail] of [
    ["a missing name", "condition", " ", ""],
    ["a missing dose", "medication", "Drug", ""],
    ["a bad severity", "allergy", "Latex", "medium"],
    ["a missing result", "lab-result", "Panel", ""],
    ["a future procedure", "procedure", "Scan", "2999-01-01"],
    ["an impossible date", "procedure", "Scan", "2026-02-30"],
    ["an empty note", "note", "Title", " "],
    ["a long note", "note", "", "x".repeat(1001)],
    ["a direction override", "condition", "Asth‮ma", ""],
    ["a line break in a name", "note", "One\nTwo", "Body"],
  ] as const) {
    it(`rejects ${label}`, () => {
      assert.throws(() => build(type, title, detail), PatientEntryError);
    });
  }
});

describe("break-glass reason", () => {
  it("round-trips and formats a reason", () => {
    const reason = decodeBreakGlassReason(
      encodeBreakGlassReason({ category: "unconscious", note: " Found at scene " }),
    );
    assert.deepEqual(reason, { category: "unconscious", note: "Found at scene" });
    assert.equal(breakGlassReasonText(reason), "Patient is unconscious: Found at scene");
  });

  it("requires a note for Other, and rejects forged payloads", () => {
    assert.throws(
      () => encodeBreakGlassReason({ category: "other", note: " " }),
      BreakGlassReasonError,
    );
    const magic = utf8Encode("RADOWHY1");
    const body = utf8Encode(JSON.stringify({ category: "made-up", note: "" }));
    const forged = new Uint8Array(magic.length + body.length);
    forged.set(magic);
    forged.set(body, magic.length);
    assert.throws(() => decodeBreakGlassReason(forged), BreakGlassReasonError);
    assert.throws(() => decodeBreakGlassReason(utf8Encode("nope")), BreakGlassReasonError);
  });
});
