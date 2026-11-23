"use client";

import type { Address } from "@rado/shared";
import { useEffect, useState } from "react";

import { parseClaimAmount, PROCEDURE_OPTIONS, procedureLabel } from "../data/claim-draft";
import { formatAmount } from "../data/insurer-sample-data";
import { plainRecordError } from "../lib/record-service";
import { useClaimExchange, type OutgoingClaim } from "./ClaimExchangeProvider";
import { shortId, StatusMessage, UnlockGate, useRecordSession } from "./RecordSession";
import { Badge, Panel } from "./ui";

const POLL_MS = 5_000;
const STATUS: Record<
  OutgoingClaim["status"],
  { label: string; tone: "warning" | "info" | "success" }
> = {
  awaiting: { label: "Awaiting patient", tone: "warning" },
  approved: { label: "Patient approved", tone: "info" },
  proving: { label: "Proving…", tone: "info" },
  proved: { label: "Proof verified", tone: "success" },
};

export function HospitalClaimPanel() {
  const { session } = useRecordSession();
  return <HospitalClaimContent key={session?.address ?? "locked"} />;
}

function HospitalClaimContent() {
  const { session } = useRecordSession();
  const { outgoing, rejected, offline, requestClaim, resendRequest, proveClaim } =
    useClaimExchange();
  const [wallets, setWallets] = useState<Address[]>([]);
  const [approved, setApproved] = useState<boolean | null>(null);
  const [patientChoice, setPatientChoice] = useState("");
  const [procedure, setProcedure] = useState(PROCEDURE_OPTIONS[1]?.code ?? "");
  const [amountText, setAmountText] = useState("1250.00");
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const patient = wallets.find((wallet) => wallet === patientChoice) ?? wallets[0] ?? "";
  const amount = parseClaimAmount(amountText);

  useEffect(() => {
    if (!session) return;
    let current = true;
    const load = () =>
      Promise.all([
        session.service.listRegisteredWallets(),
        session.exchange.hospitalIsApproved(session.address),
      ])
        .then(([nextWallets, nextApproved]) => {
          if (!current) return;
          setWallets(nextWallets);
          setApproved(nextApproved);
        })
        .catch(() => undefined);
    void load();
    const timer = setInterval(() => void load(), POLL_MS);
    return () => {
      current = false;
      clearInterval(timer);
    };
  }, [session]);

  async function run(id: string, success: string, action: () => Promise<void>) {
    setBusy(id);
    setMessage(null);
    try {
      await action();
      setMessage({ ok: true, text: success });
    } catch (error) {
      setMessage({ ok: false, text: plainRecordError(error) });
    } finally {
      setBusy("");
    }
  }

  return (
    <Panel
      className="mt-14"
      title="Private claim exchange"
      description="Real encrypted request and browser proof. Submitting it for payout arrives in W11."
      action={
        session ? (
          <Badge tone={approved ? "success" : "warning"}>
            {approved ? "Hospital approved" : "Awaiting insurer approval"}
          </Badge>
        ) : null
      }
    >
      {!session ? (
        <UnlockGate purpose="Sign once with the hospital wallet to send claims and generate proofs." />
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
          <div className="grid gap-3 md:grid-cols-[1fr_1fr_1fr_auto] md:items-end">
            <div>
              <label className="mb-1.5 block text-xs text-rado-slate" htmlFor="real-claim-patient">
                Patient wallet
              </label>
              <select
                className="field"
                disabled={!wallets.length}
                id="real-claim-patient"
                onChange={(event) => setPatientChoice(event.target.value)}
                value={patient}
              >
                {wallets.length ? (
                  wallets.map((wallet) => (
                    <option key={wallet} value={wallet}>
                      {shortId(wallet)}
                    </option>
                  ))
                ) : (
                  <option value="">No other unlocked wallets</option>
                )}
              </select>
            </div>
            <div>
              <label
                className="mb-1.5 block text-xs text-rado-slate"
                htmlFor="real-claim-procedure"
              >
                Procedure
              </label>
              <select
                className="field"
                id="real-claim-procedure"
                onChange={(event) => setProcedure(event.target.value)}
                value={procedure}
              >
                {PROCEDURE_OPTIONS.map(({ code, label }) => (
                  <option key={code} value={code}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1.5 block text-xs text-rado-slate" htmlFor="real-claim-amount">
                Amount (INR)
              </label>
              <input
                aria-invalid={amount === null}
                className="field"
                id="real-claim-amount"
                inputMode="decimal"
                onChange={(event) => setAmountText(event.target.value)}
                value={amountText}
              />
            </div>
            <button
              className="button-primary h-11 whitespace-nowrap disabled:opacity-50"
              disabled={Boolean(busy) || !patient || amount === null || !approved}
              onClick={() =>
                void run("request", "Signed claim request sent, encrypted.", () =>
                  requestClaim(patient as Address, BigInt(procedure), amount as bigint),
                )
              }
              type="button"
            >
              {busy === "request" ? "Sending…" : "Send claim request"}
            </button>
          </div>

          {outgoing.length ? (
            <div className="mt-6 divide-y divide-rado-line border-t border-rado-line">
              {outgoing.map(({ body, patient: claimPatient, status, proof, error }) => (
                <div className="py-4" key={body.encounterId}>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-rado-ink">
                        {procedureLabel(BigInt(body.procedureCode).toString())}
                      </p>
                      <p className="mt-0.5 text-xs text-rado-slate">
                        {formatAmount(BigInt(body.claimAmount))} · Patient {shortId(claimPatient)}
                      </p>
                    </div>
                    <Badge tone={STATUS[status].tone}>{STATUS[status].label}</Badge>
                    {status === "awaiting" ? (
                      <button
                        className="button-secondary disabled:opacity-50"
                        disabled={Boolean(busy)}
                        onClick={() =>
                          void run(`resend-${body.encounterId}`, "Request sent again.", () =>
                            resendRequest(body.encounterId),
                          )
                        }
                        type="button"
                      >
                        Resend
                      </button>
                    ) : null}
                    {status === "approved" ? (
                      <button
                        className="button-primary"
                        onClick={() => void proveClaim(body.encounterId)}
                        type="button"
                      >
                        Generate proof
                      </button>
                    ) : null}
                  </div>
                  {error ? (
                    <p className="mt-2 text-sm text-rado-error" role="alert">
                      {error}
                    </p>
                  ) : null}
                  {proof ? (
                    <p className="status-success mt-3 rounded-lg border px-3 py-2 text-xs">
                      Valid zero-knowledge proof generated in this browser in{" "}
                      {(proof.provingMs / 1000).toFixed(1)} seconds. It has not been submitted.
                    </p>
                  ) : null}
                </div>
              ))}
            </div>
          ) : null}
        </>
      )}
    </Panel>
  );
}
