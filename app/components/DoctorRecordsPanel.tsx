"use client";

import type { Hex32 } from "@rado/shared";
import { useEffect, useState } from "react";

import { plainRecordError, type OpenedRecord, type SharedRecord } from "../lib/record-service";
import { DocumentViewer } from "./DocumentViewer";
import { ProfileDetails } from "./PatientProfilePanel";
import {
  formatExpiry,
  RecordItems,
  shortId,
  StatusMessage,
  UnlockGate,
  useRecordSession,
  WalletPromptNotice,
} from "./RecordSession";
import { Badge, Panel } from "./ui";

const POLL_MS = 5_000;
const STATUS_TONE = { Active: "success", Expired: "neutral", Revoked: "warning" } as const;

type PanelText = { title: string; description: string; unlockPurpose: string; className: string };

const DOCTOR_TEXT: PanelText = {
  title: "Doctor record view",
  description: "Records patients shared with this wallet. Each view is logged on-chain first.",
  unlockPurpose: "Sign once in your doctor wallet so patients can share records with you.",
  className: "mt-14",
};

/** Keyed by wallet, so decrypted data never survives a wallet change or lock. */
export function DoctorRecordsPanel({ text = DOCTOR_TEXT }: { text?: PanelText }) {
  const { session } = useRecordSession();
  return <DoctorRecordsContent key={session?.address ?? "locked"} text={text} />;
}

function DoctorRecordsContent({ text }: { text: PanelText }) {
  const { session, revision, refresh } = useRecordSession();
  const [records, setRecords] = useState<SharedRecord[]>([]);
  const [patientNames, setPatientNames] = useState<Map<string, string>>(new Map());
  const [opened, setOpened] = useState<{ recordId: Hex32; content: OpenedRecord } | null>(null);
  const [busy, setBusy] = useState("");
  const [walletPrompt, setWalletPrompt] = useState("");
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    if (!session) return;
    let current = true;
    const load = () =>
      Promise.all([session.service.listSharedRecords(), session.service.patientNames(session.keys)])
        .then(([next, nextNames]) => {
          if (!current) return;
          setRecords(next);
          setPatientNames(nextNames);
        })
        .catch(() => {
          if (current) setMessage({ ok: false, text: "Could not load shared records." });
        });
    void load();
    const timer = setInterval(() => void load(), POLL_MS);
    return () => {
      current = false;
      clearInterval(timer);
    };
  }, [session, revision]);

  async function open(recordId: Hex32) {
    if (!session) return;
    setBusy(recordId);
    setMessage(null);
    setOpened(null);
    try {
      const content = await session.service.openRecord(session.keys, recordId, setWalletPrompt);
      setOpened({ recordId, content });
      setMessage({ ok: true, text: "This view was logged on-chain before the record opened." });
      refresh();
    } catch (error) {
      setMessage({ ok: false, text: plainRecordError(error) });
    } finally {
      setBusy("");
      setWalletPrompt("");
    }
  }

  return (
    <Panel className={text.className} title={text.title} description={text.description}>
      {session ? (
        <>
          <WalletPromptNotice text={walletPrompt} />
          <StatusMessage message={message} />
          {records.length ? (
            <div className="divide-y divide-rado-line">
              {records.map(({ recordId, patient, expiresAt, status }) => {
                const isOpen = opened?.recordId === recordId && status === "Active";
                return (
                  <div className="py-4 first:pt-0 last:pb-0" key={recordId}>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                      <div className="min-w-0 flex-1">
                        <p className="text-base text-rado-ink">
                          Encrypted record {shortId(recordId)}
                        </p>
                        <p className="mt-0.5 text-xs text-rado-slate">
                          {patientNames.has(patient.toLowerCase())
                            ? `${patientNames.get(patient.toLowerCase())} - ${shortId(patient)}`
                            : `Patient ${shortId(patient)}`}
                          {status === "Revoked"
                            ? " · Access removed"
                            : ` · ${status === "Active" ? "Expires" : "Ended"} ${formatExpiry(expiresAt)}`}
                        </p>
                      </div>
                      <Badge tone={STATUS_TONE[status]}>{status}</Badge>
                      <button
                        className="button-pill-outline disabled:opacity-50"
                        disabled={Boolean(busy) || status !== "Active"}
                        onClick={() => (isOpen ? setOpened(null) : void open(recordId))}
                        type="button"
                      >
                        {busy === recordId
                          ? "Check your wallet…"
                          : isOpen
                            ? "Close"
                            : status === "Active"
                              ? "Log view and open"
                              : "No access"}
                      </button>
                    </div>
                    {isOpen && opened.content.kind === "record" ? (
                      <RecordItems items={opened.content.items} />
                    ) : null}
                    {isOpen && opened.content.kind === "profile" ? (
                      <ProfileDetails profile={opened.content.profile} />
                    ) : null}
                    {isOpen && opened.content.kind === "document" ? (
                      <DocumentViewer
                        canDownload={false}
                        document={opened.content.document}
                        onClose={() => setOpened(null)}
                      />
                    ) : null}
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="py-4 text-sm text-rado-slate">
              No patient has shared a record with this wallet yet.
            </p>
          )}
        </>
      ) : (
        <UnlockGate purpose={text.unlockPurpose} />
      )}
    </Panel>
  );
}
