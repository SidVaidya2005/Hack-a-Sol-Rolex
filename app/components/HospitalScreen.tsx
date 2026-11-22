"use client";

import { useState } from "react";

import { hasReached, type ClaimStage } from "../data/claim-simulation";
import { getHospitalSampleData } from "../data/hospital-sample-data";
import { useClaimActions, useClaimState } from "./ClaimSimulationProvider";
import { Icon } from "./icons";
import { ProofConsole } from "./ProofConsole";
import { Badge, Band, MetricCard, PageHeading, Panel, SampleNotice } from "./ui";

const sample = getHospitalSampleData();
const dollars = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(Number(sample.amount) / 1_000_000);

const STATUS: Record<ClaimStage, { label: string; tone: "warning" | "info" | "success" }> = {
  draft: { label: "Ready to request", tone: "warning" },
  requested: { label: "Awaiting patient", tone: "warning" },
  approved: { label: "Patient approved", tone: "info" },
  proving: { label: "Proof running", tone: "info" },
  proved: { label: "Ready to submit", tone: "info" },
  settled: { label: "Settled · simulated", tone: "success" },
};

export function HospitalScreen() {
  const [note, setNote] = useState<{ text: string; stage: ClaimStage } | null>(null);
  const { stage, rejection } = useClaimState();
  const { requestApproval, startProof, submitClaim } = useClaimActions();
  const approved = hasReached(stage, "approved");
  const proved = hasReached(stage, "proved");
  const settled = stage === "settled";
  const notice = note?.stage === stage ? note.text : settled ? "Simulated settlement complete. No proof was generated and no payment was sent." : "";
  const message = rejection ?? notice;

  const primary: Record<ClaimStage, { label: string; onClick?: () => void }> = {
    draft: { label: "Request patient approval", onClick: requestApproval },
    requested: { label: "Waiting for patient" },
    approved: { label: "Run simulated proof", onClick: startProof },
    proving: { label: "Proof running…" },
    proved: { label: "Submit sample claim", onClick: submitClaim },
    settled: { label: "Submit again", onClick: submitClaim },
  };
  const action = primary[stage];

  const journey = [
    { title: sample.timeline[0].title, done: approved, detail: approved ? sample.timeline[0].detail : "Waiting for the patient" },
    { title: sample.timeline[1].title, done: approved, detail: approved ? sample.timeline[1].detail : "Follows patient approval" },
    { title: sample.timeline[2].title, done: proved, detail: proved ? "Simulated checks passed" : sample.timeline[2].detail },
  ];

  return (
    <>
      <PageHeading eyebrow="Hospital workspace" title="Claims workspace" description="Prepare a claim, review the approval, and see each step before proving." action={<button className="button-primary" disabled={!action.onClick} onClick={action.onClick} type="button">{action.label}<Icon name="arrow" className="size-4" /></button>} />
      <SampleNotice>Claim actions are a simulation. No proof, transaction, or payment is created.</SampleNotice>
      <div className="mb-14 grid gap-x-8 gap-y-2 sm:grid-cols-3">
        <MetricCard label="Ready for review" value={settled ? "0 claims" : "1 claim"} detail="Sample queue" icon="clock" />
        <MetricCard label="This claim" value={dollars} detail="Sample amount" icon="coin" />
        <MetricCard label="Hospital" value={sample.name} detail="Sample organization" icon="building" />
      </div>
      {message ? <p aria-live="polite" className={`${rejection ? "status-error" : "status-success"} motion-reveal mb-8 rounded-lg border px-4 py-3 text-sm`} role="status">{message}</p> : null}
      <div className="grid items-start gap-10 xl:grid-cols-[1.2fr_1fr] xl:gap-16">
        <Panel title="Claim preview" description="Only the details needed for this sample claim are shown." action={<Badge tone={STATUS[stage].tone}>{STATUS[stage].label}</Badge>}>
          <dl className="grid gap-x-8 sm:grid-cols-2">
            <div className="border-t border-rado-line py-4"><dt className="font-mono text-xs uppercase tracking-[0.08em] text-rado-muted">Patient</dt><dd className="mt-2 text-base text-rado-ink">{sample.patient}</dd></div>
            <div className="border-t border-rado-line py-4"><dt className="font-mono text-xs uppercase tracking-[0.08em] text-rado-muted">Visit reference</dt><dd className="mt-2 font-mono text-sm text-rado-ink">{sample.encounter}</dd></div>
            <div className="border-t border-rado-line py-4"><dt className="font-mono text-xs uppercase tracking-[0.08em] text-rado-muted">Procedure</dt><dd className="mt-2 text-base text-rado-ink">{sample.procedure}</dd></div>
            <div className="border-t border-rado-line py-4"><dt className="font-mono text-xs uppercase tracking-[0.08em] text-rado-muted">Claim amount</dt><dd className="mt-2 text-base text-rado-ink">{dollars}</dd></div>
          </dl>
          <div className="mt-4 flex flex-wrap gap-6">
            <button className="button-secondary" onClick={() => setNote({ text: "Sample only: proof inputs are ready for review. The browser did not generate a proof.", stage })} type="button">Review proof inputs</button>
            <button className="button-secondary" onClick={() => setNote({ text: approved ? "The patient approved this claim in the simulation." : "The patient has not approved this claim yet.", stage })} type="button">View patient approval</button>
          </div>
        </Panel>
        <Band eyebrow="Proof console" title="Claim journey" description="A clear view of what happens next.">
          <ol className="divide-y divide-rado-line border-y border-rado-line">
            {journey.map((step, index) => (
              <li className="flex gap-3 py-4" key={step.title}>
                <span className={`grid size-7 shrink-0 place-items-center rounded-full font-mono text-xs ${step.done ? "bg-rado-pale-green text-rado-green" : "bg-rado-stone-wash text-rado-slate"}`}>{step.done ? <Icon name="check" className="motion-reveal size-4" /> : index + 1}</span>
                <div className="min-w-0 flex-1"><div className="flex items-center justify-between gap-3"><p className="text-sm text-rado-ink">{step.title}</p><Badge tone={step.done ? "success" : "neutral"}>{step.done ? "Ready" : "Waiting"}</Badge></div><p className="mt-1 text-xs leading-5 text-rado-slate">{step.detail}</p></div>
              </li>
            ))}
          </ol>
          <ProofConsole />
          <div className="mt-5 flex items-center justify-between gap-3"><span className="font-mono text-xs uppercase tracking-[0.08em] text-rado-muted">Claim day</span><span className="font-mono text-sm text-rado-ink">{sample.claimDay.toString()}</span></div>
          <p className="mt-2 text-xs leading-5 text-rado-slate">The real proof step is reserved for the hospital browser flow.</p>
        </Band>
      </div>
    </>
  );
}
