"use client";

import { useState } from "react";

import { hasReached, type ClaimStage } from "../data/claim-simulation";
import { getPatientSampleData } from "../data/patient-sample-data";
import { useClaimActions, useClaimState } from "./ClaimSimulationProvider";
import { Icon, type IconName } from "./icons";
import { Badge, Band, MetricCard, PageHeading, Panel, SampleNotice } from "./ui";

const sample = getPatientSampleData();

function recordIcon(kind: string): IconName {
  if (kind === "Patient") return "heart";
  if (kind === "MedicationRequest") return "pill";
  if (kind === "Procedure") return "pulse";
  return "file";
}

export function PatientScreen() {
  const [accessGranted, setAccessGranted] = useState(false);
  const [recordAdded, setRecordAdded] = useState(false);
  const [note, setNote] = useState<{ text: string; stage: ClaimStage } | null>(null);
  const { stage } = useClaimState();
  const { approveClaim } = useClaimActions();
  const claimRequested = hasReached(stage, "requested");
  const claimApproved = hasReached(stage, "approved");
  const message = note?.stage === stage ? note.text : "";
  const setMessage = (text: string, forStage: ClaimStage = stage) => setNote({ text, stage: forStage });
  const records = recordAdded
    ? [...sample.records, { id: "sample-preview-record", kind: "Document", description: "Sample health record" }]
    : sample.records;
  const activity = [
    ...(stage === "settled" ? [{ title: "Claim settled", when: "Just now", detail: "Simulated event" }] : []),
    ...(claimApproved ? [{ title: "Claim approved", when: "Just now", detail: "Simulated event" }] : []),
    ...(claimRequested ? [{ title: "Claim request received", when: "Just now", detail: "Simulated event" }] : []),
    ...sample.activity,
  ];

  function toggleAccess() {
    setAccessGranted((current) => !current);
    setMessage(accessGranted ? "Sample access was revoked in this preview." : "Sample access was granted in this preview.");
  }

  return (
    <>
      <PageHeading
        eyebrow="Patient workspace"
        title={`Welcome back, ${sample.name.replace(" Alpha", "")}.`}
        description="Your records, the people you trust, and a clear history of what happened."
        action={<button className="button-primary" disabled={recordAdded} onClick={() => { setRecordAdded(true); setMessage("Sample record added in this browser preview only. Nothing was uploaded."); }} type="button"><Icon name="plus" className="size-4" /> {recordAdded ? "Sample record added" : "Add sample record"}</button>}
      />
      <SampleNotice>Everything here is synthetic. Access changes are preview-only; nothing is stored or sent.</SampleNotice>
      <div className="mb-14 grid gap-x-8 gap-y-2 sm:grid-cols-3">
        <MetricCard label="Your records" value={String(records.length)} detail="Available in this sample" icon="file" />
        <MetricCard label="People with access" value={String(sample.access.filter((item) => item.status === "Active").length + Number(accessGranted))} detail="You control every connection" icon="users" />
        <MetricCard label="Recent activity" value={`${activity.length} events`} detail="A private audit trail" icon="clock" />
      </div>
      {message ? <p aria-live="polite" className="status-success mb-8 rounded-lg border px-4 py-3 text-sm">{message}</p> : null}
      <div className="grid items-start gap-10 xl:grid-cols-[1.25fr_1fr] xl:gap-16">
        <div className="order-2 grid gap-10 xl:order-1">
          <Panel title="Your records" description="A sample view of the information you keep private." action={<span className="whitespace-nowrap font-mono text-xs text-rado-muted">{records.length} items</span>}>
            <div className="divide-y divide-rado-line">
              {records.map((record) => (
                <div className="flex items-center gap-4 py-4 first:pt-0 last:pb-0" key={record.id}>
                  <span className="text-rado-muted"><Icon name={recordIcon(record.kind)} /></span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-base text-rado-ink">{record.description}</p>
                    <p className="mt-0.5 text-xs text-rado-slate">{record.kind} · Sample record</p>
                  </div>
                  <span className="hidden font-mono text-xs text-rado-muted sm:block">Encrypted sample</span>
                </div>
              ))}
            </div>
          </Panel>
          <Panel title="People you trust" description="Grant access for a chosen period, then change it whenever you like." action={<button className="button-pill-outline whitespace-nowrap" onClick={toggleAccess} type="button">{accessGranted ? "Revoke access" : "Grant access"}</button>}>
            <div className="divide-y divide-rado-line">
              {sample.access.map((person) => (
                <div className="flex items-center gap-4 py-4 first:pt-0 last:pb-0" key={person.id}>
                  <div className="grid size-10 shrink-0 place-items-center rounded-full bg-rado-stone text-xs text-rado-ink">{person.name.split(" ").map((part) => part[0]).slice(0, 2).join("")}</div>
                  <div className="min-w-0 flex-1"><p className="truncate text-base text-rado-ink">{person.name}</p><p className="text-xs text-rado-slate">Sample care team</p></div>
                  <Badge tone={person.status === "Active" || accessGranted ? "success" : "neutral"}>{accessGranted && person.id === "clinic-one" ? "Active · sample" : person.status}</Badge>
                </div>
              ))}
              {accessGranted ? (
                <div className="flex items-center gap-4 py-4 last:pb-0">
                  <div className="grid size-10 shrink-0 place-items-center rounded-full bg-rado-pale-green text-xs text-rado-green">PC</div>
                  <div className="min-w-0 flex-1"><p className="truncate text-base text-rado-ink">Sample Partner Clinic</p><p className="text-xs text-rado-slate">New sample connection</p></div>
                  <Badge tone="success">Active · sample</Badge>
                </div>
              ) : null}
            </div>
          </Panel>
        </div>
        <div className="order-1 grid gap-10 xl:order-2">
          <Band eyebrow="Your approval" title="Claim request" description={claimRequested ? "Review the details before approving this sample request." : "A hospital's request will appear here for your approval."} action={<Badge tone={claimApproved ? "success" : claimRequested ? "warning" : "neutral"}>{claimApproved ? "Approved · sample" : claimRequested ? "Needs your review" : "No request yet"}</Badge>}>
            {claimRequested ? (
              <>
                <dl className="motion-reveal divide-y divide-rado-line border-y border-rado-line">
                  <div className="flex items-center justify-between gap-4 py-3"><dt className="text-sm text-rado-slate">Visit</dt><dd className="font-mono text-xs text-rado-ink">{sample.claim.encounter}</dd></div>
                  <div className="flex items-center justify-between gap-4 py-3"><dt className="text-sm text-rado-slate">Procedure</dt><dd className="text-right text-sm text-rado-ink">{sample.claim.procedure}</dd></div>
                  <div className="flex items-center justify-between gap-4 py-3"><dt className="text-sm text-rado-slate">Requested amount</dt><dd className="text-sm text-rado-ink">{new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(Number(sample.claim.amount) / 1_000_000)}</dd></div>
                </dl>
                <div className="mt-6 flex flex-wrap items-center gap-4">
                  <button className="button-primary" disabled={claimApproved} onClick={() => { approveClaim(); setMessage("Simulated approval recorded in this browser only. Nothing was signed or sent.", "approved"); }} type="button">{claimApproved ? "Approved" : "Approve sample claim"}</button>
                  <button className="button-secondary" onClick={() => setMessage("Sample claim details are ready for your review.")} type="button">Review request</button>
                </div>
              </>
            ) : (
              <p className="border-y border-rado-line py-6 text-sm text-rado-slate">Nothing needs your approval right now.</p>
            )}
          </Band>
          <Panel title="Recent activity" description="Actions appear here so you stay in control.">
            <div className="space-y-4">
              {activity.map((event, index) => (
                <div className="motion-reveal flex gap-3" key={event.title}>
                  <span className={`mt-1.5 size-2 shrink-0 rounded-full ${index === 0 ? "bg-rado-green" : "bg-rado-line"}`} />
                  <div className="min-w-0 flex-1"><div className="flex justify-between gap-3"><p className="text-sm text-rado-ink">{event.title}</p><span className="whitespace-nowrap font-mono text-xs text-rado-muted">{event.when}</span></div><p className="mt-0.5 text-xs text-rado-slate">{event.detail}</p></div>
                </div>
              ))}
            </div>
          </Panel>
        </div>
      </div>
    </>
  );
}
