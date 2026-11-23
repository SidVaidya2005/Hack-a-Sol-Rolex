"use client";

import { useEffect, useState } from "react";

import { formatAmount } from "../data/insurer-sample-data";
import { getPublicChainSampleData } from "../data/public-chain-sample-data";
import { formatClaimDay, SIGNAL_LABELS } from "../data/public-signal-labels";
import { usePublicClaim } from "./ClaimSimulationProvider";
import { Icon } from "./icons";
import { Badge, MetricCard, PageHeading, Panel } from "./ui";

const sample = getPublicChainSampleData();
const policyCap = formatAmount(BigInt(sample.policyCap));
const EVENT_FILTERS = ["All", "Claims", "Access", "Policy"] as const;
const EVENT_INFO: Record<
  string,
  { title: string; group: (typeof EVENT_FILTERS)[number]; shows: string }
> = {
  ClaimSettled: {
    title: "Claim paid",
    group: "Claims",
    shows:
      "Amount, policy fingerprint, one-time claim marker, approved hospitals fingerprint, claim date, and payout address.",
  },
  PolicyRegistered: {
    title: "Policy registered",
    group: "Policy",
    shows: "Policy fingerprint, start date, and total cap.",
  },
  AccessGranted: {
    title: "Doctor access granted",
    group: "Access",
    shows: "Patient address, doctor address, expiry, and the encrypted file's fingerprint.",
  },
  AccessRevoked: {
    title: "Doctor access revoked",
    group: "Access",
    shows: "Patient address and removed doctor address.",
  },
  RecordKeyRotated: {
    title: "Record key replaced",
    group: "Access",
    shows: "The new encrypted file's fingerprint and storage ID.",
  },
  RecordViewed: {
    title: "Record viewed",
    group: "Access",
    shows: "Record reference, viewer address, and time.",
  },
};

export function PublicChainScreen() {
  const [filter, setFilter] = useState("");
  const [group, setGroup] = useState<(typeof EVENT_FILTERS)[number]>("All");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [copy, setCopy] = useState<{ id: string; ok: boolean } | null>(null);
  const claim = usePublicClaim();
  const events = [...claim.events, ...[...sample.events].reverse()];
  const visibleEvents = events.filter(
    (event) =>
      (group === "All" || EVENT_INFO[event.name]?.group === group) &&
      `${EVENT_INFO[event.name]?.title ?? ""} ${event.name} ${event.id}`
        .toLowerCase()
        .includes(filter.toLowerCase()),
  );

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
      <PageHeading
        eyebrow="Public chain view"
        title="The public record"
        description="Explore what anyone can verify on the local chain."
        status="simulated"
        action={<Badge tone="success">Local network</Badge>}
      />
      <div className="mb-10 grid gap-x-8 gap-y-2 sm:grid-cols-3">
        <MetricCard label="Network" value="Rado Local" detail="Chain ID 31337" icon="chain" />
        <MetricCard
          label="Latest block"
          value={claim.latestBlock}
          detail="Block height"
          icon="blocks"
        />
        <MetricCard label="Policy cap" value={policyCap} detail="Public value" icon="coin" />
      </div>
      <div className="grid items-start gap-10 xl:grid-cols-[1.2fr_1fr] xl:gap-16">
        <Panel
          className="min-w-0"
          title="Public claim values"
          description="The six values visible to the verifier and the public."
        >
          <div>
            {sample.signals.map((signal, index) => (
              <div
                className="grid gap-2 border-b border-rado-line py-3 last:border-0 sm:grid-cols-[1fr_1.2fr] sm:items-center"
                key={signal.name}
              >
                <div className="flex items-center gap-3">
                  <span className="font-mono text-xs text-rado-muted">0{index + 1}</span>
                  <span className="min-w-0">
                    <span className="block text-sm text-rado-ink">
                      {SIGNAL_LABELS[signal.name]}
                    </span>
                    <span className="block font-mono text-xs text-rado-muted">{signal.name}</span>
                  </span>
                </div>
                {claim.settled ? (
                  <span className="motion-reveal overflow-hidden text-ellipsis font-mono text-xs text-rado-blue sm:text-right">
                    {signal.name === "claimAmount"
                      ? formatAmount(claim.amount)
                      : signal.name === "claimDay"
                        ? formatClaimDay(signal.value)
                        : signal.value}
                  </span>
                ) : (
                  <span className="font-mono text-xs text-rado-muted sm:text-right">
                    Waiting for settlement
                  </span>
                )}
              </div>
            ))}
          </div>
          <p className="mt-4 text-xs leading-5 text-rado-muted">
            The chain records values needed to verify a claim and settle a payout.
          </p>
        </Panel>
        <Panel
          className="min-w-0"
          title="Recent chain events"
          description="Simulated feed from the local explorer."
          action={
            <span
              aria-live="polite"
              className="flex items-center gap-2 whitespace-nowrap font-mono text-xs text-rado-muted"
            >
              <span className="motion-pulse size-1.5 rounded-full bg-rado-green" />
              {events.length} events
            </span>
          }
        >
          <div aria-label="Filter by event type" className="mb-3 flex flex-wrap gap-1" role="group">
            {EVENT_FILTERS.map((name) => (
              <button
                aria-pressed={group === name}
                className="nav-link"
                key={name}
                onClick={() => setGroup(name)}
                type="button"
              >
                {name}
              </button>
            ))}
          </div>
          <label className="sr-only" htmlFor="chain-search">
            Filter chain events
          </label>
          <input
            className="field mb-4"
            id="chain-search"
            onChange={(event) => setFilter(event.target.value)}
            placeholder="Filter by event or ID"
            value={filter}
          />
          <div>
            {visibleEvents.length ? (
              visibleEvents.map((event) => {
                const expanded = expandedId === event.id;
                return (
                  <div
                    className={`border-b border-rado-line last:border-0 ${event.id.startsWith("sim:") ? "motion-reveal" : ""}`}
                    key={event.id}
                  >
                    <button
                      aria-expanded={expanded}
                      aria-label={`${EVENT_INFO[event.name]?.title ?? event.name} at block ${event.block}`}
                      className="-mx-2 flex w-[calc(100%+1rem)] items-center gap-3 rounded px-2 py-3 text-left transition-colors hover:bg-rado-hover"
                      onClick={() => setExpandedId(expanded ? null : event.id)}
                      type="button"
                    >
                      <span
                        className={`text-rado-blue transition-transform duration-200 ${expanded ? "rotate-90" : ""}`}
                      >
                        <Icon name="arrow" className="size-4" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm text-rado-ink">
                          {EVENT_INFO[event.name]?.title ?? event.name}
                        </span>
                        <span className="mt-0.5 block truncate font-mono text-xs text-rado-muted">
                          {event.name} · {event.id}
                        </span>
                      </span>
                      <span className="whitespace-nowrap font-mono text-xs text-rado-slate">
                        {event.block}
                      </span>
                    </button>
                    {expanded ? (
                      <div className="motion-reveal pb-4 pl-7">
                        <p className="font-mono text-xs uppercase tracking-[0.08em] text-rado-muted">
                          Publicly visible
                        </p>
                        <p className="mt-1 text-sm leading-6 text-rado-slate">
                          {EVENT_INFO[event.name]?.shows}
                        </p>
                        <button
                          className="button-secondary mt-2"
                          onClick={() => copyId(event.id)}
                          type="button"
                        >
                          {copy?.id === event.id ? (copy.ok ? "Copied" : "Copy failed") : "Copy ID"}
                        </button>
                      </div>
                    ) : null}
                  </div>
                );
              })
            ) : (
              <p className="border-y border-rado-line px-4 py-6 text-center text-sm text-rado-slate">
                No events match that search.
              </p>
            )}
          </div>
          <button
            className="button-secondary mt-4"
            onClick={() => {
              setFilter("");
              setGroup("All");
              setExpandedId(null);
            }}
            type="button"
          >
            Reset view
          </button>
        </Panel>
      </div>
      <div className="panel-surface mt-14 flex flex-wrap items-center justify-between gap-3 py-6">
        <div>
          <p className="text-base text-rado-ink">Transparent by design</p>
          <p className="mt-1 text-sm text-rado-slate">
            Private files remain off-chain. Only public values and events appear here.
          </p>
        </div>
        <span className="font-mono text-xs text-rado-muted">Rado Local · 31337</span>
      </div>
    </>
  );
}
