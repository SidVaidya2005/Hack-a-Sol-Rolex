"use client";

import { useState } from "react";

import { policyProblem, procedureLabel } from "../data/claim-draft";
import { hasReached, type ClaimStage } from "../data/claim-simulation";
import { formatAmount } from "../data/insurer-sample-data";
import { getPatientSampleData } from "../data/patient-sample-data";
import { useClaimActions, useClaimState, usePrivateClaimDraft } from "./ClaimSimulationProvider";
import { AuditTimeline, PatientRecordsPanel } from "./PatientRecordsPanel";
import { PrivacyLens } from "./PrivacyLens";
import { Badge, Band, PageHeading, Panel } from "./ui";

const sample = getPatientSampleData();

export function PatientScreen() {
  const [note, setNote] = useState<{ text: string; stage: ClaimStage } | null>(null);
  const { stage, audit, amount } = useClaimState();
  const { approveClaim, declineClaim } = useClaimActions();
  const { draft } = usePrivateClaimDraft();
  const claimRequested = hasReached(stage, "requested");
  const claimApproved = hasReached(stage, "approved");
  const problem = stage === "requested" ? policyProblem(draft.procedureCode, amount) : null;
  const procedure = procedureLabel(draft.procedureCode);
  const message = note?.stage === stage ? note.text : "";
  const setMessage = (text: string, forStage: ClaimStage = stage) =>
    setNote({ text, stage: forStage });
  const claimActivity = [...audit].reverse().filter(({ category }) => category === "Claims");

  return (
    <>
      <PageHeading
        eyebrow="Patient workspace"
        title={`Welcome back, ${sample.name.replace(" Alpha", "")}.`}
        description="Your records, the people you trust, and a clear history of what happened."
        status="records-live"
      />
      {message ? (
        <p
          aria-live="polite"
          className="status-success motion-reveal mb-8 rounded-lg border px-4 py-3 text-sm"
        >
          {message}
        </p>
      ) : null}
      <div className="grid items-start gap-10 xl:grid-cols-[1.25fr_1fr] xl:gap-16">
        <div className="order-2 grid min-w-0 gap-10 xl:order-1">
          <PatientRecordsPanel />
        </div>
        <div className="order-1 grid min-w-0 gap-10 xl:order-2">
          <Band
            eyebrow="Your approval"
            title="Claim request"
            description={
              claimRequested
                ? "Review the details before approving."
                : "A hospital's request will appear here for your approval."
            }
            action={
              <Badge tone={claimApproved ? "success" : claimRequested ? "warning" : "neutral"}>
                {claimApproved
                  ? "Approved · simulated"
                  : claimRequested
                    ? "Needs your review"
                    : "No request yet"}
              </Badge>
            }
          >
            {claimRequested ? (
              <>
                <dl className="motion-reveal divide-y divide-rado-line border-y border-rado-line">
                  <div className="flex items-center justify-between gap-4 py-3">
                    <dt className="text-sm text-rado-slate">Visit</dt>
                    <dd className="font-mono text-xs text-rado-ink">{sample.claim.encounter}</dd>
                  </div>
                  <div className="flex items-center justify-between gap-4 py-3">
                    <dt className="text-sm text-rado-slate">Procedure</dt>
                    <dd className="text-right text-sm text-rado-ink">{procedure}</dd>
                  </div>
                  <div className="flex items-center justify-between gap-4 py-3">
                    <dt className="text-sm text-rado-slate">Requested amount</dt>
                    <dd className="text-sm text-rado-ink">{formatAmount(amount)}</dd>
                  </div>
                </dl>
                {problem ? (
                  <p
                    className="status-warning motion-reveal mt-4 rounded-lg border px-4 py-3 text-sm"
                    role="status"
                  >
                    {problem} You can decline this request.
                  </p>
                ) : null}
                <div className="mt-6 flex flex-wrap items-center gap-4">
                  <button
                    className="button-primary"
                    disabled={claimApproved || Boolean(problem)}
                    onClick={() => {
                      approveClaim();
                      setMessage(
                        "Simulated approval recorded in this browser only. Nothing was signed or sent.",
                        "approved",
                      );
                    }}
                    type="button"
                  >
                    {claimApproved ? "Approved" : "Approve claim"}
                  </button>
                  {stage === "requested" ? (
                    <button
                      className="button-secondary"
                      onClick={() => {
                        declineClaim();
                        setMessage(
                          "You declined this simulated request. Nothing was sent.",
                          "draft",
                        );
                      }}
                      type="button"
                    >
                      Decline request
                    </button>
                  ) : null}
                </div>
              </>
            ) : (
              <p className="border-y border-rado-line py-6 text-sm text-rado-slate">
                Nothing needs your approval right now.
              </p>
            )}
          </Band>
          <AuditTimeline />
          {claimActivity.length ? (
            <Panel title="Simulated claim activity" description="Not on-chain yet.">
              <ul className="space-y-3">
                {claimActivity.map((event, index) => (
                  <li
                    className="text-sm text-rado-ink"
                    key={`${event.title}-${claimActivity.length - index}`}
                  >
                    {event.title}
                  </li>
                ))}
              </ul>
            </Panel>
          ) : null}
        </div>
      </div>
      <PrivacyLens
        procedure={claimRequested ? procedure : "No request yet"}
        visit={claimRequested ? sample.claim.encounter : "No request yet"}
        amount={amount}
      />
    </>
  );
}
