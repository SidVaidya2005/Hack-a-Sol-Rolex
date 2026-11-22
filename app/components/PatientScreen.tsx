"use client";

import { useState } from "react";

import { policyProblem, procedureLabel } from "../data/claim-draft";
import {
  ACCESS_CANDIDATES,
  hasReached,
  type AuditCategory,
  type ClaimStage,
} from "../data/claim-simulation";
import { formatAmount } from "../data/insurer-sample-data";
import { getPatientSampleData } from "../data/patient-sample-data";
import { useClaimActions, useClaimState, usePrivateClaimDraft } from "./ClaimSimulationProvider";
import { Icon, type IconName } from "./icons";
import { KeyRotationPanel } from "./KeyRotationPanel";
import { PrivacyLens } from "./PrivacyLens";
import { Badge, Band, MetricCard, PageHeading, Panel, SampleNotice } from "./ui";

const sample = getPatientSampleData();
const SAMPLE_ACTIVITY_CATEGORY: Record<string, AuditCategory> = {
  "Record created": "Records",
  "Clinic access granted": "Access",
  "Record viewed": "Records",
};
const ACTIVITY_FILTERS = ["All", "Access", "Claims", "Records"] as const;
const EXPIRY_OPTIONS = [1, 7, 30];

function recordIcon(kind: string): IconName {
  if (kind === "Patient") return "heart";
  if (kind === "MedicationRequest") return "pill";
  if (kind === "Procedure") return "pulse";
  return "file";
}

export function PatientScreen() {
  const [recordAdded, setRecordAdded] = useState(false);
  const [note, setNote] = useState<{ text: string; stage: ClaimStage } | null>(null);
  const [activityFilter, setActivityFilter] = useState<(typeof ACTIVITY_FILTERS)[number]>("All");
  const [selectedDoctor, setSelectedDoctor] = useState("");
  const [expiryDays, setExpiryDays] = useState(7);
  const { stage, access, grants, audit, amount } = useClaimState();
  const { approveClaim, declineClaim, grantAccess, revokeAndRotate } = useClaimActions();
  const { draft } = usePrivateClaimDraft();
  const rotating = access.status === "rotating";
  const claimRequested = hasReached(stage, "requested");
  const claimApproved = hasReached(stage, "approved");
  const problem = stage === "requested" ? policyProblem(draft.procedureCode, amount) : null;
  const procedure = procedureLabel(draft.procedureCode);
  const message = note?.stage === stage ? note.text : "";
  const setMessage = (text: string, forStage: ClaimStage = stage) =>
    setNote({ text, stage: forStage });
  const records = recordAdded
    ? [
        ...sample.records,
        { id: "sample-preview-record", kind: "Document", description: "Sample health record" },
      ]
    : sample.records;
  const activity = [
    ...[...audit]
      .reverse()
      .map((event) => ({ ...event, when: "Just now", detail: "Simulated event" })),
    ...sample.activity.map((event) => ({
      ...event,
      category: SAMPLE_ACTIVITY_CATEGORY[event.title],
    })),
  ];
  const visibleActivity = activity.filter(
    (event) => activityFilter === "All" || event.category === activityFilter,
  );
  const grantable = ACCESS_CANDIDATES.filter(
    ({ id }) => grants.find((grant) => grant.id === id)?.status !== "Active",
  );
  const doctorToGrant = grantable.some(({ id }) => id === selectedDoctor)
    ? selectedDoctor
    : (grantable[0]?.id ?? "");

  function grant() {
    if (!doctorToGrant) return;
    grantAccess(doctorToGrant, expiryDays);
    setMessage(
      `Simulated access granted for ${expiryDays} ${expiryDays === 1 ? "day" : "days"}. Nothing was sent.`,
    );
  }

  return (
    <>
      <PageHeading
        eyebrow="Patient workspace"
        title={`Welcome back, ${sample.name.replace(" Alpha", "")}.`}
        description="Your records, the people you trust, and a clear history of what happened."
        action={
          <button
            className="button-primary"
            disabled={recordAdded}
            onClick={() => {
              setRecordAdded(true);
              setMessage("Sample record added in this browser preview only. Nothing was uploaded.");
            }}
            type="button"
          >
            <Icon name="plus" className="size-4" />{" "}
            {recordAdded ? "Sample record added" : "Add sample record"}
          </button>
        }
      />
      <SampleNotice>
        Everything here is synthetic. Access changes are preview-only; nothing is stored or sent.
      </SampleNotice>
      <div className="mb-14 grid gap-x-8 gap-y-2 sm:grid-cols-3">
        <MetricCard
          label="Your records"
          value={String(records.length)}
          detail="Available in this sample"
          icon="file"
        />
        <MetricCard
          label="People with access"
          value={String(grants.filter(({ status }) => status === "Active").length)}
          detail="You control every connection"
          icon="users"
        />
        <MetricCard
          label="Recent activity"
          value={`${activity.length} events`}
          detail="A private audit trail"
          icon="clock"
        />
      </div>
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
          <Panel
            title="Your records"
            description="A sample view of the information you keep private."
            action={
              <span className="whitespace-nowrap font-mono text-xs text-rado-muted">
                {records.length} items
              </span>
            }
          >
            <div className="divide-y divide-rado-line">
              {records.map((record) => (
                <div className="flex items-center gap-4 py-4 first:pt-0 last:pb-0" key={record.id}>
                  <span className="text-rado-muted">
                    <Icon name={recordIcon(record.kind)} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-base text-rado-ink">{record.description}</p>
                    <p className="mt-0.5 text-xs text-rado-slate">{record.kind} · Sample record</p>
                  </div>
                  <span className="hidden font-mono text-xs text-rado-muted sm:block">
                    Encrypted sample
                  </span>
                </div>
              ))}
            </div>
          </Panel>
          <Panel
            title="People you trust"
            description="Grant access for a chosen period, then change it whenever you like."
          >
            <div className="divide-y divide-rado-line">
              {grants.map((person) => (
                <div
                  className="flex flex-wrap items-center gap-x-4 gap-y-2 py-4 first:pt-0"
                  key={person.id}
                >
                  <div className="grid size-10 shrink-0 place-items-center rounded-full bg-rado-stone text-xs text-rado-ink">
                    {person.name
                      .split(" ")
                      .map((part) => part[0])
                      .slice(1, 3)
                      .join("")}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-base text-rado-ink">{person.name}</p>
                    <p className="text-xs text-rado-slate">{person.expiry}</p>
                  </div>
                  <Badge
                    tone={
                      person.status === "Active"
                        ? "success"
                        : person.status === "Revoked"
                          ? "warning"
                          : "neutral"
                    }
                  >
                    {person.status}
                  </Badge>
                  {person.status === "Active" ? (
                    <button
                      aria-label={`Revoke ${person.name}`}
                      className="button-pill-outline disabled:opacity-50"
                      disabled={rotating}
                      onClick={() => revokeAndRotate(person.id)}
                      type="button"
                    >
                      {rotating && access.target === person.id ? "Rotating…" : "Revoke"}
                    </button>
                  ) : null}
                </div>
              ))}
            </div>
            <div className="mt-2 grid gap-3 border-t border-rado-line pt-5 sm:grid-cols-[1fr_auto_auto] sm:items-end">
              <div>
                <label className="mb-1.5 block text-xs text-rado-slate" htmlFor="grant-doctor">
                  Doctor
                </label>
                <select
                  className="field"
                  disabled={!grantable.length}
                  id="grant-doctor"
                  onChange={(event) => setSelectedDoctor(event.target.value)}
                  value={doctorToGrant}
                >
                  {grantable.length ? (
                    grantable.map(({ id, name }) => (
                      <option key={id} value={id}>
                        {name}
                      </option>
                    ))
                  ) : (
                    <option value="">Everyone has access</option>
                  )}
                </select>
              </div>
              <div>
                <label className="mb-1.5 block text-xs text-rado-slate" htmlFor="grant-expiry">
                  Access for
                </label>
                <select
                  className="field"
                  id="grant-expiry"
                  onChange={(event) => setExpiryDays(Number(event.target.value))}
                  value={expiryDays}
                >
                  {EXPIRY_OPTIONS.map((days) => (
                    <option key={days} value={days}>
                      {days} {days === 1 ? "day" : "days"}
                    </option>
                  ))}
                </select>
              </div>
              <button
                className="button-pill-outline h-11 whitespace-nowrap disabled:opacity-50"
                disabled={!doctorToGrant || rotating}
                onClick={grant}
                type="button"
              >
                Grant access
              </button>
            </div>
          </Panel>
          <KeyRotationPanel />
        </div>
        <div className="order-1 grid min-w-0 gap-10 xl:order-2">
          <Band
            eyebrow="Your approval"
            title="Claim request"
            description={
              claimRequested
                ? "Review the details before approving this sample request."
                : "A hospital's request will appear here for your approval."
            }
            action={
              <Badge tone={claimApproved ? "success" : claimRequested ? "warning" : "neutral"}>
                {claimApproved
                  ? "Approved · sample"
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
                    {claimApproved ? "Approved" : "Approve sample claim"}
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
          <Panel title="Recent activity" description="Actions appear here so you stay in control.">
            <div aria-label="Filter activity" className="mb-5 flex flex-wrap gap-1" role="group">
              {ACTIVITY_FILTERS.map((filter) => (
                <button
                  aria-pressed={activityFilter === filter}
                  className="nav-link"
                  key={filter}
                  onClick={() => setActivityFilter(filter)}
                  type="button"
                >
                  {filter}
                </button>
              ))}
            </div>
            <div className="space-y-4">
              {visibleActivity.map((event, index) => (
                <div
                  className="motion-reveal flex gap-3"
                  key={`${event.title}-${visibleActivity.length - index}`}
                >
                  <span
                    className={`mt-1.5 size-2 shrink-0 rounded-full ${index === 0 ? "bg-rado-green" : "bg-rado-line"}`}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex justify-between gap-3">
                      <p className="text-sm text-rado-ink">{event.title}</p>
                      <span className="whitespace-nowrap font-mono text-xs text-rado-muted">
                        {event.when}
                      </span>
                    </div>
                    <p className="mt-0.5 text-xs text-rado-slate">{event.detail}</p>
                  </div>
                </div>
              ))}
              {visibleActivity.length ? null : (
                <p className="text-sm text-rado-slate">No activity in this category yet.</p>
              )}
            </div>
          </Panel>
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
