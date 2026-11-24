"use client";

import { BREAK_GLASS_REASONS } from "@rado/shared";
import type { BreakGlassCategory } from "@rado/shared";
import { useCallback, useEffect, useState } from "react";

import {
  plainRecordError,
  type EmergencySummaryItem,
  type EmergencySummaryRecord,
} from "../lib/record-service";
import { DecryptText, Peel, RedactionBar } from "./dossier";
import { Icon } from "./icons";
import {
  shortId,
  StatusMessage,
  UnlockGate,
  useRecordSession,
  WalletPromptNotice,
} from "./RecordSession";
import { Badge, Band, PageHeading, Panel } from "./ui";

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
  const [category, setCategory] = useState<BreakGlassCategory | "">("");
  const [note, setNote] = useState("");
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
  const reasonReady = Boolean(category) && (category !== "other" || Boolean(note.trim()));

  async function openSummary() {
    if (!session || !target || !category) return;
    setBusy(true);
    setMessage(null);
    setSummary(null);
    try {
      setSummary(
        await session.service.openEmergencySummary(
          session.keys,
          target,
          { category, note },
          setWalletPrompt,
        ),
      );
      setCategory("");
      setNote("");
      setMessage({
        ok: true,
        text: "Emergency access logged. The patient can see who, when, and why.",
      });
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
        description="Open a patient's emergency profile when they cannot act."
        status="live"
        action={<Badge tone="info">Responder role</Badge>}
      />
      <div className="grid items-start gap-10 xl:grid-cols-[1fr_1.1fr] xl:gap-16">
        <Band
          eyebrow="Break-glass"
          title="Break-glass request"
          description="Each access is permanently recorded and limited to the emergency profile."
          tone="ink"
        >
          {!session ? (
            <UnlockGate purpose="Sign in with the authorized responder wallet." />
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
                    The patient will see who accessed their profile, when, and why. This cannot be
                    removed.
                  </p>
                </div>
              </div>
              {allowed === false ? (
                <p className="mt-4 text-sm text-rado-error" role="alert">
                  This wallet is not a registered emergency responder.
                </p>
              ) : null}
              <label className="mt-5 block text-sm text-rado-slate" htmlFor="emergency-patient">
                Patient
              </label>
              <select
                className="field mt-2"
                disabled={!patients.length || busy}
                id="emergency-patient"
                onChange={(event) => {
                  setSelected(event.target.value);
                  setSummary(null);
                  setMessage(null);
                }}
                value={target?.patient ?? ""}
              >
                {!patients.length ? (
                  <option value="">{loading ? "Loading…" : "No patients available"}</option>
                ) : null}
                {patients.map(({ patient }) => (
                  <option key={patient} value={patient}>
                    {labelFor(patient)}
                  </option>
                ))}
              </select>
              <label className="mt-4 block text-sm text-rado-slate" htmlFor="emergency-reason">
                Reason for access
              </label>
              <select
                className="field mt-2"
                disabled={busy}
                id="emergency-reason"
                onChange={(event) => setCategory(event.target.value as BreakGlassCategory | "")}
                value={category}
              >
                <option value="">Choose a reason</option>
                {(Object.keys(BREAK_GLASS_REASONS) as BreakGlassCategory[]).map((item) => (
                  <option key={item} value={item}>
                    {BREAK_GLASS_REASONS[item]}
                  </option>
                ))}
              </select>
              <label className="mt-4 block text-sm text-rado-slate" htmlFor="emergency-note">
                {category === "other" ? "Describe the reason" : "Note (optional)"}
              </label>
              <input
                className="field mt-2"
                disabled={busy}
                id="emergency-note"
                maxLength={280}
                onChange={(event) => setNote(event.target.value)}
                value={note}
              />
              <p className="mt-2 text-xs leading-5 text-rado-slate">
                Encrypted so only you and the patient can read it. It is never public.
              </p>
              <button
                className="button-primary mt-4 w-full justify-center disabled:opacity-50"
                disabled={!target || !allowed || !reasonReady || busy}
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
            title="Emergency profile"
            description="Name, date of birth, blood group, allergies, and emergency contact only."
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
                    <span className="text-right text-base text-rado-ink">
                      <Peel index={summary.indexOf(item)}>
                        <DecryptText text={item.value} />
                      </Peel>
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div>
                <dl className="grid gap-3 rounded-[10px] bg-rado-stone-wash p-4">
                  {[
                    ["Patient", "62%"],
                    ["Date of birth", "34%"],
                    ["Blood group", "20%"],
                    ["Allergies", "78%"],
                    ["Emergency contact", "54%"],
                  ].map(([label, width]) => (
                    <div className="grid grid-cols-[9rem_1fr] items-center gap-3" key={label}>
                      <dt className="text-sm text-rado-slate">{label}</dt>
                      <dd className="m-0 leading-none">
                        <RedactionBar label={`${label} locked`} width={width} />
                      </dd>
                    </div>
                  ))}
                </dl>
                <p className="mt-3 text-sm leading-6 text-rado-slate">
                  Give a reason and invoke break-glass to log the access and open this profile.
                </p>
              </div>
            )}
          </Panel>
        </div>
      </div>
    </>
  );
}
