"use client";

import { DoctorRecordsPanel } from "./DoctorRecordsPanel";
import { PageHeading } from "./ui";

const PROVIDER_TEXT = {
  title: "Shared with this provider",
  description:
    "Only the limited copies patients shared with this wallet. Each view is logged first.",
  unlockPurpose: "Sign once in your lab or pharmacy wallet so patients can share with you.",
  className: "",
};

export function ProviderScreen() {
  return (
    <>
      <PageHeading
        eyebrow="Lab & pharmacy"
        title="Only what you need"
        description="A pharmacy sees prescriptions and allergies. A lab sees test orders and results. Diagnoses stay private."
        status="live"
      />
      <DoctorRecordsPanel text={PROVIDER_TEXT} />
    </>
  );
}
