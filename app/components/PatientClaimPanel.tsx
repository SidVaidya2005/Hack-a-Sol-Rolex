"use client";

import { useState } from "react";

import { procedureLabel } from "../data/claim-draft";
import { formatAmount } from "../data/insurer-sample-data";
import { claimProblem } from "../lib/claim-exchange";
import { plainRecordError } from "../lib/record-service";
import { useClaimExchange } from "./ClaimExchangeProvider";
import { shortId, StatusMessage, UnlockGate, useRecordSession } from "./RecordSession";
import { Badge, Panel } from "./ui";

export function PatientClaimPanel() {
  const { session } = useRecordSession();
  const { terms, incoming, rejected, offline, approveClaim, declineClaim } = useClaimExchange();
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  async function approve(encounterId: string) {
    setBusy(encounterId);
    setMessage(null);
    try {
      await approveClaim(encounterId);
      setMessage({ ok: true, text: "Your signed approval was sent to the hospital, encrypted." });
    } catch (error) {
      setMessage({ ok: false, text: plainRecordError(error) });
    } finally {
      setBusy("");
    }
  }

  return (
    <Panel
      title="Claim approvals"
      description="Real encrypted requests. Each one passes its sender check before it appears here."
      action={
        session ? (
          <Badge tone={terms ? "success" : "warning"}>
            {terms ? "Policy received" : "Waiting for policy"}
          </Badge>
        ) : null
      }
    >
      {!session ? (
        <UnlockGate purpose="Sign once to receive your policy and review claim requests." />
      ) : (
        <>
          <StatusMessage message={message} />
          {offline ? (
            <p className="mb-4 text-sm text-rado-error">Could not check your private messages.</p>
          ) : null}
          {rejected.map((reason) => (
            <p className="status-error mb-3 rounded-lg border px-4 py-3 text-sm" key={reason}>
              A message was blocked: {reason}
            </p>
          ))}
          {incoming.length ? (
            <div className="divide-y divide-rado-line">
              {incoming.map(({ body, hospital, status }) => {
                const problem = terms ? claimProblem(body, terms) : null;
                return (
                  <div className="py-4 first:pt-0" key={body.encounterId}>
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm text-rado-ink">
                        {procedureLabel(BigInt(body.procedureCode).toString())}
                      </p>
                      <Badge
                        tone={
                          status === "approved"
                            ? "success"
                            : status === "declined"
                              ? "neutral"
                              : "warning"
                        }
                      >
                        {status === "approved"
                          ? "Approved"
                          : status === "declined"
                            ? "Declined"
                            : "Needs review"}
                      </Badge>
                    </div>
                    <p className="mt-1 text-xs text-rado-slate">
                      {formatAmount(BigInt(body.claimAmount))} · Hospital {shortId(hospital)}
                    </p>
                    {status === "pending" && !terms ? (
                      <p className="mt-2 text-xs text-rado-slate">
                        Ask the insurer to send your policy before approving.
                      </p>
                    ) : null}
                    {status === "pending" && problem ? (
                      <p className="status-warning mt-3 rounded-lg border px-3 py-2 text-xs">
                        {problem} You can decline this request.
                      </p>
                    ) : null}
                    {status === "pending" ? (
                      <div className="mt-3 flex flex-wrap gap-3">
                        <button
                          className="button-primary disabled:opacity-50"
                          disabled={Boolean(busy) || !terms || Boolean(problem)}
                          onClick={() => void approve(body.encounterId)}
                          type="button"
                        >
                          {busy === body.encounterId ? "Sending…" : "Approve claim"}
                        </button>
                        <button
                          className="button-secondary"
                          disabled={Boolean(busy)}
                          onClick={() => declineClaim(body.encounterId)}
                          type="button"
                        >
                          Decline
                        </button>
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-sm text-rado-slate">No claim requests yet.</p>
          )}
        </>
      )}
    </Panel>
  );
}
