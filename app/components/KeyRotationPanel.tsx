"use client";

import { useState } from "react";

import { ROTATION_STEP_COUNT } from "../data/claim-simulation";
import { useClaimState } from "./ClaimSimulationProvider";
import { Icon } from "./icons";
import { Badge, Panel } from "./ui";

const STEPS = [
  "New record key created",
  "Record encrypted again",
  "New encrypted copy pinned",
  "Access removed and hash updated",
];

export function KeyRotationPanel() {
  const { access, grants } = useClaimState();
  const [attempt, setAttempt] = useState<string | null>(null);
  const rotating = access.status === "rotating";
  const subject =
    grants.find(({ id }) => id === access.target) ??
    grants.find(({ status }) => status === "Active");
  const revoked = subject?.status === "Revoked";
  const attemptKey = `${subject?.id}-${subject?.status}-${access.keyVersion}`;

  return (
    <div aria-label="Revoke and rotate" role="group">
      <Panel
        title="Revoke and rotate"
        description="Removing a doctor replaces the record key, so their old key stops working."
        action={
          <Badge
            tone={rotating ? "info" : access.keyVersion > 1 ? "success" : "neutral"}
          >{`Key v${access.keyVersion} · simulated`}</Badge>
        }
      >
        <ol className="space-y-2">
          {STEPS.map((step, index) => {
            const done = rotating ? index < access.step : access.step >= ROTATION_STEP_COUNT;
            const running = rotating && index === access.step;
            return (
              <li
                className={`flex items-center gap-2.5 font-mono text-xs ${done || running ? "text-rado-ink" : "text-rado-muted"}`}
                key={step}
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
                {step}
              </li>
            );
          })}
        </ol>
        <div className="mt-5">
          <button
            className="button-secondary"
            disabled={rotating || !subject}
            onClick={() => setAttempt(attemptKey)}
            type="button"
          >
            {subject ? `Try ${subject.name}'s key` : "No doctor key to try"}
          </button>
        </div>
        {attempt === attemptKey && subject && !rotating ? (
          <p
            aria-live="polite"
            className={`${revoked ? "status-error" : "status-success"} motion-reveal mt-4 rounded-lg border px-4 py-3 text-sm`}
            role="status"
          >
            {revoked
              ? `Key v${access.keyVersion - 1} cannot open the current record.`
              : `Key v${access.keyVersion} opens the current record.`}{" "}
            Simulated, no record was decrypted.
          </p>
        ) : null}
      </Panel>
    </div>
  );
}
