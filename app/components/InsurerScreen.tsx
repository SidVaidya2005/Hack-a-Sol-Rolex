"use client";

import { useState } from "react";

import { formatAmount, getInsurerSampleData } from "../data/insurer-sample-data";
import { usePublicClaim } from "./ClaimSimulationProvider";
import { Icon } from "./icons";
import { Badge, Band, MetricCard, PageHeading, Panel, SampleNotice } from "./ui";

const sample = getInsurerSampleData();

export function InsurerScreen() {
  const [message, setMessage] = useState("");
  const claim = usePublicClaim();
  const payout = claim.settled ? claim.amount : 0n;
  const utilization = Number(((sample.usedCapUnits + payout) * 100n) / sample.capUnits);
  const claims = claim.settled
    ? [{ id: claim.claimId, policy: claim.policy, amount: formatAmount(claim.amount), date: claim.date, state: "Verified · simulated" }, ...sample.claims]
    : sample.claims;

  return (
    <>
      <PageHeading eyebrow="Insurer workspace" title="Coverage at a glance" description="Review policy funding and verified claim payouts from one clear view." action={<button className="button-primary" onClick={() => setMessage("Sample only: no policy was issued and no transaction was sent.")} type="button"><Icon name="plus" className="size-4" /> Issue sample policy</button>} />
      <SampleNotice>Values are illustrative. No policy was issued and no funds were moved.</SampleNotice>
      {message ? <p aria-live="polite" className="status-success mb-8 rounded-lg border px-4 py-3 text-sm">{message}</p> : null}
      <div className="mb-14 grid gap-x-8 gap-y-2 sm:grid-cols-3">
        <MetricCard label="Pool balance" value={formatAmount(sample.balanceUnits - payout)} detail="Sample funds available" icon="coin" />
        <MetricCard label="Policies issued" value="1,284" detail="Sample register" icon="file" />
        <MetricCard label="Paid this month" value={formatAmount(sample.paidUnits + payout)} detail="Sample verified payouts" icon="arrow" />
      </div>
      <div className="grid items-start gap-10 xl:grid-cols-[1.5fr_1fr] xl:gap-16">
        <Panel className="min-w-0" title="Verified claims" description="The chain confirms these payouts without showing private details." action={<button className="button-secondary whitespace-nowrap" onClick={() => setMessage("All visible claim entries are sample data.")} type="button">View all</button>}>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] border-collapse text-left">
              <thead><tr className="border-b border-rado-line font-mono text-xs uppercase tracking-[0.08em] text-rado-muted"><th className="pb-3 font-normal">Claim</th><th className="pb-3 font-normal">Policy</th><th className="pb-3 font-normal">Date</th><th className="pb-3 font-normal">Payout</th><th className="pb-3 font-normal">Status</th></tr></thead>
              <tbody>{claims.map((row) => <tr className={`border-b border-rado-line last:border-0 ${row.id === claim.claimId ? "motion-reveal" : ""}`} key={row.id}><td className="py-4 font-mono text-xs text-rado-ink">{row.id}</td><td className="py-4 font-mono text-xs text-rado-slate">{row.policy}</td><td className="py-4 text-xs text-rado-slate">{row.date}</td><td className="py-4 text-sm text-rado-ink">{row.amount}</td><td className="py-4"><Badge tone="success">{row.state}</Badge></td></tr>)}</tbody>
            </table>
          </div>
        </Panel>
        <Band eyebrow="Coverage pool" title={sample.policyCap} description="Sample total cap">
          <div className="h-1.5 overflow-hidden rounded-full bg-rado-card-border"><div className="h-full rounded-full bg-rado-green transition-[width] duration-500" style={{ width: `${utilization}%` }} /></div>
          <div className="mt-2 flex justify-between text-xs text-rado-muted"><span>{utilization}% sample utilization</span><span>Sample</span></div>
          <dl className="mt-6 divide-y divide-rado-line border-y border-rado-line">
            <div className="flex justify-between gap-4 py-3 text-sm"><dt className="text-rado-slate">Verification</dt><dd className="text-right text-rado-ink">Zero-knowledge proof</dd></div>
            <div className="flex justify-between gap-4 py-3 text-sm"><dt className="text-rado-slate">Claim review</dt><dd className="text-right text-rado-ink">Automated</dd></div>
            <div className="flex justify-between gap-4 py-3 text-sm"><dt className="text-rado-slate">Payout status</dt><dd className="text-right text-rado-green">{claim.settled ? "Simulated payout complete" : "Awaiting claim"}</dd></div>
          </dl>
        </Band>
      </div>
    </>
  );
}
