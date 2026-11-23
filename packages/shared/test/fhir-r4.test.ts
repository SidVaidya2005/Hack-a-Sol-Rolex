import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildPatientEntry,
  buildRecordSlice,
  SAMPLE_CARE_RECORD,
  SAMPLE_EMERGENCY_SUMMARY,
  SAMPLE_RECORD,
} from "../src/index.ts";
import type { FhirBundle, PatientEntryInput, PatientProfile } from "../src/index.ts";

/** The fields FHIR R4 marks as required (1..1 or 1..*) on each resource Rado writes. */
const REQUIRED: Record<string, readonly string[]> = {
  Patient: [],
  Condition: ["subject"],
  AllergyIntolerance: ["patient"],
  MedicationRequest: ["status", "intent", "medicationCodeableConcept", "subject"],
  Observation: ["status", "code"],
  Procedure: ["status", "subject"],
  ServiceRequest: ["status", "intent", "subject"],
  DocumentReference: ["status", "content"],
};
const STATUS: Record<string, readonly string[]> = {
  MedicationRequest: ["active", "on-hold", "cancelled", "completed", "stopped", "draft"],
  Observation: ["registered", "preliminary", "final", "amended"],
  Procedure: ["preparation", "in-progress", "not-done", "on-hold", "stopped", "completed"],
  ServiceRequest: ["draft", "active", "on-hold", "revoked", "completed"],
  DocumentReference: ["current", "superseded", "entered-in-error"],
};

function problems(bundle: FhirBundle): string[] {
  const found: string[] = [];
  if (bundle.resourceType !== "Bundle" || bundle.type !== "collection") found.push("Bundle type");
  for (const { resource } of bundle.entry) {
    const fields = resource as unknown as Record<string, unknown>;
    const required = REQUIRED[resource.resourceType];
    if (!required) {
      found.push(`unknown ${resource.resourceType}`);
      continue;
    }
    if (!/^[A-Za-z0-9\-.]{1,64}$/.test(resource.id)) found.push(`${resource.id}: id`);
    for (const field of required) {
      const value = fields[field];
      if (value === undefined || (Array.isArray(value) && value.length === 0)) {
        found.push(`${resource.resourceType}.${field}`);
      }
    }
    const allowed = STATUS[resource.resourceType];
    if (allowed && !allowed.includes(String(fields.status))) {
      found.push(`${resource.resourceType}.status`);
    }
  }
  return found;
}

const profile: PatientProfile = {
  fullName: "FHIR Test Patient",
  dateOfBirth: "1990-01-15",
  bloodGroup: "O+",
  allergies: "",
  emergencyContact: "",
};
const ENTRIES: PatientEntryInput[] = [
  { type: "condition", title: "Condition", detail: "" },
  { type: "medication", title: "Medicine", detail: "One daily" },
  { type: "allergy", title: "Substance", detail: "high" },
  { type: "lab-result", title: "Panel", detail: "Normal" },
  { type: "procedure", title: "Scan", detail: "2026-01-02" },
  { type: "note", title: "Visit", detail: "Line one\nLine two" },
];

describe("FHIR R4 required fields", () => {
  for (const [name, bundle] of [
    ["sample record", SAMPLE_RECORD],
    ["care record", SAMPLE_CARE_RECORD],
    ["emergency summary", SAMPLE_EMERGENCY_SUMMARY],
  ] as const) {
    it(`accepts the ${name}`, () => assert.deepEqual(problems(bundle), []));
  }

  for (const input of ENTRIES) {
    it(`accepts a ${input.type} entry and its limited copies`, () => {
      const bundle = buildPatientEntry(input, profile);
      assert.deepEqual(problems(bundle), []);
      for (const kind of ["lab", "pharmacy"] as const) {
        const slice = buildRecordSlice(bundle, kind);
        if (slice) assert.deepEqual(problems(slice), []);
      }
    });
  }

  it("carries a visit note as a decodable attachment", () => {
    const [, entry] = buildPatientEntry(ENTRIES[5] as PatientEntryInput, profile).entry;
    assert.equal(entry?.resource.resourceType, "DocumentReference");
    if (entry?.resource.resourceType !== "DocumentReference") return;
    const { attachment } = entry.resource.content[0] as (typeof entry.resource.content)[number];
    assert.equal(Buffer.from(attachment.data, "base64").toString(), entry.resource.description);
  });

  it("reports a missing required field", () => {
    const broken = structuredClone(buildPatientEntry(ENTRIES[5] as PatientEntryInput, profile));
    const resource = broken.entry[1]?.resource as unknown as { content?: unknown };
    delete resource.content;
    assert.deepEqual(problems(broken), ["DocumentReference.content"]);
  });
});
