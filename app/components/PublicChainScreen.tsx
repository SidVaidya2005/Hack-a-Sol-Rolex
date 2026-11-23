"use client";

import { PUBLIC_SIGNALS } from "@rado/shared";
import { useEffect, useState } from "react";

import { formatAmount } from "../data/insurer-sample-data";
import { formatClaimDay, SIGNAL_LABELS } from "../data/public-signal-labels";
import { useChainLedger } from "../lib/use-chain-ledger";
import { Icon } from "./icons";
import { shortId } from "./RecordSession";
import { Badge, MetricCard, PageHeading, Panel } from "./ui";

const EVENT_FILTERS = ["All", "Claims", "Access", "Policy"] as const;
const EVENT_INFO: Record<string, { title: string; group: (typeof EVENT_FILTERS)[number] }> = {
  ClaimSettled: { title: "Claim paid", group: "Claims" },
  PolicyRegistered: { title: "Policy registered", group: "Policy" },
  HospitalRootUpdated: { title: "Approved hospitals updated", group: "Policy" },
  KeysRegistered: { title: "Wallet keys registered", group: "Access" },
  RecordAnchored: { title: "Encrypted record added", group: "Access" },
  AccessGranted: { title: "Access granted", group: "Access" },
  AccessRevoked: { title: "Access revoked", group: "Access" },
  RecordKeyRotated: { title: "Record key replaced", group: "Access" },
  RecordViewed: { title: "Record viewed", group: "Access" },
  BreakGlassInvoked: { title: "Emergency access used", group: "Access" },
  ResponderUpdated: { title: "Responder updated", group: "Access" },
};

/** Shows only what an outsider can read from the chain. */
export function PublicChainScreen() {
  const { ledger, error } = useChainLedger();
  const [filter, setFilter] = useState("");
  const [group, setGroup] = useState<(typeof EVENT_FILTERS)[number]>("All");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [copy, setCopy] = useState<{ id: string; ok: boolean } | null>(null);
  const events = ledger?.events ?? [];
  const latestClaim = ledger?.claims[0];
  const signalValues: Record<(typeof PUBLIC_SIGNALS)[number], string> | null = latestClaim
    ? {
        claimAmount: formatAmount(latestClaim.claimAmount),
        policyCommitment: latestClaim.policyCommitment.toString(),
        nullifier: latestClaim.nullifier.toString(),
        hospitalRoot: latestClaim.hospitalRoot.toString(),
        claimDay: formatClaimDay(latestClaim.claimDay),
        payoutAddress: latestClaim.payoutAddress,
      }
    : null;
  const search = filter.toLowerCase();
  const visibleEvents = events.filter(
    (event) =>
      (group === "All" || EVENT_INFO[event.name]?.group === group) &&
      `${EVENT_INFO[event.name]?.title ?? ""} ${event.name} ${event.txHash}`
        .toLowerCase()
        .includes(search),
  );

  useEffect(() => {
    if (!copy) return;
    const timeoutId = setTimeout(() => setCopy(null), 1600);
    return () => clearTimeout(timeoutId);
  }, [copy]);

  async function copyId(id: string, value: string) {
    try {
      await navigator.clipboard.writeText(value);
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
        description="Exactly what anyone can read from the local chain."
        status="live"
        action={<Badge tone="success">Local network</Badge>}
      />
      {error ? (
        <p className="status-error mb-8 rounded-lg border px-4 py-3 text-sm" role="alert">
          {error}
        </p>
      ) : null}
      <div className="mb-10 grid gap-x-8 gap-y-2 sm:grid-cols-3">
        <MetricCard label="Network" value="Rado Local" detail="Chain ID 31337" icon="chain" />
        <MetricCard
          label="Latest block"
          value={ledger ? `#${ledger.latestBlock.toLocaleString("en-IN")}` : "Loading…"}
          detail="Updates automatically"
          icon="blocks"
        />
        <MetricCard
          label="Policy caps"
          value={ledger ? formatAmount(ledger.totalCap) : "Loading…"}
          detail="Public total across policies"
          icon="coin"
        />
      </div>
      <div className="grid items-start gap-10 xl:grid-cols-[1.2fr_1fr] xl:gap-16">
        <Panel
          className="min-w-0"
          title="Public claim values"
          description="The six values from the latest settled claim."
        >
          <div>
            {PUBLIC_SIGNALS.map((name, index) => (
              <div
                className="grid gap-2 border-b border-rado-line py-3 last:border-0 sm:grid-cols-[1fr_1.2fr] sm:items-center"
                key={name}
              >
                <div className="flex items-center gap-3">
                  <span className="font-mono text-xs text-rado-muted">0{index + 1}</span>
                  <span className="min-w-0">
                    <span className="block text-sm text-rado-ink">{SIGNAL_LABELS[name]}</span>
                    <span className="block font-mono text-xs text-rado-muted">{name}</span>
                  </span>
                </div>
                {signalValues ? (
                  <span
                    className="motion-reveal overflow-hidden text-ellipsis font-mono text-xs text-rado-blue sm:text-right"
                    title={signalValues[name]}
                  >
                    {signalValues[name]}
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
          description="Live feed from the local chain."
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
            placeholder="Filter by event or transaction"
            value={filter}
          />
          <div>
            {visibleEvents.length ? (
              visibleEvents.map((event) => {
                const expanded = expandedId === event.id;
                const block = `#${event.blockNumber.toLocaleString("en-IN")}`;
                return (
                  <div className="border-b border-rado-line last:border-0" key={event.id}>
                    <button
                      aria-expanded={expanded}
                      aria-label={`${EVENT_INFO[event.name]?.title ?? event.name} at block ${block}`}
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
                          {event.name} · {shortId(event.txHash)}
                        </span>
                      </span>
                      <span className="whitespace-nowrap font-mono text-xs text-rado-slate">
                        {block}
                      </span>
                    </button>
                    {expanded ? (
                      <div className="motion-reveal pb-4 pl-7">
                        <p className="font-mono text-xs uppercase tracking-[0.08em] text-rado-muted">
                          Publicly visible
                        </p>
                        <dl className="mt-2 grid gap-1">
                          {event.fields.map(([name, value]) => (
                            <div className="flex min-w-0 justify-between gap-3 text-xs" key={name}>
                              <dt className="shrink-0 text-rado-slate">{name}</dt>
                              <dd
                                className="min-w-0 truncate font-mono text-rado-ink"
                                title={value}
                              >
                                {value}
                              </dd>
                            </div>
                          ))}
                        </dl>
                        <button
                          className="button-secondary mt-2"
                          onClick={() => copyId(event.id, event.txHash)}
                          type="button"
                        >
                          {copy?.id === event.id
                            ? copy.ok
                              ? "Copied"
                              : "Copy failed"
                            : "Copy transaction"}
                        </button>
                      </div>
                    ) : null}
                  </div>
                );
              })
            ) : (
              <p className="border-y border-rado-line px-4 py-6 text-center text-sm text-rado-slate">
                {events.length ? "No events match that search." : "No chain events yet."}
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
            Private files remain off-chain. This view shows only public values and events.
          </p>
        </div>
        <span className="font-mono text-xs text-rado-muted">Rado Local · 31337</span>
      </div>
    </>
  );
}
