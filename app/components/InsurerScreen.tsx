"use client";

import { useEffect, useRef, useState } from "react";

import { formatAmount } from "../data/insurer-sample-data";
import { formatClaimDay } from "../data/public-signal-labels";
import type { SettledClaim } from "../lib/settlement";
import { useChainLedger } from "../lib/use-chain-ledger";
import { Icon } from "./icons";
import { InsurerPolicyPanel } from "./InsurerPolicyPanel";
import { shortId } from "./RecordSession";
import { Badge, Band, MetricCard, PageHeading, Panel } from "./ui";

const order = (a: bigint, b: bigint) => (a < b ? -1 : a > b ? 1 : 0);
const SORTS = {
  newest: {
    label: "Newest first",
    compare: (a: SettledClaim, b: SettledClaim) => order(b.blockNumber, a.blockNumber),
  },
  oldest: {
    label: "Oldest first",
    compare: (a: SettledClaim, b: SettledClaim) => order(a.blockNumber, b.blockNumber),
  },
  highest: {
    label: "Highest payout",
    compare: (a: SettledClaim, b: SettledClaim) => order(b.claimAmount, a.claimAmount),
  },
  lowest: {
    label: "Lowest payout",
    compare: (a: SettledClaim, b: SettledClaim) => order(a.claimAmount, b.claimAmount),
  },
};

type SortId = keyof typeof SORTS;

const hexId = (value: bigint) => shortId(`0x${value.toString(16).padStart(64, "0")}`);

/** Reads only public chain data. It has no access to private claim state. */
export function InsurerScreen() {
  const { ledger, error } = useChainLedger();
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortId>("newest");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const drawerRef = useRef<HTMLDialogElement>(null);
  const claims = ledger?.claims ?? [];
  const totalCap = ledger?.totalCap ?? 0n;
  const totalPaid = ledger?.totalPaid ?? 0n;
  const utilization = totalCap > 0n ? Number((totalPaid * 100n) / totalCap) : 0;
  const search = query.trim().toLowerCase();
  const visibleClaims = claims
    .filter((row) =>
      `${hexId(row.nullifier)} ${hexId(row.policyCommitment)} ${row.payoutAddress}`
        .toLowerCase()
        .includes(search),
    )
    .sort(SORTS[sort].compare);
  const selected = claims.find((row) => row.id === selectedId);

  useEffect(() => {
    const drawer = drawerRef.current;
    if (!drawer) return;
    if (selectedId && !drawer.open) drawer.showModal();
    if (!selectedId && drawer.open) drawer.close();
  }, [selectedId]);

  return (
    <>
      <PageHeading
        eyebrow="Insurer workspace"
        title="Coverage at a glance"
        description="Live policy funding and verified payouts, read from the local chain."
        status="live"
      />
      {error ? (
        <p className="status-error mb-8 rounded-lg border px-4 py-3 text-sm" role="alert">
          {error}
        </p>
      ) : null}
      <InsurerPolicyPanel />
      <div className="mb-10 grid gap-x-8 gap-y-2 sm:grid-cols-3">
        <MetricCard
          label="Pool balance"
          value={ledger ? formatAmount(ledger.poolBalance) : "Loading…"}
          detail="Demo tokens available"
          icon="coin"
        />
        <MetricCard
          label="Policies issued"
          value={ledger ? ledger.policies.length.toString() : "Loading…"}
          detail="Registered on-chain"
          icon="file"
        />
        <MetricCard
          label="Total paid"
          value={ledger ? formatAmount(totalPaid) : "Loading…"}
          detail="Verified payouts"
          icon="arrow"
        />
      </div>
      <div className="grid items-start gap-10 xl:grid-cols-[1.5fr_1fr] xl:gap-16">
        <Panel
          className="min-w-0"
          title="Verified claims"
          description="The chain confirms these payouts without showing private details."
          action={
            <button
              className="button-secondary whitespace-nowrap"
              disabled={!query && sort === "newest"}
              onClick={() => {
                setQuery("");
                setSort("newest");
              }}
              type="button"
            >
              Clear
            </button>
          }
        >
          <div className="mb-5 grid gap-3 sm:grid-cols-[1fr_200px]">
            <div>
              <label className="sr-only" htmlFor="claim-search">
                Filter claims
              </label>
              <input
                className="field"
                id="claim-search"
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Filter by claim, policy, or payee"
                value={query}
              />
            </div>
            <div>
              <label className="sr-only" htmlFor="claim-sort">
                Sort claims
              </label>
              <select
                className="field"
                id="claim-sort"
                onChange={(event) => setSort(event.target.value as SortId)}
                value={sort}
              >
                {Object.entries(SORTS).map(([id, option]) => (
                  <option key={id} value={id}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] border-collapse text-left">
              <thead>
                <tr className="border-b border-rado-line font-mono text-xs uppercase tracking-[0.08em] text-rado-muted">
                  <th className="pb-3 font-normal">Claim</th>
                  <th className="pb-3 font-normal">Policy</th>
                  <th className="pb-3 font-normal">Date</th>
                  <th className="pb-3 font-normal">Payout</th>
                  <th className="pb-3 font-normal">Status</th>
                </tr>
              </thead>
              <tbody>
                {visibleClaims.map((row) => (
                  <tr
                    className="border-b border-rado-line transition-colors last:border-0 hover:bg-rado-hover"
                    key={row.id}
                  >
                    <td className="py-4">
                      <button
                        aria-label={`Open claim ${hexId(row.nullifier)} details`}
                        className="nav-link !rounded !p-0 font-mono !text-xs !text-rado-ink underline underline-offset-4 hover:!bg-transparent hover:decoration-2"
                        onClick={() => setSelectedId(row.id)}
                        type="button"
                      >
                        {hexId(row.nullifier)}
                      </button>
                    </td>
                    <td className="py-4 font-mono text-xs text-rado-slate">
                      {hexId(row.policyCommitment)}
                    </td>
                    <td className="py-4 text-xs text-rado-slate">{formatClaimDay(row.claimDay)}</td>
                    <td className="py-4 text-sm text-rado-ink">{formatAmount(row.claimAmount)}</td>
                    <td className="py-4">
                      <Badge tone="success">Verified · paid</Badge>
                    </td>
                  </tr>
                ))}
                {visibleClaims.length ? null : (
                  <tr>
                    <td className="py-6 text-center text-sm text-rado-slate" colSpan={5}>
                      {claims.length ? "No claims match that filter." : "No claims settled yet."}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Panel>
        <Band
          className="min-w-0"
          eyebrow="Coverage pool"
          title={formatAmount(totalCap)}
          description="Total cap across registered policies"
        >
          <div className="h-1.5 overflow-hidden rounded-full bg-rado-card-border">
            <div
              className="h-full rounded-full bg-rado-green transition-[width] duration-500"
              style={{ width: `${utilization}%` }}
            />
          </div>
          <p className="mt-2 text-xs text-rado-muted">{utilization}% used</p>
          <dl className="mt-6 divide-y divide-rado-line border-y border-rado-line">
            <div className="flex justify-between gap-4 py-3 text-sm">
              <dt className="text-rado-slate">Verification</dt>
              <dd className="text-right text-rado-ink">Zero-knowledge proof</dd>
            </div>
            <div className="flex justify-between gap-4 py-3 text-sm">
              <dt className="text-rado-slate">Claim review</dt>
              <dd className="text-right text-rado-ink">Automated</dd>
            </div>
            <div className="flex justify-between gap-4 py-3 text-sm">
              <dt className="text-rado-slate">Claims paid</dt>
              <dd className="text-right text-rado-green">{claims.length}</dd>
            </div>
          </dl>
        </Band>
      </div>
      <dialog
        aria-labelledby="claim-drawer-title"
        className="drawer"
        onClose={() => setSelectedId(null)}
        ref={drawerRef}
      >
        {selected ? (
          <div className="flex min-h-full flex-col p-6 sm:p-8">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="font-mono text-xs uppercase tracking-[0.08em] text-rado-muted">
                  Claim details
                </p>
                <h2 className="mt-3 font-mono text-2xl text-rado-ink" id="claim-drawer-title">
                  {hexId(selected.nullifier)}
                </h2>
              </div>
              <button
                className="button-secondary"
                onClick={() => setSelectedId(null)}
                type="button"
              >
                Close
              </button>
            </div>
            <div className="mt-5">
              <Badge tone="success">Verified · paid</Badge>
            </div>
            <dl className="mt-6 divide-y divide-rado-line border-y border-rado-line">
              {[
                ["Policy", hexId(selected.policyCommitment)],
                ["Payout", formatAmount(selected.claimAmount)],
                ["Claim date", formatClaimDay(selected.claimDay)],
                ["Paid to", shortId(selected.payoutAddress)],
                ["Block", selected.blockNumber.toString()],
                ["Verification", "Zero-knowledge proof"],
              ].map(([label, value]) => (
                <div className="flex justify-between gap-4 py-3 text-sm" key={label}>
                  <dt className="text-rado-slate">{label}</dt>
                  <dd className="text-right text-rado-ink">{value}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-5 flex items-start gap-2 text-sm leading-6 text-rado-slate">
              <Icon name="lock" className="mt-1 size-4" />
              Private health details are not part of this claim view.
            </p>
            <p className="mt-auto pt-6 text-xs text-rado-muted">Demo tokens with no real value.</p>
          </div>
        ) : null}
      </dialog>
    </>
  );
}
