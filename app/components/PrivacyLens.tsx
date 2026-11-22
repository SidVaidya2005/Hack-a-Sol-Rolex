"use client";

import { SAMPLE_POLICY } from "@rado/shared";
import { useState } from "react";

import { formatAmount } from "../data/insurer-sample-data";
import { getPublicChainSampleData } from "../data/public-chain-sample-data";
import { usePublicClaim } from "./ClaimSimulationProvider";
import { Icon } from "./icons";
import { Panel } from "./ui";

const VIEWERS = ["Patient", "Hospital", "Insurer", "Public"] as const;
type Viewer = (typeof VIEWERS)[number];

const signals = Object.fromEntries(
  getPublicChainSampleData().signals.map(({ name, value }) => [name, value]),
);

/** Only rendered on the Patient and Hospital screens, which may already hold the private values passed in. */
export function PrivacyLens({
  procedure,
  visit,
  amount,
  limitKnown = true,
}: {
  procedure: string;
  visit: string;
  amount: bigint;
  limitKnown?: boolean;
}) {
  const [viewer, setViewer] = useState<Viewer>("Insurer");
  const { settled } = usePublicClaim();
  const outsider = viewer === "Insurer" || viewer === "Public";

  const fields: {
    label: string;
    value: string;
    visibleTo: readonly Viewer[];
    afterSettlement?: boolean;
  }[] = [
    { label: "Procedure", value: procedure, visibleTo: ["Patient", "Hospital"] },
    { label: "Visit reference", value: visit, visibleTo: ["Patient", "Hospital"] },
    {
      label: "Per-claim limit",
      value: limitKnown ? formatAmount(SAMPLE_POLICY.perClaimLimit) : "Private until approval",
      visibleTo: ["Patient", "Hospital", "Insurer"],
    },
    {
      label: "Claim amount",
      value: formatAmount(amount),
      visibleTo: VIEWERS,
      afterSettlement: true,
    },
    {
      label: "Claim day",
      value: String(signals.claimDay),
      visibleTo: VIEWERS,
      afterSettlement: true,
    },
    {
      label: "Payout address",
      value: String(signals.payoutAddress),
      visibleTo: VIEWERS,
      afterSettlement: true,
    },
    { label: "Policy commitment", value: String(signals.policyCommitment), visibleTo: VIEWERS },
    {
      label: "Nullifier",
      value: String(signals.nullifier),
      visibleTo: VIEWERS,
      afterSettlement: true,
    },
  ];
  const visibleCount = fields.filter((field) => field.visibleTo.includes(viewer)).length;

  return (
    <div aria-label="Privacy lens" className="mt-14" role="group">
      <Panel title="Privacy lens" description="See this claim through each party's eyes.">
        <div
          aria-label="Choose a viewer"
          className="mb-6 flex flex-wrap items-center gap-1"
          role="group"
        >
          {VIEWERS.map((name) => (
            <button
              aria-pressed={viewer === name}
              className="nav-link"
              key={name}
              onClick={() => setViewer(name)}
              type="button"
            >
              {name}
            </button>
          ))}
          <span aria-live="polite" className="ml-auto font-mono text-xs text-rado-muted">
            {viewer} sees {visibleCount} of {fields.length} fields
          </span>
        </div>
        <dl className="grid gap-x-8 md:grid-cols-2" key={viewer}>
          {fields.map((field) => {
            const visible = field.visibleTo.includes(viewer);
            const pending = visible && outsider && field.afterSettlement && !settled;
            return (
              <div
                className="motion-reveal flex min-w-0 items-center justify-between gap-4 border-t border-rado-line py-3"
                key={field.label}
              >
                <dt className="shrink-0 text-sm text-rado-slate">{field.label}</dt>
                {!visible ? (
                  <dd className="redacted">
                    <Icon name="lock" className="size-3.5" />
                    Hidden
                  </dd>
                ) : pending ? (
                  <dd className="font-mono text-xs text-rado-muted">After settlement</dd>
                ) : (
                  <dd className="min-w-0 truncate text-right font-mono text-xs text-rado-ink">
                    {field.value}
                  </dd>
                )}
              </div>
            );
          })}
        </dl>
        <p className="mt-4 text-xs leading-5 text-rado-muted">
          Simulated view. A claim amount can still hint at the type of treatment, and the insurer
          can see which hospital was paid.
        </p>
      </Panel>
    </div>
  );
}
