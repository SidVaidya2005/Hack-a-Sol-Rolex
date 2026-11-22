import { SAMPLE_EMERGENCY_SUMMARY } from "@rado/shared";

export function getResponderSampleData() {
  const entries = SAMPLE_EMERGENCY_SUMMARY.entry.map(({ resource }) => {
    if (resource.resourceType === "Patient") {
      return { label: "Patient", value: resource.name[0]?.text ?? "Sample patient" };
    }
    if (resource.resourceType === "AllergyIntolerance") {
      return { label: "Allergy", value: resource.code.text };
    }
    if (resource.resourceType === "Observation") {
      return { label: resource.code.text, value: resource.valueString };
    }
    if (resource.resourceType === "Procedure") {
      return { label: "Recent procedure", value: resource.code.text };
    }
    if (resource.resourceType === "Condition") {
      return { label: "Condition", value: resource.code.text };
    }
    return { label: "Medication", value: resource.medicationCodeableConcept.text };
  });

  return { entries };
}
