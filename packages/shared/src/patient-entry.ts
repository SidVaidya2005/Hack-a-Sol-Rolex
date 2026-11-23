import { bytesToBase64, utf8Encode } from "./crypto/bytes.ts";
import type { PatientProfile } from "./patient-profile.ts";
import type { FhirBundle, FhirResource } from "./types.ts";

export const PATIENT_ENTRY_TYPES = {
  condition: { label: "Diagnosis", title: "Diagnosis or condition", detail: "Notes (optional)" },
  medication: { label: "Medication", title: "Medicine name", detail: "Dose and schedule" },
  allergy: { label: "Allergy", title: "Allergic to", detail: "Severity" },
  "lab-result": { label: "Lab result", title: "Test name", detail: "Result" },
  procedure: { label: "Procedure", title: "Procedure name", detail: "Date performed" },
  note: { label: "Visit note", title: "Title (optional)", detail: "Note" },
} as const;

export type PatientEntryType = keyof typeof PATIENT_ENTRY_TYPES;

export interface PatientEntryInput {
  type: PatientEntryType;
  title: string;
  /** Free text, except allergy (`low` or `high`) and procedure (YYYY-MM-DD). */
  detail: string;
}

/** Its message is plain enough to show a user. */
export class PatientEntryError extends Error {}

const MAX_TITLE_CHARS = 120;
const MAX_DETAIL_CHARS = 200;
const MAX_NOTE_CHARS = 1000;
const PATIENT_ID = "patient";
const SUBJECT = { reference: `Patient/${PATIENT_ID}` };
const CODE_SYSTEM = "urn:rado:patient-reported";
// A note may hold line breaks. Other control and text-direction characters are refused.
const UNSAFE_TEXT = /[\u0000-\u0009\u000b-\u001f\u007f-\u009f‎‏‪-‮⁦-⁩]/;

const concept = (code: string, text: string) => ({
  coding: [{ system: CODE_SYSTEM, code, display: text }],
  text,
});

function isPastDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return (
    !Number.isNaN(date.getTime()) &&
    date.toISOString().slice(0, 10) === value &&
    value <= new Date().toISOString().slice(0, 10)
  );
}

function entryResource(type: PatientEntryType, title: string, detail: string): FhirResource {
  const id = `entry-${type}`;
  const withDetail = detail ? `${title} (${detail})` : title;
  switch (type) {
    case "condition":
      return { resourceType: "Condition", id, subject: SUBJECT, code: concept(type, withDetail) };
    case "medication":
      return {
        resourceType: "MedicationRequest",
        id,
        status: "active",
        intent: "order",
        subject: SUBJECT,
        medicationCodeableConcept: concept(type, withDetail),
      };
    case "allergy":
      return {
        resourceType: "AllergyIntolerance",
        id,
        patient: SUBJECT,
        code: concept(type, title),
        criticality: detail as "low" | "high",
      };
    case "lab-result":
      return {
        resourceType: "Observation",
        id,
        status: "final",
        subject: SUBJECT,
        code: concept(type, title),
        valueString: detail,
      };
    case "procedure":
      return {
        resourceType: "Procedure",
        id,
        status: "completed",
        subject: SUBJECT,
        code: concept(type, `${title} (${detail})`),
        performedDateTime: detail,
      };
    case "note": {
      const description = title ? `${title}: ${detail}` : detail;
      return {
        resourceType: "DocumentReference",
        id,
        status: "current",
        subject: SUBJECT,
        description,
        // FHIR R4 requires content, so the note is also carried as a text attachment.
        content: [
          {
            attachment: {
              contentType: "text/plain",
              data: bytesToBase64(utf8Encode(description)),
            },
          },
        ],
      };
    }
  }
}

/** Typed entries map to FHIR, so limited lab and pharmacy copies keep working. */
export function buildPatientEntry(input: PatientEntryInput, profile: PatientProfile): FhirBundle {
  if (!Object.hasOwn(PATIENT_ENTRY_TYPES, input.type)) {
    throw new PatientEntryError("Choose a record type.");
  }
  const title = input.title.trim();
  const detail = input.detail.trim();
  const isNote = input.type === "note";
  if (!isNote && !title) throw new PatientEntryError("Enter the record's name.");
  if (title.length > MAX_TITLE_CHARS) {
    throw new PatientEntryError("Keep the name to 120 characters.");
  }
  if (detail.length > (isNote ? MAX_NOTE_CHARS : MAX_DETAIL_CHARS)) {
    throw new PatientEntryError(`Keep the details to ${isNote ? 1000 : 200} characters.`);
  }
  if (UNSAFE_TEXT.test(title) || UNSAFE_TEXT.test(detail) || title.includes("\n")) {
    throw new PatientEntryError("Remove unusual characters and try again.");
  }
  if (!isNote && input.type !== "condition" && input.type !== "medication" && !detail) {
    throw new PatientEntryError("Complete all fields.");
  }
  if (input.type === "medication" && !detail) {
    throw new PatientEntryError("Enter the dose and schedule.");
  }
  if (isNote && !detail) throw new PatientEntryError("Write the note.");
  if (!isNote && detail.includes("\n")) {
    throw new PatientEntryError("Remove unusual characters and try again.");
  }
  if (input.type === "allergy" && detail !== "low" && detail !== "high") {
    throw new PatientEntryError("Choose a severity.");
  }
  if (input.type === "procedure" && !isPastDate(detail)) {
    throw new PatientEntryError("Enter a valid past date.");
  }
  return {
    resourceType: "Bundle",
    type: "collection",
    entry: [
      {
        resource: {
          resourceType: "Patient",
          id: PATIENT_ID,
          name: [{ text: profile.fullName }],
          birthDate: profile.dateOfBirth,
        },
      },
      { resource: entryResource(input.type, title, detail) },
    ],
  };
}
