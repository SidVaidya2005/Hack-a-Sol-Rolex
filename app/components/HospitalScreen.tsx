"use client";

import { useState } from "react";

import { getHospitalSampleData } from "../data/hospital-sample-data";
import { Icon } from "./icons";
import { Badge, Band, MetricCard, PageHeading, Panel, SampleNotice } from "./ui";

const sample = getHospitalSampleData();
const dollars = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(Number(sample.amount) / 1_000_000);

export function HospitalScreen() {
  const [sampleSubmitted, setSampleSubmitted] = useState(false);
  const [message, setMessage] = useState("");

  function submitSampleClaim() {
    if (sampleSubmitted) {
      setMessage("This claim was already submitted.");
      return;
    }
    setSampleSubmitted(true);
    setMessage("Sample only: this claim preview was marked submitted. No proof was generated and no payment was sent.");
  }

  return (
    <>
      <PageHeading eyebrow="Hospital workspace" title="Claims workspace" description="Prepare a claim, review the approval, and see each step before proving." action={<button className="button-primary" onClick={submitSampleClaim} type="button">{sampleSubmitted ? "Submit again" : "Submit sample claim"}<Icon name="arrow" className="size-4" /></button>} />
      <SampleNotice>Claim actions are a preview. No proof, transaction, or payment is created.</SampleNotice>
      <div className="mb-14 grid gap-x-8 gap-y-2 sm:grid-cols-3">
        <MetricCard label="Ready for review" value="1 claim" detail="Sample queue" icon="clock" />
        <MetricCard label="This claim" value={dollars} detail="Sample amount" icon="coin" />
        <MetricCard label="Hospital" value={sample.name} detail="Sample organization" icon="building" />
      </div>
      {message ? <p aria-live="polite" className={`${message === "This claim was already submitted." ? "status-error" : "status-success"} mb-8 rounded-lg border px-4 py-3 text-sm`} role="status">{message}</p> : null}
      <div className="grid items-start gap-10 xl:grid-cols-[1.2fr_1fr] xl:gap-16">
        <Panel title="Claim preview" description="Only the details needed for this sample claim are shown." action={<Badge tone={sampleSubmitted ? "info" : "warning"}>{sampleSubmitted ? "Submitted · sample" : "Needs review"}</Badge>}>
          <dl className="grid gap-x-8 sm:grid-cols-2">
            <div className="border-t border-rado-line py-4"><dt className="font-mono text-xs uppercase tracking-[0.08em] text-rado-muted">Patient</dt><dd className="mt-2 text-base text-rado-ink">{sample.patient}</dd></div>
            <div className="border-t border-rado-line py-4"><dt className="font-mono text-xs uppercase tracking-[0.08em] text-rado-muted">Visit reference</dt><dd className="mt-2 font-mono text-sm text-rado-ink">{sample.encounter}</dd></div>
            <div className="border-t border-rado-line py-4"><dt className="font-mono text-xs uppercase tracking-[0.08em] text-rado-muted">Procedure</dt><dd className="mt-2 text-base text-rado-ink">{sample.procedure}</dd></div>
            <div className="border-t border-rado-line py-4"><dt className="font-mono text-xs uppercase tracking-[0.08em] text-rado-muted">Claim amount</dt><dd className="mt-2 text-base text-rado-ink">{dollars}</dd></div>
          </dl>
          <div className="mt-4 flex flex-wrap gap-6">
            <button className="button-secondary" onClick={() => setMessage("Sample only: proof inputs are ready for review. The browser did not generate a proof.")} type="button">Review proof inputs</button>
            <button className="button-secondary" onClick={() => setMessage("Sample approval details are already shown in this preview.")} type="button">View patient approval</button>
          </div>
        </Panel>
        <Band eyebrow="Proof console" title="Claim journey" description="A clear view of what happens next.">
          <ol className="divide-y divide-rado-line border-y border-rado-line">
            {sample.timeline.map((step, index) => (
              <li className="flex gap-3 py-4" key={step.title}>
                <span className={`grid size-7 shrink-0 place-items-center rounded-full font-mono text-xs ${index < 2 ? "bg-rado-pale-green text-rado-green" : "bg-rado-stone-wash text-rado-slate"}`}>{index < 2 ? <Icon name="check" className="size-4" /> : index + 1}</span>
                <div className="min-w-0 flex-1"><div className="flex items-center justify-between gap-3"><p className="text-sm text-rado-ink">{step.title}</p><Badge tone={step.state === "Ready" ? "success" : "neutral"}>{step.state}</Badge></div><p className="mt-1 text-xs leading-5 text-rado-slate">{step.detail}</p></div>
              </li>
            ))}
          </ol>
          <div className="mt-5 flex items-center justify-between gap-3"><span className="font-mono text-xs uppercase tracking-[0.08em] text-rado-muted">Claim day</span><span className="font-mono text-sm text-rado-ink">{sample.claimDay.toString()}</span></div>
          <p className="mt-2 text-xs leading-5 text-rado-slate">The final proof step is reserved for the hospital browser flow.</p>
        </Band>
      </div>
    </>
  );
}
