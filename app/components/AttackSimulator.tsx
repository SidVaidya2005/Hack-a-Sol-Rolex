"use client";

import { SAMPLE_POLICY } from "@rado/shared";
import { useEffect, useState } from "react";

import { formatAmount } from "../data/insurer-sample-data";
import { Badge, Panel } from "./ui";

const ATTACKS = [
  {
    id: "hospital",
    name: "Unapproved hospital",
    tamper: "Uses a hospital key outside the approved list",
    layer: "Proof",
    reason: "This hospital is not on the approved list.",
  },
  {
    id: "expired",
    name: "Expired policy",
    tamper: "Dates the claim after the policy ended",
    layer: "Proof",
    reason: "This policy has expired.",
  },
  {
    id: "uncovered",
    name: "Uncovered procedure",
    tamper: "Claims a procedure outside the policy",
    layer: "Proof",
    reason: "This procedure is not covered.",
  },
  {
    id: "limit",
    name: "Over per-claim limit",
    tamper: "Claims more than the policy's private limit",
    layer: "Proof",
    reason: "This amount is above the per-claim limit.",
  },
  {
    id: "cap",
    name: "Over total cap",
    tamper: `Pushes total payouts past ${formatAmount(SAMPLE_POLICY.totalCap)}`,
    layer: "Contract",
    reason: "This claim would exceed the policy's total cap.",
  },
  {
    id: "signature",
    name: "Forged signature",
    tamper: "Changes the claim after the patient signed",
    layer: "Proof",
    reason: "A signature does not match this claim.",
  },
  {
    id: "replay",
    name: "Replay",
    tamper: "Resubmits a nullifier that was already used",
    layer: "Contract",
    reason: "This claim was already submitted.",
  },
] as const;

type AttackId = (typeof ATTACKS)[number]["id"];

export function AttackSimulator() {
  const [queue, setQueue] = useState<AttackId[]>([]);
  const [blocked, setBlocked] = useState<AttackId[]>([]);
  const active = queue[0];

  useEffect(() => {
    if (!active) return;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const timeoutId = setTimeout(
      () => {
        setBlocked((current) => [...current, active]);
        setQueue((current) => current.slice(1));
      },
      reducedMotion ? 80 : 450,
    );
    return () => clearTimeout(timeoutId);
  }, [active]);

  const runAll = () =>
    setQueue((current) => [
      ...current,
      ...ATTACKS.map(({ id }) => id).filter((id) => !blocked.includes(id) && !current.includes(id)),
    ]);

  return (
    <div aria-label="Attack simulator" className="mt-14" role="group">
      <Panel
        title="Attack simulator"
        description="Try to cheat the claim and see where each attempt stops."
        action={
          <span aria-live="polite" className="whitespace-nowrap font-mono text-xs text-rado-muted">
            {blocked.length} of {ATTACKS.length} blocked
          </span>
        }
      >
        <ul className="divide-y divide-rado-line border-b border-rado-line">
          {ATTACKS.map((attack) => {
            const isBlocked = blocked.includes(attack.id);
            const queued = queue.includes(attack.id);
            return (
              <li
                className="grid gap-3 py-4 sm:grid-cols-[1fr_auto] sm:items-center"
                key={attack.id}
              >
                <div className="min-w-0">
                  <p className="text-base text-rado-ink">{attack.name}</p>
                  <p className="mt-0.5 text-xs text-rado-slate">{attack.tamper}</p>
                  {isBlocked ? (
                    <p className="motion-reveal mt-1 text-sm text-rado-error">{attack.reason}</p>
                  ) : null}
                </div>
                {isBlocked ? (
                  <span className="motion-reveal">
                    <Badge tone="warning">Blocked by {attack.layer.toLowerCase()}</Badge>
                  </span>
                ) : (
                  <button
                    aria-label={`Try ${attack.name} attack`}
                    className="button-pill-outline justify-self-start whitespace-nowrap disabled:opacity-50 sm:justify-self-end"
                    disabled={queued}
                    onClick={() => setQueue((current) => [...current, attack.id])}
                    type="button"
                  >
                    {active === attack.id ? (
                      <span className="motion-pulse">Checking…</span>
                    ) : queued ? (
                      "Queued"
                    ) : (
                      "Try attack"
                    )}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
        <div className="mt-5 flex flex-wrap items-center gap-6">
          <button
            className="button-primary"
            disabled={
              blocked.length === ATTACKS.length || queue.length === ATTACKS.length - blocked.length
            }
            onClick={runAll}
            type="button"
          >
            Run all attacks
          </button>
          <button
            className="button-secondary"
            disabled={!blocked.length || queue.length > 0}
            onClick={() => setBlocked([])}
            type="button"
          >
            Reset attacks
          </button>
        </div>
        <p className="mt-4 text-xs leading-5 text-rado-muted">
          Simulated outcomes. No real circuit or contract ran, and no claim state or funds changed.
        </p>
      </Panel>
    </div>
  );
}
