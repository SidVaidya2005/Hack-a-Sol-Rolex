import { SAMPLE_CLAIM, SAMPLE_PROCEDURES, SAMPLE_RECORD } from "@rado/shared";

export function getPatientSampleData() {
  return {
    name: "Test Patient Alpha",
    records: SAMPLE_RECORD.entry.map(({ resource }) => ({
      id: resource.id,
      kind: resource.resourceType,
      description:
        resource.resourceType === "Patient"
          ? "Patient profile"
          : resource.resourceType === "Condition"
            ? resource.code.text
            : resource.resourceType === "MedicationRequest"
              ? resource.medicationCodeableConcept.text
              : resource.resourceType === "Procedure"
                ? resource.code.text
                : "Sample item",
    })),
    claim: {
      encounter: "VISIT-SAMPLE-1042",
      procedure: SAMPLE_PROCEDURES.find(({ code }) => code === SAMPLE_CLAIM.procedureCode)?.label ?? "Sample procedure",
      amount: SAMPLE_CLAIM.claimAmount,
      claimDay: SAMPLE_CLAIM.claimDay,
    },
    access: [
      { id: "clinic-one", name: "Sample City Clinic", status: "Active" as const },
      { id: "hospital-two", name: "Sample General Hospital", status: "Expired" as const },
    ],
    activity: [
      { title: "Record created", when: "Today, 9:42 AM", detail: "Sample event" },
      { title: "Clinic access granted", when: "Yesterday", detail: "Sample event" },
      { title: "Record viewed", when: "Nov 20", detail: "Sample event" },
    ],
  };
}
