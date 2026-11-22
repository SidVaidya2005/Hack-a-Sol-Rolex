"use client";

import { useState } from "react";

import { useClaimActions, useClaimState } from "./ClaimSimulationProvider";
import { Icon } from "./icons";
import { Badge, Panel } from "./ui";

const STEPS = ["New record key created", "Record encrypted again", "New encrypted copy pinned", "Access removed and hash updated"];

export function KeyRotationPanel() {
  const { access } = useClaimState();
  const { revokeAndRotate } = useClaimActions();
  const [attemptedFor, setAttemptedFor] = useState<typeof access.status | null>(null);
  const revoked = access.status === "revoked";
  const rotating = access.status === "rotating";
  const attempted = attemptedFor === access.status;

  return (
    <div aria-label="Revoke and rotate" role="group">
      <Panel
        title="Revoke and rotate"
        description="Removing a doctor replaces the record key, so their old key stops working."
        action={<Badge tone={revoked ? "success" : rotating ? "info" : "neutral"}>{revoked ? "Key v2 · simulated" : "Key v1 · simulated"}</Badge>}
      >
        <ol className="space-y-2">
          {STEPS.map((step, index) => {
            const done = revoked || (rotating && index < access.step);
            const running = rotating && index === access.step;
            return (
              <li className={`flex items-center gap-2.5 font-mono text-xs ${done || running ? "text-rado-ink" : "text-rado-muted"}`} key={step}>
                <span className="grid size-4 place-items-center">
                  {done ? <Icon name="check" className="motion-reveal size-4 text-rado-green" /> : <span className={`size-1.5 rounded-full ${running ? "motion-pulse bg-rado-ink" : "bg-rado-line"}`} />}
                </span>
                {step}
              </li>
            );
          })}
        </ol>
        <div className="mt-5 flex flex-wrap items-center gap-5">
          <button className="button-pill-outline whitespace-nowrap disabled:opacity-50" disabled={access.status !== "active"} onClick={revokeAndRotate} type="button">
            {revoked ? "Sample City Clinic revoked" : rotating ? "Rotating key…" : "Revoke Sample City Clinic"}
          </button>
          <button className="button-secondary" disabled={rotating} onClick={() => setAttemptedFor(access.status)} type="button">Try doctor&apos;s key v1</button>
        </div>
        {attempted && !rotating ? (
          <p aria-live="polite" className={`${revoked ? "status-error" : "status-success"} motion-reveal mt-4 rounded-lg border px-4 py-3 text-sm`} role="status">
            {revoked ? "Key v1 cannot open the current record." : "Key v1 opens the current record."} Simulated, no record was decrypted.
          </p>
        ) : null}
      </Panel>
    </div>
  );
}
