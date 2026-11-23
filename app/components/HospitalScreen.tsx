"use client";

import { useState } from "react";

import { parseClaimAmount, PROCEDURE_OPTIONS, procedureLabel } from "../data/claim-draft";
import { hasReached, type ClaimStage } from "../data/claim-simulation";
import { getHospitalSampleData } from "../data/hospital-sample-data";
import { formatAmount, getInsurerSampleData } from "../data/insurer-sample-data";
import { AttackSimulator } from "./AttackSimulator";
import { useClaimActions, useClaimState, usePrivateClaimDraft } from "./ClaimSimulationProvider";
import { DoctorRecordsPanel } from "./DoctorRecordsPanel";
import { HospitalClaimPanel } from "./HospitalClaimPanel";
import { Icon } from "./icons";
import { PrivacyLens } from "./PrivacyLens";
import { ProofConsole } from "./ProofConsole";
import { Badge, Band, MetricCard, PageHeading, Panel, SampleNotice } from "./ui";

const sample = getHospitalSampleData();
const pool = getInsurerSampleData();
const remainingCap = pool.capUnits - pool.usedCapUnits;

const STATUS: Record<ClaimStage, { label: string; tone: "warning" | "info" | "success" }> = {
  draft: { label: "Ready to request", tone: "warning" },
  requested: { label: "Awaiting patient", tone: "warning" },
  approved: { label: "Patient approved", tone: "info" },
  proving: { label: "Proof running", tone: "info" },
  proved: { label: "Ready to submit", tone: "info" },
  settled: { label: "Settled · simulated", tone: "success" },
};

function BuilderCheck({ ok, label }: { ok: boolean; label: string }) {
  return (
    <li className={`flex items-center gap-2 text-xs ${ok ? "text-rado-ink" : "text-rado-error"}`}>
      {ok ? (
        <Icon name="check" className="size-4 text-rado-green" />
      ) : (
        <span aria-hidden="true" className="grid size-4 place-items-center">
          <span className="size-1.5 rounded-full bg-rado-error" />
        </span>
      )}
      {label}
    </li>
  );
}

export function HospitalScreen() {
  const [note, setNote] = useState<{ text: string; stage: ClaimStage } | null>(null);
  const { stage, rejection, declined, amount } = useClaimState();
  const { requestApproval, startProof, submitClaim } = useClaimActions();
  const { draft, setDraft } = usePrivateClaimDraft();
  const editing = stage === "draft";
  const approved = hasReached(stage, "approved");
  const proved = hasReached(stage, "proved");
  const settled = stage === "settled";
  const draftAmount = parseClaimAmount(draft.amountText);
  const withinCap = draftAmount !== null && draftAmount <= remainingCap;
  const canRequest = draftAmount !== null && withinCap;
  const shownAmount = editing ? draftAmount : amount;
  const amountLabel = shownAmount === null ? "—" : formatAmount(shownAmount);
  const notice =
    note?.stage === stage
      ? note.text
      : settled
        ? "Simulated settlement complete. No proof was generated and no payment was sent."
        : editing && declined
          ? "The patient declined this request. Edit the claim and request approval again."
          : "";
  const message = rejection ?? notice;

  const primary: Record<ClaimStage, { label: string; onClick?: () => void }> = {
    draft: {
      label: "Request patient approval",
      onClick: canRequest ? () => requestApproval(draftAmount) : undefined,
    },
    requested: { label: "Waiting for patient" },
    approved: { label: "Run simulated proof", onClick: startProof },
    proving: { label: "Proof running…" },
    proved: { label: "Submit sample claim", onClick: submitClaim },
    settled: { label: "Submit again", onClick: submitClaim },
  };
  const action = primary[stage];

  const journey = [
    {
      title: sample.timeline[0].title,
      done: approved,
      detail: approved ? sample.timeline[0].detail : "Waiting for the patient",
    },
    {
      title: sample.timeline[1].title,
      done: approved,
      detail: approved ? sample.timeline[1].detail : "Follows patient approval",
    },
    {
      title: sample.timeline[2].title,
      done: proved,
      detail: proved ? "Simulated checks passed" : sample.timeline[2].detail,
    },
  ];

  return (
    <>
      <PageHeading
        eyebrow="Hospital workspace"
        title="Claims workspace"
        description="Prepare a claim, review the approval, and see each step before proving."
        action={
          <button
            className="button-primary"
            disabled={!action.onClick}
            onClick={action.onClick}
            type="button"
          >
            {action.label}
            <Icon name="arrow" className="size-4" />
          </button>
        }
      />
      <SampleNotice>
        Claim actions are a simulation. No proof, transaction, or payment is created.
      </SampleNotice>
      <div className="mb-14 grid gap-x-8 gap-y-2 sm:grid-cols-3">
        <MetricCard
          label="Ready for review"
          value={settled ? "0 claims" : "1 claim"}
          detail="Sample queue"
          icon="clock"
        />
        <MetricCard label="This claim" value={amountLabel} detail="Sample amount" icon="coin" />
        <MetricCard
          label="Hospital"
          value={sample.name}
          detail="Sample organization"
          icon="building"
        />
      </div>
      {message ? (
        <p
          aria-live="polite"
          className={`${rejection ? "status-error" : editing && declined ? "status-warning" : "status-success"} motion-reveal mb-8 rounded-lg border px-4 py-3 text-sm`}
          role="status"
        >
          {message}
        </p>
      ) : null}
      <div className="grid items-start gap-10 xl:grid-cols-[1.2fr_1fr] xl:gap-16">
        <Panel
          className="min-w-0"
          title={editing ? "Claim builder" : "Claim preview"}
          description={
            editing
              ? "Choose a sample procedure and amount, then request approval."
              : "Only the details needed for this sample claim are shown."
          }
          action={<Badge tone={STATUS[stage].tone}>{STATUS[stage].label}</Badge>}
        >
          <dl className="grid gap-x-8 sm:grid-cols-2">
            <div className="border-t border-rado-line py-4">
              <dt className="font-mono text-xs uppercase tracking-[0.08em] text-rado-muted">
                Patient
              </dt>
              <dd className="mt-2 text-base text-rado-ink">{sample.patient}</dd>
            </div>
            <div className="border-t border-rado-line py-4">
              <dt className="font-mono text-xs uppercase tracking-[0.08em] text-rado-muted">
                Visit reference
              </dt>
              <dd className="mt-2 font-mono text-sm text-rado-ink">{sample.encounter}</dd>
            </div>
            <div className="border-t border-rado-line py-4">
              <dt className="font-mono text-xs uppercase tracking-[0.08em] text-rado-muted">
                {editing ? <label htmlFor="claim-procedure">Procedure</label> : "Procedure"}
              </dt>
              <dd className="mt-2 text-base text-rado-ink">
                {editing ? (
                  <select
                    className="field"
                    id="claim-procedure"
                    onChange={(event) =>
                      setDraft((current) => ({ ...current, procedureCode: event.target.value }))
                    }
                    value={draft.procedureCode}
                  >
                    {PROCEDURE_OPTIONS.map(({ code, label }) => (
                      <option key={code} value={code}>
                        {label}
                      </option>
                    ))}
                  </select>
                ) : (
                  procedureLabel(draft.procedureCode)
                )}
              </dd>
            </div>
            <div className="border-t border-rado-line py-4">
              <dt className="font-mono text-xs uppercase tracking-[0.08em] text-rado-muted">
                {editing ? (
                  <label htmlFor="claim-amount">Claim amount (INR)</label>
                ) : (
                  "Claim amount"
                )}
              </dt>
              <dd className="mt-2 text-base text-rado-ink">
                {editing ? (
                  <input
                    aria-invalid={!canRequest}
                    className="field"
                    id="claim-amount"
                    inputMode="decimal"
                    onChange={(event) =>
                      setDraft((current) => ({ ...current, amountText: event.target.value }))
                    }
                    value={draft.amountText}
                  />
                ) : (
                  amountLabel
                )}
              </dd>
            </div>
          </dl>
          {editing ? (
            <div className="border-t border-rado-line pt-4">
              <ul aria-label="Claim checks" className="space-y-2">
                <BuilderCheck ok={draftAmount !== null} label="Amount is a positive rupee value" />
                <BuilderCheck
                  ok={withinCap}
                  label={`Within the public remaining cap of ${formatAmount(remainingCap)}`}
                />
              </ul>
              <p className="mt-3 text-xs leading-5 text-rado-muted">
                Coverage and the per-claim limit stay private. The patient checks them before
                approving.
              </p>
            </div>
          ) : (
            <div className="mt-4 flex flex-wrap gap-6">
              <button
                className="button-secondary"
                onClick={() =>
                  setNote({
                    text: "Sample only: proof inputs are ready for review. The browser did not generate a proof.",
                    stage,
                  })
                }
                type="button"
              >
                Review proof inputs
              </button>
              <button
                className="button-secondary"
                onClick={() =>
                  setNote({
                    text: approved
                      ? "The patient approved this claim in the simulation."
                      : "The patient has not approved this claim yet.",
                    stage,
                  })
                }
                type="button"
              >
                View patient approval
              </button>
            </div>
          )}
        </Panel>
        <Band
          className="min-w-0"
          eyebrow="Proof console"
          title="Claim journey"
          description="A clear view of what happens next."
        >
          <ol className="divide-y divide-rado-line border-y border-rado-line">
            {journey.map((step, index) => (
              <li className="flex gap-3 py-4" key={step.title}>
                <span
                  className={`grid size-7 shrink-0 place-items-center rounded-full font-mono text-xs ${step.done ? "bg-rado-pale-green text-rado-green" : "bg-rado-stone-wash text-rado-slate"}`}
                >
                  {step.done ? <Icon name="check" className="motion-reveal size-4" /> : index + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm text-rado-ink">{step.title}</p>
                    <Badge tone={step.done ? "success" : "neutral"}>
                      {step.done ? "Ready" : "Waiting"}
                    </Badge>
                  </div>
                  <p className="mt-1 text-xs leading-5 text-rado-slate">{step.detail}</p>
                </div>
              </li>
            ))}
          </ol>
          <ProofConsole />
          <div className="mt-5 flex items-center justify-between gap-3">
            <span className="font-mono text-xs uppercase tracking-[0.08em] text-rado-muted">
              Claim day
            </span>
            <span className="font-mono text-sm text-rado-ink">{sample.claimDay.toString()}</span>
          </div>
          <p className="mt-2 text-xs leading-5 text-rado-slate">
            The real proof step is reserved for the hospital browser flow.
          </p>
        </Band>
      </div>
      <HospitalClaimPanel />
      <DoctorRecordsPanel />
      <PrivacyLens
        procedure={procedureLabel(draft.procedureCode)}
        visit={sample.encounter}
        amount={shownAmount ?? amount}
        limitKnown={approved}
      />
      <AttackSimulator />
    </>
  );
}
