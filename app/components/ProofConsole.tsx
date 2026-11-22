"use client";

import { hasReached } from "../data/claim-simulation";
import { useClaimState } from "./ClaimSimulationProvider";
import { Icon } from "./icons";

const CHECKS = [
  "Hospital is approved",
  "Policy is active",
  "Procedure is covered",
  "Amount is within limit",
];

export function ProofConsole() {
  const { stage, proofStep } = useClaimState();
  const finished = hasReached(stage, "proved");

  return (
    <div className="mt-5 rounded-lg bg-black/25 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-mono text-xs uppercase tracking-[0.08em] text-rado-muted">
          Proof checks
        </span>
        <span className="font-mono text-xs text-rado-coral-ink">
          Simulated · no proof generated
        </span>
      </div>
      <ul className="mt-3 space-y-2">
        {CHECKS.map((check, index) => {
          const done = finished || (stage === "proving" && index < proofStep);
          const running = stage === "proving" && index === proofStep;
          return (
            <li
              className={`flex items-center gap-2.5 font-mono text-xs ${done || running ? "text-rado-ink" : "text-rado-muted"}`}
              key={check}
            >
              <span className="grid size-4 place-items-center">
                {done ? (
                  <Icon name="check" className="motion-reveal size-4 text-rado-green" />
                ) : (
                  <span
                    className={`size-1.5 rounded-full ${running ? "motion-pulse bg-rado-ink" : "bg-rado-line"}`}
                  />
                )}
              </span>
              {check}
              {running ? <span className="ml-auto text-rado-muted">checking</span> : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
