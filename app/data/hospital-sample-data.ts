import { SAMPLE_CLAIM, SAMPLE_HOSPITALS, SAMPLE_PROCEDURES } from "@rado/shared";

export function getHospitalSampleData() {
  const procedure = SAMPLE_PROCEDURES.find(
    ({ code }) => code === SAMPLE_CLAIM.procedureCode,
  );

  return {
    name: SAMPLE_HOSPITALS[0].name,
    patient: "Test Patient Alpha",
    encounter: "VISIT-SAMPLE-1042",
    procedure: procedure?.label ?? "Sample procedure",
    amount: SAMPLE_CLAIM.claimAmount,
    claimDay: SAMPLE_CLAIM.claimDay,
    timeline: [
      { title: "Patient approval", detail: "Sample approval received", state: "Ready" },
      { title: "Hospital signature", detail: "Sample signature prepared", state: "Ready" },
      { title: "Zero-knowledge proof", detail: "Not generated in sample mode", state: "Waiting" },
    ],
  };
}
