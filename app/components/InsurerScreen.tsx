"use client";

import { SAMPLE_HOSPITALS } from "@rado/shared";
import { useEffect, useRef, useState } from "react";

import { formatAmount, getInsurerSampleData } from "../data/insurer-sample-data";
import { usePublicClaim } from "./ClaimSimulationProvider";
import { Icon } from "./icons";
import { Badge, Band, MetricCard, PageHeading, Panel, SampleNotice } from "./ui";

const sample = getInsurerSampleData();
const SORTS = {
  newest: {
    label: "Newest first",
    compare: (a: ClaimRow, b: ClaimRow) => Date.parse(b.date) - Date.parse(a.date),
  },
  oldest: {
    label: "Oldest first",
    compare: (a: ClaimRow, b: ClaimRow) => Date.parse(a.date) - Date.parse(b.date),
  },
  highest: {
    label: "Highest payout",
    compare: (a: ClaimRow, b: ClaimRow) => Number(b.amountUnits - a.amountUnits),
  },
  lowest: {
    label: "Lowest payout",
    compare: (a: ClaimRow, b: ClaimRow) => Number(a.amountUnits - b.amountUnits),
  },
};

type ClaimRow = (typeof sample.claims)[number];
type SortId = keyof typeof SORTS;

export function InsurerScreen() {
  const [message, setMessage] = useState("");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortId>("newest");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const drawerRef = useRef<HTMLDialogElement>(null);
  const claim = usePublicClaim();
  const payout = claim.settled ? claim.amount : 0n;
  const utilization = Number(((sample.usedCapUnits + payout) * 100n) / sample.capUnits);
  const claims: ClaimRow[] = claim.settled
    ? [
        {
          id: claim.claimId,
          policy: claim.policy,
          amount: formatAmount(claim.amount),
          amountUnits: claim.amount,
          date: claim.date,
          state: "Verified · simulated",
        },
        ...sample.claims,
      ]
    : sample.claims;
  const search = query.trim().toLowerCase();
  const visibleClaims = claims
    .filter((row) => `${row.id} ${row.policy}`.toLowerCase().includes(search))
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
        description="Review policy funding and verified claim payouts from one clear view."
        action={
          <button
            className="button-primary"
            onClick={() =>
              setMessage("Sample only: no policy was issued and no transaction was sent.")
            }
            type="button"
          >
            <Icon name="plus" className="size-4" /> Issue sample policy
          </button>
        }
      />
      <SampleNotice>
        Values are illustrative. No policy was issued and no funds were moved.
      </SampleNotice>
      {message ? (
        <p
          aria-live="polite"
          className="status-success motion-reveal mb-8 rounded-lg border px-4 py-3 text-sm"
        >
          {message}
        </p>
      ) : null}
      <div className="mb-14 grid gap-x-8 gap-y-2 sm:grid-cols-3">
        <MetricCard
          label="Pool balance"
          value={formatAmount(sample.balanceUnits - payout)}
          detail="Sample funds available"
          icon="coin"
        />
        <MetricCard label="Policies issued" value="1,284" detail="Sample register" icon="file" />
        <MetricCard
          label="Paid this month"
          value={formatAmount(sample.paidUnits + payout)}
          detail="Sample verified payouts"
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
                placeholder="Filter by claim or policy"
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
                    className={`border-b border-rado-line transition-colors last:border-0 hover:bg-rado-stone-wash ${row.id === claim.claimId ? "motion-reveal" : ""}`}
                    key={row.id}
                  >
                    <td className="py-4">
                      <button
                        aria-label={`Open ${row.id} details`}
                        className="nav-link !rounded !p-0 font-mono !text-xs !text-rado-ink underline underline-offset-4"
                        onClick={() => setSelectedId(row.id)}
                        type="button"
                      >
                        {row.id}
                      </button>
                    </td>
                    <td className="py-4 font-mono text-xs text-rado-slate">{row.policy}</td>
                    <td className="py-4 text-xs text-rado-slate">{row.date}</td>
                    <td className="py-4 text-sm text-rado-ink">{row.amount}</td>
                    <td className="py-4">
                      <Badge tone="success">{row.state}</Badge>
                    </td>
                  </tr>
                ))}
                {visibleClaims.length ? null : (
                  <tr>
                    <td className="py-6 text-center text-sm text-rado-slate" colSpan={5}>
                      No claims match that filter.
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
          title={sample.policyCap}
          description="Sample total cap"
        >
          <div className="h-1.5 overflow-hidden rounded-full bg-rado-card-border">
            <div
              className="h-full rounded-full bg-rado-green transition-[width] duration-500"
              style={{ width: `${utilization}%` }}
            />
          </div>
          <div className="mt-2 flex justify-between text-xs text-rado-muted">
            <span>{utilization}% sample utilization</span>
            <span>Sample</span>
          </div>
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
              <dt className="text-rado-slate">Payout status</dt>
              <dd className="text-right text-rado-green">
                {claim.settled ? "Simulated payout complete" : "Awaiting claim"}
              </dd>
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
                  {selected.id}
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
              <Badge tone="success">{selected.state}</Badge>
            </div>
            <dl className="mt-6 divide-y divide-rado-line border-y border-rado-line">
              {[
                ["Policy", selected.policy],
                ["Payout", selected.amount],
                ["Claim date", selected.date],
                ["Paid to", SAMPLE_HOSPITALS[0].name],
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
            <p className="mt-auto pt-6 text-xs text-rado-muted">
              Sample data. No real claim or payment exists.
            </p>
          </div>
        ) : null}
      </dialog>
    </>
  );
}
