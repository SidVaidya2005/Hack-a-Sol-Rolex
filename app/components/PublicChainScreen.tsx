"use client";

import { useEffect, useState } from "react";

import { getPublicChainSampleData } from "../data/public-chain-sample-data";
import { usePublicClaim } from "./ClaimSimulationProvider";
import { Icon } from "./icons";
import { Badge, MetricCard, PageHeading, Panel, SampleNotice } from "./ui";

const sample = getPublicChainSampleData();
const policyCap = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(Number(sample.policyCap) / 1_000_000);
const EVENT_FILTERS = ["All", "Claims", "Access", "Policy"] as const;
const EVENT_INFO: Record<string, { group: (typeof EVENT_FILTERS)[number]; shows: string }> = {
  ClaimSettled: { group: "Claims", shows: "Amount, policy commitment, nullifier, hospital root, claim day, and payout address." },
  PolicyRegistered: { group: "Policy", shows: "Policy commitment, start day, and total cap." },
  AccessGranted: { group: "Access", shows: "Patient address, doctor address, expiry, and updated bundle hash." },
  AccessRevoked: { group: "Access", shows: "Patient address and removed doctor address." },
  RecordKeyRotated: { group: "Access", shows: "New encrypted bundle hash and content ID." },
  RecordViewed: { group: "Access", shows: "Record reference, viewer address, and time." },
};

export function PublicChainScreen() {
  const [filter, setFilter] = useState("");
  const [group, setGroup] = useState<(typeof EVENT_FILTERS)[number]>("All");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [copy, setCopy] = useState<{ id: string; ok: boolean } | null>(null);
  const claim = usePublicClaim();
  const events = [...claim.events, ...[...sample.events].reverse()];
  const visibleEvents = events.filter((event) => (group === "All" || EVENT_INFO[event.name]?.group === group) && `${event.name} ${event.id}`.toLowerCase().includes(filter.toLowerCase()));

  useEffect(() => {
    if (!copy) return;
    const timeoutId = setTimeout(() => setCopy(null), 1600);
    return () => clearTimeout(timeoutId);
  }, [copy]);

  async function copyId(id: string) {
    try {
      await navigator.clipboard.writeText(id);
      setCopy({ id, ok: true });
    } catch {
      setCopy({ id, ok: false });
    }
  }

  return (
    <>
      <PageHeading eyebrow="Public chain view" title="The public record" description="Explore what anyone can verify on the local chain." action={<Badge tone="success">Local network</Badge>} />
      <SampleNotice>Public values below are synthetic and do not come from a live chain.</SampleNotice>
      <div className="mb-14 grid gap-x-8 gap-y-2 sm:grid-cols-3">
        <MetricCard label="Network" value="Rado Local" detail="Chain ID 31337" icon="chain" />
        <MetricCard label="Latest block" value={claim.latestBlock} detail="Sample block height" icon="blocks" />
        <MetricCard label="Policy cap" value={policyCap} detail="Public sample value" icon="coin" />
      </div>
      <div className="grid items-start gap-10 xl:grid-cols-[1.2fr_1fr] xl:gap-16">
        <Panel className="min-w-0" title="Public claim values" description="The six values visible to the verifier and the public.">
          <div>
            {sample.signals.map((signal, index) => <div className="grid gap-2 border-b border-rado-line py-3 last:border-0 sm:grid-cols-[1fr_1.2fr] sm:items-center" key={signal.name}><div className="flex items-center gap-3"><span className="font-mono text-xs text-rado-muted">0{index + 1}</span><span className="font-mono text-sm text-rado-ink">{signal.name}</span></div>{claim.settled ? <span className="motion-reveal overflow-hidden text-ellipsis font-mono text-xs text-rado-blue sm:text-right">{signal.name === "claimAmount" ? claim.amount.toString() : signal.value}</span> : <span className="font-mono text-xs text-rado-muted sm:text-right">Waiting for settlement</span>}</div>)}
          </div>
          <p className="mt-4 text-xs leading-5 text-rado-muted">The chain records values needed to verify a claim and settle a payout.</p>
        </Panel>
        <Panel className="min-w-0" title="Recent chain events" description="Simulated feed from the local explorer." action={<span aria-live="polite" className="flex items-center gap-2 whitespace-nowrap font-mono text-xs text-rado-muted"><span className="motion-pulse size-1.5 rounded-full bg-rado-green" />{events.length} events</span>}>
          <div aria-label="Filter by event type" className="mb-3 flex flex-wrap gap-1" role="group">
            {EVENT_FILTERS.map((name) => <button aria-pressed={group === name} className="nav-link" key={name} onClick={() => setGroup(name)} type="button">{name}</button>)}
          </div>
          <label className="sr-only" htmlFor="chain-search">Filter chain events</label>
          <input className="field mb-4" id="chain-search" onChange={(event) => setFilter(event.target.value)} placeholder="Filter by event or ID" value={filter} />
          <div>
            {visibleEvents.length ? visibleEvents.map((event) => {
              const expanded = expandedId === event.id;
              return (
                <div className={`border-b border-rado-line last:border-0 ${event.id.startsWith("sim:") ? "motion-reveal" : ""}`} key={event.id}>
                  <button aria-expanded={expanded} aria-label={`${event.name} at block ${event.block}`} className="flex w-full items-center gap-3 py-3 text-left" onClick={() => setExpandedId(expanded ? null : event.id)} type="button">
                    <span className={`text-rado-blue transition-transform duration-200 ${expanded ? "rotate-90" : ""}`}><Icon name="arrow" className="size-4" /></span>
                    <span className="min-w-0 flex-1"><span className="block text-sm text-rado-ink">{event.name}</span><span className="mt-0.5 block truncate font-mono text-xs text-rado-muted">{event.id}</span></span>
                    <span className="whitespace-nowrap font-mono text-xs text-rado-slate">{event.block}</span>
                  </button>
                  {expanded ? (
                    <div className="motion-reveal pb-4 pl-7">
                      <p className="font-mono text-xs uppercase tracking-[0.08em] text-rado-muted">Publicly visible</p>
                      <p className="mt-1 text-sm leading-6 text-rado-slate">{EVENT_INFO[event.name]?.shows}</p>
                      <button className="button-secondary mt-2" onClick={() => copyId(event.id)} type="button">{copy?.id === event.id ? (copy.ok ? "Copied" : "Copy failed") : "Copy ID"}</button>
                    </div>
                  ) : null}
                </div>
              );
            }) : <p className="border-y border-rado-line px-4 py-6 text-center text-sm text-rado-slate">No events match that search.</p>}
          </div>
          <button className="button-secondary mt-4" onClick={() => { setFilter(""); setGroup("All"); setExpandedId(null); }} type="button">Reset view</button>
        </Panel>
      </div>
      <div className="panel-surface mt-14 flex flex-wrap items-center justify-between gap-3 py-6"><div><p className="text-base text-rado-ink">Transparent by design</p><p className="mt-1 text-sm text-rado-slate">Private files remain off-chain. This sample explorer shows only public values and events.</p></div><span className="font-mono text-xs text-rado-muted">Rado Local · 31337</span></div>
    </>
  );
}
