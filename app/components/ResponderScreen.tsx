"use client";

import { useCallback, useEffect, useState } from "react";

import {
  plainRecordError,
  type EmergencySummaryItem,
  type EmergencySummaryRecord,
} from "../lib/record-service";
import { Icon } from "./icons";
import {
  shortId,
  StatusMessage,
  UnlockGate,
  useRecordSession,
  WalletPromptNotice,
} from "./RecordSession";
import { Badge, Band, EmptyState, PageHeading, Panel } from "./ui";

/** Keyed by wallet, so a released summary is cleared when the wallet changes. */
export function ResponderScreen() {
  const { session } = useRecordSession();
  return <ResponderContent key={session?.address ?? "locked"} />;
}

function ResponderContent() {
  const { session, refresh } = useRecordSession();
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [patients, setPatients] = useState<EmergencySummaryRecord[]>([]);
  const [names, setNames] = useState<Map<string, string>>(new Map());
  const [selected, setSelected] = useState("");
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [walletPrompt, setWalletPrompt] = useState("");
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [summary, setSummary] = useState<EmergencySummaryItem[] | null>(null);

  const load = useCallback(async () => {
    if (!session) return;
    setLoading(true);
    try {
      const [isResponder, nextPatients, nextNames] = await Promise.all([
        session.service.isResponder(),
        session.service.listEmergencyPatients(),
        session.service.patientNames(session.keys),
      ]);
      setAllowed(isResponder);
      setPatients(nextPatients);
      setNames(nextNames);
    } catch (error) {
      setMessage({ ok: false, text: plainRecordError(error) });
    } finally {
      setLoading(false);
    }
  }, [session]);

  useEffect(() => {
    // Loads chain data once for this unlocked wallet.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const target = patients.find(({ patient }) => patient === selected) ?? patients[0] ?? null;
  const labelFor = (wallet: string) => {
    const name = names.get(wallet.toLowerCase());
    return name ? `${name} - ${shortId(wallet)}` : shortId(wallet);
  };
  const withSummary = new Set(patients.map(({ patient }) => patient.toLowerCase()));
  const withoutSummary = [...names.keys()].filter((wallet) => !withSummary.has(wallet));

  async function openSummary() {
    if (!session || !target) return;
    setBusy(true);
    setMessage(null);
    setSummary(null);
    try {
      setSummary(await session.service.openEmergencySummary(session.keys, target, setWalletPrompt));
      setMessage({ ok: true, text: "Emergency access logged on-chain. Summary released once." });
      refresh();
    } catch (error) {
      setMessage({ ok: false, text: plainRecordError(error) });
    } finally {
      setBusy(false);
      setWalletPrompt("");
    }
  }

  return (
    <>
      <PageHeading
        eyebrow="Emergency responder"
        title="Emergency access"
        description="Open a patient's emergency summary when they cannot act."
        status="live"
        action={<Badge tone="info">Responder role</Badge>}
      />
      <div className="grid items-start gap-10 xl:grid-cols-[1fr_1.1fr] xl:gap-16">
        <Band
          eyebrow="Break-glass"
          title="Break-glass request"
          description="Each access is permanently recorded on-chain and limited to the summary."
          tone="ink"
        >
          {!session ? (
            <UnlockGate purpose="Sign once with the registered responder wallet." />
          ) : (
            <>
              <WalletPromptNotice text={walletPrompt} />
              <StatusMessage message={message} />
              <div className="flex items-start gap-3 border-y border-rado-line py-4">
                <span className="text-rado-coral">
                  <Icon name="asterisk" />
                </span>
                <div>
                  <p className="text-sm text-rado-ink">Use only for an urgent need</p>
                  <p className="mt-1 text-sm leading-6 text-rado-slate">
                    The patient will see this access in their audit timeline. It cannot be removed.
                  </p>
                </div>
              </div>
              {allowed === false ? (
                <p className="mt-4 text-sm text-rado-error" role="alert">
                  This wallet is not a registered emergency responder.
                </p>
              ) : null}
              <label className="mt-5 block text-sm text-rado-slate" htmlFor="emergency-patient">
                Patient wallet
              </label>
              <select
                className="field mt-2"
                disabled={(!patients.length && !withoutSummary.length) || busy}
                id="emergency-patient"
                onChange={(event) => {
                  setSelected(event.target.value);
                  setSummary(null);
                  setMessage(null);
                }}
                value={target?.patient ?? ""}
              >
                {!patients.length ? (
                  <option value="">
                    {loading ? "Loading…" : "No patient has added a summary"}
                  </option>
                ) : null}
                {patients.map(({ patient }) => (
                  <option key={patient} value={patient}>
                    {labelFor(patient)}
                  </option>
                ))}
                {withoutSummary.map((wallet) => (
                  <option disabled key={wallet} value={wallet}>
                    {labelFor(wallet)} (no emergency summary)
                  </option>
                ))}
              </select>
              <button
                className="button-primary mt-4 w-full justify-center disabled:opacity-50"
                disabled={!target || !allowed || busy}
                onClick={() => void openSummary()}
                type="button"
              >
                {busy ? "Check your wallet…" : "Invoke break-glass"}
              </button>
              <button
                className="button-pill-outline mt-3 w-full justify-center disabled:opacity-50"
                disabled={loading || busy}
                onClick={() => void load()}
                type="button"
              >
                {loading ? "Refreshing…" : "Refresh patients"}
              </button>
            </>
          )}
        </Band>
        <div className="grid gap-10">
          <Panel
            title="Emergency summary"
            description="Only the limited summary is shown. It stays in this browser's memory."
            action={
              <Badge tone={summary ? "success" : "neutral"}>
                {summary ? "Released" : "Locked"}
              </Badge>
            }
          >
            {summary ? (
              <div className="divide-y divide-rado-line">
                {summary.map((item) => (
                  <div
                    className="flex items-center justify-between gap-4 py-4 first:pt-0"
                    key={item.id}
                  >
                    <span className="text-sm text-rado-slate">{item.label}</span>
                    <span className="text-right text-base text-rado-ink">{item.value}</span>
                  </div>
                ))}
                <p className="pt-4 text-xs text-rado-muted">Synthetic information.</p>
              </div>
            ) : (
              <EmptyState
                icon="lock"
                title="Summary is locked"
                description="Invoke break-glass to log the access and release this patient's summary."
              />
            )}
          </Panel>
        </div>
      </div>
    </>
  );
}
