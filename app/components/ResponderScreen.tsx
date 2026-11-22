"use client";

import { useState } from "react";

import { getResponderSampleData } from "../data/responder-sample-data";
import { Icon } from "./icons";
import { Badge, Band, EmptyState, PageHeading, Panel, SampleNotice } from "./ui";

const sample = getResponderSampleData();

export function ResponderScreen() {
  const [requested, setRequested] = useState(false);
  const [message, setMessage] = useState("");

  return (
    <>
      <PageHeading eyebrow="Emergency responder" title="Emergency access" description="Request access to the emergency summary when a patient cannot act." action={<Badge tone="info">Responder role</Badge>} />
      <SampleNotice>Requesting access below only reveals sample data. No event was sent to the chain and no key was released.</SampleNotice>
      <div className="grid items-start gap-10 xl:grid-cols-[1fr_1.1fr] xl:gap-16">
        <Band eyebrow="Break-glass" title="Break-glass request" description="Emergency access is recorded and limited to the summary." tone="ink">
          <div className="flex items-start gap-3 border-y border-rado-line py-4">
            <span className="text-rado-coral"><Icon name="asterisk" /></span>
            <div><p className="text-sm text-rado-ink">Use only for an urgent need</p><p className="mt-1 text-sm leading-6 text-rado-slate">In the live flow, the patient’s emergency summary is released only after an on-chain request and responder check.</p></div>
          </div>
          <label className="mt-5 block text-sm text-rado-slate" htmlFor="emergency-reason">Reason for request</label>
          <textarea className="field mt-2 min-h-24 resize-y" id="emergency-reason" placeholder="Add a short reason for this sample request" />
          <button className="button-primary mt-4 w-full justify-center" onClick={() => { setRequested(true); setMessage("Sample request only. Nothing was sent to the chain."); }} type="button">Request sample access</button>
          {message ? <p aria-live="polite" className="mt-3 text-center text-xs text-rado-slate">{message}</p> : null}
        </Band>
        <div className="grid gap-10">
          <Panel title="Emergency summary" description="Only the limited summary is shown in this sample flow." action={<Badge tone={requested ? "success" : "neutral"}>{requested ? "Sample preview open" : "Locked"}</Badge>}>
            {requested ? (
              <div className="divide-y divide-rado-line">
                {sample.entries.map((item) => <div className="flex items-center justify-between gap-4 py-4 first:pt-0" key={item.label}><span className="text-sm text-rado-slate">{item.label}</span><span className="text-right text-base text-rado-ink">{item.value}</span></div>)}
                <p className="pt-4 text-xs text-rado-muted">Synthetic information · this preview does not unlock a real record.</p>
              </div>
            ) : (
              <EmptyState icon="lock" title="Summary is locked" description="Start a sample request to preview the limited information available in an emergency." />
            )}
          </Panel>
          <section className="panel-surface py-6"><h2 className="text-base text-rado-ink">Every emergency request leaves a trace</h2><p className="mt-1 text-sm text-rado-slate">In the live app, the patient can review each access event later in their activity history.</p></section>
        </div>
      </div>
    </>
  );
}
