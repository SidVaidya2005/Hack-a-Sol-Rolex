"use client";

import { BLOOD_GROUPS } from "@rado/shared";
import type { BloodGroup, PatientProfile } from "@rado/shared";
import { useEffect, useState } from "react";

import { plainRecordError } from "../lib/record-service";
import { DecryptText, InsurerBlackout, Peel } from "./dossier";
import { StatusMessage, useRecordSession, WalletPromptNotice } from "./RecordSession";
import { Panel } from "./ui";

const EMPTY_PROFILE: PatientProfile = {
  fullName: "",
  dateOfBirth: "",
  bloodGroup: "Unknown",
  allergies: "",
  emergencyContact: "",
};

export function ProfileDetails({ profile }: { profile: PatientProfile }) {
  const rows = [
    ["Name", profile.fullName],
    ["Date of birth", profile.dateOfBirth],
    ["Blood group", profile.bloodGroup],
    ["Allergies", profile.allergies || "None listed"],
    ["Emergency contact", profile.emergencyContact || "None listed"],
  ];
  return (
    <dl className="mt-3 divide-y divide-rado-line rounded-[10px] border border-rado-line px-3.5">
      {rows.map(([label, value], index) => (
        <div className="grid grid-cols-[8.5rem_1fr] items-baseline gap-x-3 py-2.5" key={label}>
          <dt className="font-mono text-[10px] uppercase tracking-[0.1em] text-rado-muted">
            {label}
          </dt>
          <dd className="m-0 min-w-0 break-words text-sm text-rado-ink">
            <Peel index={index}>
              <DecryptText text={value ?? ""} />
            </Peel>
          </dd>
        </div>
      ))}
    </dl>
  );
}

/** Holds typed details only in React state until they are encrypted in this browser. */
export function ProfileForm({ onSaved }: { onSaved: () => void }) {
  const { session, refresh } = useRecordSession();
  const [form, setForm] = useState<PatientProfile>(EMPTY_PROFILE);
  const [busy, setBusy] = useState(false);
  const [walletPrompt, setWalletPrompt] = useState("");
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const update = (field: keyof PatientProfile, value: string) =>
    setForm((current) => ({ ...current, [field]: value }));

  async function save() {
    if (!session) return;
    setBusy(true);
    setMessage(null);
    try {
      await session.service.addProfile(session.keys, form, setWalletPrompt);
      refresh();
      onSaved();
    } catch (error) {
      setMessage({ ok: false, text: plainRecordError(error) });
    } finally {
      setBusy(false);
      setWalletPrompt("");
    }
  }

  return (
    <div>
      <WalletPromptNotice text={walletPrompt} />
      <StatusMessage message={message} />
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-1.5 block text-xs text-rado-slate" htmlFor="profile-name">
            Full name
          </label>
          <input
            className="field"
            disabled={busy}
            id="profile-name"
            maxLength={80}
            onChange={(event) => update("fullName", event.target.value)}
            value={form.fullName}
          />
        </div>
        <div>
          <label className="mb-1.5 block text-xs text-rado-slate" htmlFor="profile-birth">
            Date of birth
          </label>
          <input
            className="field"
            disabled={busy}
            id="profile-birth"
            onChange={(event) => update("dateOfBirth", event.target.value)}
            type="date"
            value={form.dateOfBirth}
          />
        </div>
        <div>
          <label className="mb-1.5 block text-xs text-rado-slate" htmlFor="profile-blood">
            Blood group
          </label>
          <select
            className="field"
            disabled={busy}
            id="profile-blood"
            onChange={(event) => update("bloodGroup", event.target.value as BloodGroup)}
            value={form.bloodGroup}
          >
            {BLOOD_GROUPS.map((group) => (
              <option key={group} value={group}>
                {group}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1.5 block text-xs text-rado-slate" htmlFor="profile-contact">
            Emergency contact (optional)
          </label>
          <input
            className="field"
            disabled={busy}
            id="profile-contact"
            maxLength={120}
            onChange={(event) => update("emergencyContact", event.target.value)}
            value={form.emergencyContact}
          />
        </div>
        <div className="sm:col-span-2">
          <label className="mb-1.5 block text-xs text-rado-slate" htmlFor="profile-allergies">
            Allergies (optional)
          </label>
          <input
            className="field"
            disabled={busy}
            id="profile-allergies"
            maxLength={200}
            onChange={(event) => update("allergies", event.target.value)}
            value={form.allergies}
          />
        </div>
      </div>
      <div className="mt-4 flex flex-wrap items-center justify-end gap-4">
        <button
          className="button-primary disabled:opacity-50"
          disabled={busy || !form.fullName.trim() || !form.dateOfBirth}
          onClick={() => void save()}
          type="button"
        >
          {busy ? "Encrypting…" : "Encrypt and save"}
        </button>
      </div>
    </div>
  );
}

/** Reads the patient's own profile. Decrypted details stay in this component's memory. */
export function usePatientProfile() {
  const { session, revision } = useRecordSession();
  const [result, setResult] = useState<{
    address: string;
    profile: PatientProfile | null;
    failed: boolean;
  } | null>(null);

  useEffect(() => {
    if (!session) return;
    let current = true;
    session.service
      .findProfile(session.keys)
      .then((found) => {
        if (current) {
          setResult({ address: session.address, profile: found?.profile ?? null, failed: false });
        }
      })
      .catch(() => {
        if (current) setResult({ address: session.address, profile: null, failed: true });
      });
    return () => {
      current = false;
    };
  }, [session, revision]);

  const own = result?.address === session?.address ? result : null;
  return { loaded: Boolean(own), profile: own?.profile ?? null, failed: own?.failed ?? false };
}

/** Lets a patient reach hospitals and responders that joined after their last name card. */
function ShareNameNotice() {
  const { session, revision, refresh } = useRecordSession();
  const [gap, setGap] = useState(0);
  const [busy, setBusy] = useState(false);
  const [walletPrompt, setWalletPrompt] = useState("");
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    if (!session) return;
    let current = true;
    const load = () =>
      session.service
        .nameCardGap(session.keys)
        .then((next) => {
          if (current) setGap(next);
        })
        .catch(() => undefined);
    void load();
    const timer = setInterval(() => void load(), 5_000);
    return () => {
      current = false;
      clearInterval(timer);
    };
  }, [session, revision]);

  async function share() {
    if (!session) return;
    setBusy(true);
    setMessage(null);
    try {
      await session.service.shareName(session.keys, setWalletPrompt);
      setGap(0);
      setMessage({ ok: true, text: "Your name is visible to hospitals, doctors, and responders." });
      refresh();
    } catch (error) {
      setMessage({ ok: false, text: plainRecordError(error) });
    } finally {
      setBusy(false);
      setWalletPrompt("");
    }
  }

  return (
    <div className="mt-4">
      <WalletPromptNotice text={walletPrompt} />
      <StatusMessage message={message} />
      {gap > 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-[10px] bg-rado-stone-wash px-3.5 py-3">
          <p className="min-w-48 flex-1 text-xs leading-5 text-rado-slate">
            {gap === 1 ? "1 care wallet" : `${gap} care wallets`} cannot see your name yet. Only
            your name is shared, never with insurers, labs, or pharmacies.
          </p>
          <button
            className="button-pill-outline whitespace-nowrap disabled:opacity-50"
            disabled={busy}
            onClick={() => void share()}
            type="button"
          >
            {busy ? "Sharing…" : "Share my name"}
          </button>
        </div>
      ) : null}
    </div>
  );
}

export function PatientProfilePanel() {
  const { loaded, profile, failed } = usePatientProfile();
  return (
    <Panel
      title="Your profile"
      description="Encrypted in this browser. Share it with a hospital or doctor from Your records. The emergency responder can open it only through a logged break-glass."
    >
      <InsurerBlackout />
      {failed ? (
        <p className="text-sm text-rado-error">Could not load your profile.</p>
      ) : !loaded ? (
        <p className="text-sm text-rado-slate">Loading your profile…</p>
      ) : profile ? (
        <>
          <ProfileDetails profile={profile} />
          <ShareNameNotice />
        </>
      ) : (
        <ProfileForm onSaved={() => undefined} />
      )}
    </Panel>
  );
}
