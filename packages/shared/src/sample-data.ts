import type { FhirBundle } from "./types.ts";

/** All data here is synthetic. Never add real patient information. */

const CODE_SYSTEM = "urn:rado:synthetic";
const PATIENT_REF = { reference: "Patient/sample-patient" };

function concept(code: string, display: string) {
  return { coding: [{ system: CODE_SYSTEM, code, display }], text: display };
}

export const SAMPLE_PROCEDURES = [
  { code: 1001n, label: "Sample outpatient consult" },
  { code: 1002n, label: "Sample imaging scan" },
  { code: 1003n, label: "Sample minor surgery" },
  { code: 1004n, label: "Sample physiotherapy session" },
] as const;

/** A procedure outside the sample policy, for rejection tests. */
export const SAMPLE_UNCOVERED_PROCEDURE = {
  code: 9001n,
  label: "Sample uncovered procedure",
} as const;

export const SAMPLE_HOSPITALS = [
  { name: "Sample General Hospital" },
  { name: "Sample City Clinic" },
] as const;

export const SAMPLE_POLICY = {
  expiryDay: 21_144n,
  perClaimLimit: 5_000_000_000n,
  totalCap: 20_000_000_000n,
} as const;

export const SAMPLE_CLAIM = {
  procedureCode: 1002n,
  claimAmount: 1_250_000_000n,
  claimDay: 20_779n,
} as const;

export const SAMPLE_RECORD: FhirBundle = {
  resourceType: "Bundle",
  type: "collection",
  entry: [
    {
      resource: {
        resourceType: "Patient",
        id: "sample-patient",
        name: [{ text: "Test Patient Alpha" }],
        birthDate: "1990-01-01",
      },
    },
    {
      resource: {
        resourceType: "Condition",
        id: "sample-condition",
        subject: PATIENT_REF,
        code: concept("C-100", "Sample chronic condition"),
      },
    },
    {
      resource: {
        resourceType: "MedicationRequest",
        id: "sample-medication",
        status: "active",
        intent: "order",
        subject: PATIENT_REF,
        medicationCodeableConcept: concept("M-200", "Sample medication"),
      },
    },
    {
      resource: {
        resourceType: "Procedure",
        id: "sample-procedure",
        status: "completed",
        subject: PATIENT_REF,
        code: concept("1002", "Sample imaging scan"),
        performedDateTime: "2026-11-22",
      },
    },
  ],
};

export const SAMPLE_EMERGENCY_SUMMARY: FhirBundle = {
  resourceType: "Bundle",
  type: "collection",
  entry: [
    {
      resource: {
        resourceType: "Patient",
        id: "sample-patient",
        name: [{ text: "Test Patient Alpha" }],
        birthDate: "1990-01-01",
      },
    },
    {
      resource: {
        resourceType: "AllergyIntolerance",
        id: "sample-allergy",
        patient: PATIENT_REF,
        code: concept("A-300", "Sample drug allergy"),
        criticality: "high",
      },
    },
    {
      resource: {
        resourceType: "Observation",
        id: "sample-blood-type",
        status: "final",
        subject: PATIENT_REF,
        code: concept("O-400", "Blood type"),
        valueString: "O positive",
      },
    },
  ],
};
