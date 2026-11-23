import type { FhirBundle, FhirCoding, FhirConcept, FhirReference, FhirResource } from "./types.ts";

export type SliceProfile = "pharmacy" | "lab";
export type ShareProfile = SliceProfile | "hospital";

/** Stored only inside the encrypted record, because the chain must not label record types. */
export const SLICE_TAG_SYSTEM = "urn:rado:share-slice";

export const SHARE_PROFILES: Record<
  ShareProfile,
  { label: string; shares: readonly string[]; withholds: readonly string[] }
> = {
  pharmacy: {
    label: "Pharmacy",
    shares: ["Patient name and birth date", "Prescriptions", "Allergies"],
    withholds: ["Diagnoses", "Procedures", "Lab orders and results"],
  },
  lab: {
    label: "Lab",
    shares: ["Patient name and birth date", "Test orders", "Test results"],
    withholds: ["Diagnoses", "Procedures", "Prescriptions", "Allergies"],
  },
  hospital: {
    label: "Hospital",
    shares: ["The full record"],
    withholds: [],
  },
};

const SLICE_RESOURCES: Record<SliceProfile, ReadonlySet<FhirResource["resourceType"]>> = {
  pharmacy: new Set(["Patient", "MedicationRequest", "AllergyIntolerance"]),
  lab: new Set(["Patient", "ServiceRequest", "Observation"]),
};

function asObject(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("Invalid record");
  }
  return value as Record<string, unknown>;
}

function asString(value: unknown): string {
  if (typeof value !== "string") throw new Error("Invalid record");
  return value;
}

function asConcept(value: unknown): FhirConcept {
  const concept = asObject(value);
  if (!Array.isArray(concept.coding)) throw new Error("Invalid record");
  const coding: FhirCoding[] = concept.coding.map((item: unknown) => {
    const entry = asObject(item);
    return {
      system: asString(entry.system),
      code: asString(entry.code),
      display: asString(entry.display),
    };
  });
  return { coding, text: asString(concept.text) };
}

/** A slice may point only at its patient, so it cannot reference a withheld resource. */
function asPatientReference(value: unknown): FhirReference {
  const reference = asString(asObject(value).reference);
  if (!reference.startsWith("Patient/")) throw new Error("Invalid record");
  return { reference };
}

/** Rebuilds each resource from named fields, so an unknown field can never be copied. */
function copyResource(resource: Record<string, unknown>): FhirResource {
  const id = asString(resource.id);
  switch (resource.resourceType) {
    case "Patient": {
      if (!Array.isArray(resource.name)) throw new Error("Invalid record");
      return {
        resourceType: "Patient",
        id,
        name: resource.name.map((item: unknown) => ({ text: asString(asObject(item).text) })),
        birthDate: asString(resource.birthDate),
      };
    }
    case "MedicationRequest":
      return {
        resourceType: "MedicationRequest",
        id,
        status: asString(resource.status) as "active" | "completed" | "stopped",
        intent: "order",
        subject: asPatientReference(resource.subject),
        medicationCodeableConcept: asConcept(resource.medicationCodeableConcept),
      };
    case "AllergyIntolerance":
      return {
        resourceType: "AllergyIntolerance",
        id,
        patient: asPatientReference(resource.patient),
        code: asConcept(resource.code),
        criticality: asString(resource.criticality) as "low" | "high" | "unable-to-assess",
      };
    case "ServiceRequest":
      return {
        resourceType: "ServiceRequest",
        id,
        status: asString(resource.status) as "active" | "completed",
        intent: "order",
        subject: asPatientReference(resource.subject),
        code: asConcept(resource.code),
      };
    case "Observation":
      return {
        resourceType: "Observation",
        id,
        status: "final",
        subject: asPatientReference(resource.subject),
        code: asConcept(resource.code),
        valueString: asString(resource.valueString),
      };
    default:
      throw new Error("Invalid record");
  }
}

/** Returns null when the record holds nothing for this provider beyond the patient's identity. */
export function buildRecordSlice(record: unknown, profile: SliceProfile): FhirBundle | null {
  const bundle = asObject(record);
  if (bundle.resourceType !== "Bundle" || !Array.isArray(bundle.entry)) {
    throw new Error("Invalid record");
  }
  const allowed = SLICE_RESOURCES[profile];
  const entry = bundle.entry.flatMap((item: unknown) => {
    const resource = asObject(asObject(item).resource);
    if (!allowed.has(resource.resourceType as FhirResource["resourceType"])) return [];
    return [{ resource: copyResource(resource) }];
  });
  if (!entry.some(({ resource }) => resource.resourceType !== "Patient")) return null;
  return {
    resourceType: "Bundle",
    type: "collection",
    meta: { tag: [{ system: SLICE_TAG_SYSTEM, code: profile }] },
    entry,
  };
}

/** Reads the slice marker from a decrypted record. A full record returns null. */
export function sliceProfileOf(record: unknown): SliceProfile | null {
  if (typeof record !== "object" || record === null) return null;
  const tags = (record as { meta?: { tag?: unknown } }).meta?.tag;
  if (!Array.isArray(tags)) return null;
  for (const tag of tags as { system?: unknown; code?: unknown }[]) {
    if (tag?.system === SLICE_TAG_SYSTEM && (tag.code === "pharmacy" || tag.code === "lab")) {
      return tag.code;
    }
  }
  return null;
}
