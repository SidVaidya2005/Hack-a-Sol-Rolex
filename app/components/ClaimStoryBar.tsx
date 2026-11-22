"use client";

import type { ClaimStage } from "../data/claim-simulation";
import { useClaimActions, useClaimState } from "./ClaimSimulationProvider";
import { Icon } from "./icons";
import { ROLES, type RoleId } from "./RoleNavigation";

const STEPS = ["Request", "Approve", "Prove", "Submit", "Settled"];
const DONE_STEPS: Record<ClaimStage, number> = { draft: 0, requested: 1, approved: 2, proving: 2, proved: 3, settled: 5 };

function nextMove(stage: ClaimStage, activeRole: RoleId): { role: RoleId; text: string } {
  switch (stage) {
    case "draft":
      return { role: "hospital", text: "Hospital requests patient approval" };
    case "requested":
      return { role: "patient", text: "Patient reviews and approves" };
    case "approved":
      return { role: "hospital", text: "Hospital runs the simulated proof" };
    case "proving":
      return { role: "hospital", text: "Simulated proof is running" };
    case "proved":
      return { role: "hospital", text: "Hospital submits the claim" };
    case "settled":
      return { role: activeRole === "insurer" ? "public" : "insurer", text: "Claim settled in this simulation" };
  }
}

export function ClaimStoryBar({ activeRole, onGo }: { activeRole: RoleId; onGo: (role: RoleId) => void }) {
  const { stage, access } = useClaimState();
  const { restart } = useClaimActions();
  const done = DONE_STEPS[stage];
  const move = nextMove(stage, activeRole);
  const roleLabel = ROLES.find(({ id }) => id === move.role)?.label;

  return (
    <section aria-label="Simulated claim story" className="border-b border-rado-line">
      <div className="mx-auto grid max-w-[1280px] gap-4 px-4 py-4 sm:px-8 lg:grid-cols-[1fr_auto] lg:items-center lg:gap-10">
        <div className="min-w-0">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="font-mono text-xs uppercase tracking-[0.08em] text-rado-coral-ink">Simulated claim</span>
            <span aria-live="polite" className="text-sm text-rado-ink">{move.text}</span>
          </div>
          <ol className="mt-3 grid grid-cols-5 gap-1.5">
            {STEPS.map((step, index) => {
              const state = index < done ? "complete" : index === done ? "current" : "upcoming";
              return (
                <li aria-current={state === "current" ? "step" : undefined} key={step}>
                  <span className={`story-segment story-segment-${state}`} />
                  <span className={`mt-1.5 block truncate font-mono text-[11px] ${state === "upcoming" ? "text-rado-muted" : "text-rado-ink"}`}>{step}</span>
                </li>
              );
            })}
          </ol>
        </div>
        <div className="flex items-center justify-between gap-5 lg:justify-end">
          {move.role !== activeRole ? (
            <button className="button-pill-outline whitespace-nowrap" onClick={() => onGo(move.role)} type="button">
              Go to {roleLabel}
              <Icon name="arrow" className="ml-1 size-4" />
            </button>
          ) : <span />}
          <button className="button-secondary" disabled={stage === "draft" && access.status === "active"} onClick={restart} type="button">Restart</button>
        </div>
      </div>
    </section>
  );
}
