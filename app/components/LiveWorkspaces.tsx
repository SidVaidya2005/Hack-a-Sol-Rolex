"use client";

import { DoctorRecordsPanel } from "./DoctorRecordsPanel";
import { HospitalClaimPanel } from "./HospitalClaimPanel";
import { PatientClaimPanel } from "./PatientClaimPanel";
import { PatientProfilePanel, usePatientProfile } from "./PatientProfilePanel";
import { AuditTimeline, PatientRecordsPanel } from "./PatientRecordsPanel";
import { PageHeading } from "./ui";

/** Real data only. The labeled sample walkthrough stays in the demo screens. */
export function PatientWorkspace() {
  const { profile } = usePatientProfile();
  return (
    <>
      <PageHeading
        eyebrow="Patient workspace"
        title={profile ? `Welcome, ${profile.fullName}.` : "Welcome to Rado."}
        description="Your records, the people you trust, and a clear history of what happened."
        status="live"
      />
      <div className="grid items-start gap-10 xl:grid-cols-[1.25fr_1fr] xl:gap-16">
        <div className="order-2 grid min-w-0 gap-10 xl:order-1">
          <PatientRecordsPanel />
        </div>
        <div className="order-1 grid min-w-0 gap-10 xl:order-2">
          <PatientProfilePanel />
          <PatientClaimPanel />
          <AuditTimeline />
        </div>
      </div>
    </>
  );
}

export function HospitalWorkspace() {
  return (
    <>
      <PageHeading
        eyebrow="Hospital workspace"
        title="Claims and shared records"
        description="Request approval, prove a claim in this browser, and read what patients shared with you."
        status="live"
      />
      <HospitalClaimPanel />
      <DoctorRecordsPanel />
    </>
  );
}
