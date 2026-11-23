import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildRecordSlice,
  SAMPLE_CARE_RECORD,
  SAMPLE_RECORD,
  sliceProfileOf,
  SLICE_TAG_SYSTEM,
} from "../src/index.ts";

const typesIn = (bundle: { entry: { resource: { resourceType: string } }[] } | null) =>
  bundle?.entry.map(({ resource }) => resource.resourceType).sort();

describe("record slices", () => {
  it("gives a pharmacy only identity, prescriptions, and allergies", () => {
    const slice = buildRecordSlice(SAMPLE_CARE_RECORD, "pharmacy");
    assert.deepEqual(typesIn(slice), ["AllergyIntolerance", "MedicationRequest", "Patient"]);
    const text = JSON.stringify(slice);
    for (const withheld of ["chronic condition", "imaging scan", "blood panel", "sample range"]) {
      assert.equal(text.includes(withheld), false, withheld);
    }
  });

  it("gives a lab only identity, test orders, and results", () => {
    const slice = buildRecordSlice(SAMPLE_CARE_RECORD, "lab");
    assert.deepEqual(typesIn(slice), ["Observation", "Patient", "ServiceRequest"]);
    const text = JSON.stringify(slice);
    for (const withheld of ["chronic condition", "imaging scan", "Sample medication", "allergy"]) {
      assert.equal(text.includes(withheld), false, withheld);
    }
  });

  it("drops fields outside the allowlist from an allowed resource", () => {
    const record = structuredClone(SAMPLE_CARE_RECORD) as unknown as {
      entry: { resource: Record<string, unknown> }[];
    };
    const medication = record.entry.find(
      ({ resource }) => resource.resourceType === "MedicationRequest",
    );
    assert.ok(medication);
    medication.resource.reasonCode = [{ text: "HIDDEN DIAGNOSIS" }];
    medication.resource.note = "HIDDEN NOTE";
    const text = JSON.stringify(buildRecordSlice(record, "pharmacy"));
    assert.equal(text.includes("HIDDEN"), false);
  });

  it("rejects an allowed resource that points at a withheld resource", () => {
    const record = structuredClone(SAMPLE_CARE_RECORD) as unknown as {
      entry: { resource: Record<string, unknown> }[];
    };
    const medication = record.entry.find(
      ({ resource }) => resource.resourceType === "MedicationRequest",
    );
    assert.ok(medication);
    medication.resource.subject = { reference: "Condition/sample-condition" };
    assert.throws(() => buildRecordSlice(record, "pharmacy"));
  });

  it("returns null when a provider would receive only the patient's identity", () => {
    assert.equal(buildRecordSlice(SAMPLE_RECORD, "lab"), null);
  });

  it("rejects malformed records", () => {
    for (const value of [null, [], {}, { resourceType: "Bundle" }, { entry: [] }]) {
      assert.throws(() => buildRecordSlice(value, "lab"));
    }
  });

  it("does not change the source record", () => {
    const before = JSON.stringify(SAMPLE_CARE_RECORD);
    buildRecordSlice(SAMPLE_CARE_RECORD, "lab");
    assert.equal(JSON.stringify(SAMPLE_CARE_RECORD), before);
  });

  it("marks slices and leaves full records unmarked", () => {
    assert.equal(sliceProfileOf(buildRecordSlice(SAMPLE_CARE_RECORD, "lab")), "lab");
    assert.equal(sliceProfileOf(buildRecordSlice(SAMPLE_CARE_RECORD, "pharmacy")), "pharmacy");
    assert.equal(sliceProfileOf(SAMPLE_CARE_RECORD), null);
    assert.equal(
      sliceProfileOf({ meta: { tag: [{ system: SLICE_TAG_SYSTEM, code: "insurer" }] } }),
      null,
    );
  });
});
