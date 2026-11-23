"use client";

import type { Address } from "@rado/shared";
import { useEffect, useState } from "react";

import { plainRecordError } from "../lib/record-service";
import { shortId, StatusMessage, UnlockGate, useRecordSession } from "./RecordSession";
import { Panel } from "./ui";

const POLL_MS = 5_000;

function WalletPicker({
  id,
  label,
  wallets,
  value,
  onChange,
}: {
  id: string;
  label: string;
  wallets: Address[];
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div>
      <label className="mb-1.5 block text-xs text-rado-slate" htmlFor={id}>
        {label}
      </label>
      <select
        className="field"
        disabled={!wallets.length}
        id={id}
        onChange={(event) => onChange(event.target.value)}
        value={value}
      >
        {wallets.length ? (
          wallets.map((wallet) => (
            <option key={wallet} value={wallet}>
              {shortId(wallet)}
            </option>
          ))
        ) : (
          <option value="">No other registered wallets</option>
        )}
      </select>
    </div>
  );
}

/** Handles wallets and encrypted delivery only. It shows no policy terms or medical data. */
export function InsurerPolicyPanel() {
  const { session } = useRecordSession();
  return <InsurerPolicyContent key={session?.address ?? "locked"} />;
}

function InsurerPolicyContent() {
  const { session } = useRecordSession();
  const [wallets, setWallets] = useState<Address[]>([]);
  const [hospitalChoice, setHospitalChoice] = useState("");
  const [patientChoice, setPatientChoice] = useState("");
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const hospital = wallets.find((wallet) => wallet === hospitalChoice) ?? wallets[0] ?? "";
  const patient = wallets.find((wallet) => wallet === patientChoice) ?? wallets[0] ?? "";

  useEffect(() => {
    if (!session) return;
    let current = true;
    const load = () =>
      session.service
        .listRegisteredWallets()
        .then((next) => {
          if (current) setWallets(next);
        })
        .catch(() => undefined);
    void load();
    const timer = setInterval(() => void load(), POLL_MS);
    return () => {
      current = false;
      clearInterval(timer);
    };
  }, [session]);

  async function run(id: string, action: () => Promise<string>) {
    setBusy(id);
    setMessage(null);
    try {
      setMessage({ ok: true, text: await action() });
    } catch (error) {
      setMessage({ ok: false, text: plainRecordError(error) });
    } finally {
      setBusy("");
    }
  }

  return (
    <Panel
      className="mb-14"
      title="Policy delivery"
      description="Real on the local chain. Terms are encrypted to the patient, and this screen never shows them."
    >
      {session ? (
        <>
          <StatusMessage message={message} />
          <div className="grid gap-8 md:grid-cols-2">
            <div className="grid gap-3">
              <WalletPicker
                id="approve-hospital"
                label="Hospital wallet"
                onChange={setHospitalChoice}
                value={hospital}
                wallets={wallets}
              />
              <button
                className="button-pill-outline h-11 disabled:opacity-50"
                disabled={Boolean(busy) || !hospital}
                onClick={() =>
                  void run("hospital", async () =>
                    (await session.exchange.approveHospital(hospital as Address))
                      ? "Hospital approved on-chain."
                      : "This hospital is already approved.",
                  )
                }
                type="button"
              >
                {busy === "hospital" ? "Approving…" : "Approve hospital"}
              </button>
            </div>
            <div className="grid gap-3">
              <WalletPicker
                id="policy-patient"
                label="Patient wallet"
                onChange={setPatientChoice}
                value={patient}
                wallets={wallets}
              />
              <button
                className="button-pill-outline h-11 disabled:opacity-50"
                disabled={Boolean(busy) || !patient}
                onClick={() =>
                  void run("policy", async () => {
                    const { newlyRegistered } = await session.exchange.issuePolicy(
                      patient as Address,
                    );
                    return newlyRegistered
                      ? "Policy registered, and its private terms were sent encrypted."
                      : "Policy terms were sent again, encrypted.";
                  })
                }
                type="button"
              >
                {busy === "policy" ? "Sending…" : "Issue or resend policy"}
              </button>
            </div>
          </div>
        </>
      ) : (
        <UnlockGate purpose="Sign in with the insurer wallet to approve hospitals and deliver policies." />
      )}
    </Panel>
  );
}
