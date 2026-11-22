"use client";

import { useState } from "react";

import { getPublicChainSampleData } from "../data/public-chain-sample-data";
import { usePublicClaim } from "./ClaimSimulationProvider";
import { Icon } from "./icons";
import { Badge, MetricCard, PageHeading, Panel, SampleNotice } from "./ui";

const sample = getPublicChainSampleData();
const policyCap = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(Number(sample.policyCap) / 1_000_000);

export function PublicChainScreen() {
  const [filter, setFilter] = useState("");
  const claim = usePublicClaim();
  const newestFirst = [...sample.events].reverse();
  const events = claim.settled ? [{ id: claim.eventId, name: "ClaimSettled", block: claim.block }, ...newestFirst] : newestFirst;
  const visibleEvents = events.filter((event) => `${event.name} ${event.id}`.toLowerCase().includes(filter.toLowerCase()));

  return (
    <>
      <PageHeading eyebrow="Public chain view" title="The public record" description="Explore what anyone can verify on the local chain." action={<Badge tone="success">Local network</Badge>} />
      <SampleNotice>Public values below are synthetic and do not come from a live chain.</SampleNotice>
      <div className="mb-14 grid gap-x-8 gap-y-2 sm:grid-cols-3">
        <MetricCard label="Network" value="Rado Local" detail="Chain ID 31337" icon="chain" />
        <MetricCard label="Latest block" value={claim.settled ? claim.block : "#18,421"} detail="Sample block height" icon="blocks" />
        <MetricCard label="Policy cap" value={policyCap} detail="Public sample value" icon="coin" />
      </div>
      <div className="grid items-start gap-10 xl:grid-cols-[1.2fr_1fr] xl:gap-16">
        <Panel className="min-w-0" title="Public claim values" description="The six values visible to the verifier and the public.">
          <div>
            {sample.signals.map((signal, index) => <div className="grid gap-2 border-b border-rado-line py-3 last:border-0 sm:grid-cols-[1fr_1.2fr] sm:items-center" key={signal.name}><div className="flex items-center gap-3"><span className="font-mono text-xs text-rado-muted">0{index + 1}</span><span className="font-mono text-sm text-rado-ink">{signal.name}</span></div>{claim.settled ? <span className="motion-reveal overflow-hidden text-ellipsis font-mono text-xs text-rado-blue sm:text-right">{signal.value}</span> : <span className="font-mono text-xs text-rado-muted sm:text-right">Waiting for settlement</span>}</div>)}
          </div>
          <p className="mt-4 text-xs leading-5 text-rado-muted">The chain records values needed to verify a claim and settle a payout.</p>
        </Panel>
        <Panel className="min-w-0" title="Recent chain events" description="Sample events from the local explorer." action={<span className="text-rado-muted"><Icon name="search" /></span>}>
          <label className="sr-only" htmlFor="chain-search">Filter chain events</label>
          <input className="field mb-4" id="chain-search" onChange={(event) => setFilter(event.target.value)} placeholder="Filter by event or ID" value={filter} />
          <div>
            {visibleEvents.length ? visibleEvents.map((event) => <div className={`flex items-center gap-3 border-b border-rado-line py-3 last:border-0 ${event.id === claim.eventId ? "motion-reveal" : ""}`} key={event.id}><span className="text-rado-blue"><Icon name="arrow" className="size-4" /></span><div className="min-w-0 flex-1"><p className="text-sm text-rado-ink">{event.name}</p><p className="mt-0.5 truncate font-mono text-xs text-rado-muted">{event.id}</p></div><span className="whitespace-nowrap font-mono text-xs text-rado-slate">{event.block}</span></div>) : <p className="border-y border-rado-line px-4 py-6 text-center text-sm text-rado-slate">No events match that search.</p>}
          </div>
          <button className="button-secondary mt-4" onClick={() => setFilter("")} type="button">Reset view</button>
        </Panel>
      </div>
      <div className="panel-surface mt-14 flex flex-wrap items-center justify-between gap-3 py-6"><div><p className="text-base text-rado-ink">Transparent by design</p><p className="mt-1 text-sm text-rado-slate">Private files remain off-chain. This sample explorer shows only public values and events.</p></div><span className="font-mono text-xs text-rado-muted">Rado Local · 31337</span></div>
    </>
  );
}
