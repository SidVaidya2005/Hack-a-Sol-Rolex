"use client";

import { SAMPLE_RECORD, utf8Encode } from "@rado/shared";
import type { Address, Hex32 } from "@rado/shared";
import { useEffect, useState } from "react";

import {
  plainRecordError,
  type PatientRecord,
  type RecordItem,
  type TimelineEntry,
} from "../lib/record-service";
import { Icon } from "./icons";
import {
  formatExpiry,
  RecordItems,
  shortId,
  StatusMessage,
  UnlockGate,
  useRecordSession,
} from "./RecordSession";
import { Badge, Panel } from "./ui";

const EXPIRY_OPTIONS = [1, 7, 30];
const POLL_MS = 5_000;
const STATUS_TONE = { Active: "success", Expired: "neutral", Revoked: "warning" } as const;

function RecordRow({
  record,
  wallets,
  busy,
  onRun,
}: {
  record: PatientRecord;
  wallets: Address[];
  busy: string;
  onRun: (id: string, action: () => Promise<string>) => Promise<void>;
}) {
  const { session } = useRecordSession();
  const [opened, setOpened] = useState<RecordItem[] | null>(null);
  const [selected, setSelected] = useState("");
  const [days, setDays] = useState(7);
  const { recordId, grants, keyVersion } = record;
  const active = new Set(
    grants.filter(({ status }) => status === "Active").map(({ reader }) => reader.toLowerCase()),
  );
  const candidates = wallets.filter((wallet) => !active.has(wallet.toLowerCase()));
  const doctor = candidates.find((wallet) => wallet === selected) ?? candidates[0] ?? "";
  const locked = Boolean(busy) || !session;

  return (
    <div className="py-5 first:pt-0 last:pb-0">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <span className="text-rado-muted">
          <Icon name="file" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-base text-rado-ink">Encrypted record {shortId(recordId)}</p>
          <p className="mt-0.5 font-mono text-xs text-rado-slate">
            Key version {keyVersion.toString()}
          </p>
        </div>
        <button
          className="button-pill-outline disabled:opacity-50"
          disabled={locked}
          onClick={() =>
            opened
              ? setOpened(null)
              : void onRun(`open-${recordId}`, async () => {
                  if (!session) return "";
                  setOpened(await session.service.open(session.keys, recordId));
                  return "";
                })
          }
          type="button"
        >
          {busy === `open-${recordId}` ? "Opening…" : opened ? "Close" : "Open"}
        </button>
      </div>
      {opened ? <RecordItems items={opened} /> : null}

      <div className="mt-4 divide-y divide-rado-line">
        {grants.map(({ reader, expiresAt, status }) => (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3" key={reader}>
            <div className="min-w-0 flex-1">
              <p className="font-mono text-sm text-rado-ink">{shortId(reader)}</p>
              <p className="text-xs text-rado-slate">
                {status === "Revoked"
                  ? "Access removed"
                  : `${status === "Active" ? "Expires" : "Ended"} ${formatExpiry(expiresAt)}`}
              </p>
            </div>
            <Badge tone={STATUS_TONE[status]}>{status}</Badge>
            {status !== "Revoked" ? (
              <button
                aria-label={`Revoke ${reader}`}
                className="button-pill-outline disabled:opacity-50"
                disabled={locked}
                onClick={() =>
                  void onRun(`revoke-${recordId}-${reader}`, async () => {
                    if (!session) return "";
                    await session.service.revoke(session.keys, recordId, reader);
                    setOpened(null);
                    return "Access revoked and the record key rotated.";
                  })
                }
                type="button"
              >
                {busy === `revoke-${recordId}-${reader}` ? "Rotating…" : "Revoke"}
              </button>
            ) : null}
          </div>
        ))}
      </div>

      <div className="mt-2 grid gap-3 border-t border-rado-line pt-4 sm:grid-cols-[1fr_auto_auto] sm:items-end">
        <div>
          <label
            className="mb-1.5 block text-xs text-rado-slate"
            htmlFor={`grant-doctor-${recordId}`}
          >
            Doctor wallet
          </label>
          <select
            className="field"
            disabled={!candidates.length}
            id={`grant-doctor-${recordId}`}
            onChange={(event) => setSelected(event.target.value)}
            value={doctor}
          >
            {candidates.length ? (
              candidates.map((wallet) => (
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
            htmlFor={`grant-days-${recordId}`}
          >
            Access for
          </label>
          <select
            className="field"
            id={`grant-days-${recordId}`}
            onChange={(event) => setDays(Number(event.target.value))}
            value={days}
          >
            {EXPIRY_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option} {option === 1 ? "day" : "days"}
              </option>
            ))}
          </select>
        </div>
        <button
          className="button-pill-outline h-11 whitespace-nowrap disabled:opacity-50"
          disabled={locked || !doctor}
          onClick={() =>
            void onRun(`grant-${recordId}`, async () => {
              if (!session || !doctor) return "";
              const expiresAt = await session.service.grant(
                session.keys,
                recordId as Hex32,
                doctor as Address,
                days,
              );
              return `Access granted until ${formatExpiry(expiresAt)}.`;
            })
          }
          type="button"
        >
          {busy === `grant-${recordId}` ? "Granting…" : "Grant access"}
        </button>
      </div>
    </div>
  );
}

/** Keyed by wallet, so one wallet's data never shows under another. */
export function PatientRecordsPanel() {
  const { session } = useRecordSession();
  return <PatientRecordsContent key={session?.address ?? "locked"} />;
}

function PatientRecordsContent() {
  const { session, revision, refresh } = useRecordSession();
  const [records, setRecords] = useState<PatientRecord[]>([]);
  const [wallets, setWallets] = useState<Address[]>([]);
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    if (!session) return;
    let current = true;
    const load = () =>
      Promise.all([session.service.listPatientRecords(), session.service.listRegisteredWallets()])
        .then(([nextRecords, nextWallets]) => {
          if (!current) return;
          setRecords(nextRecords);
          setWallets(nextWallets);
        })
        .catch(() => {
          if (current) setMessage({ ok: false, text: "Could not load your records." });
        });
    void load();
    const timer = setInterval(() => void load(), POLL_MS);
    return () => {
      current = false;
      clearInterval(timer);
    };
  }, [session, revision]);

  async function run(id: string, action: () => Promise<string>) {
    setBusy(id);
    setMessage(null);
    try {
      const text = await action();
      if (text) setMessage({ ok: true, text });
      refresh();
    } catch (error) {
      setMessage({ ok: false, text: plainRecordError(error) });
    } finally {
      setBusy("");
    }
  }

  return (
    <Panel
      title="Your records"
      description="Encrypted in this browser. You choose who can read them and for how long."
      action={
        session ? (
          <button
            className="button-primary whitespace-nowrap disabled:opacity-50"
            disabled={Boolean(busy)}
            onClick={() =>
              void run("add", async () => {
                await session.service.addRecord(
                  session.keys,
                  utf8Encode(JSON.stringify(SAMPLE_RECORD)),
                );
                return "Synthetic record encrypted, stored, and anchored on-chain.";
              })
            }
            type="button"
          >
            <Icon name="plus" className="size-4" />
            {busy === "add" ? "Adding…" : "Add synthetic record"}
          </button>
        ) : null
      }
    >
      {session ? (
        <>
          <StatusMessage message={message} />
          {records.length ? (
            <div className="divide-y divide-rado-line">
              {records.map((record) => (
                <RecordRow
                  busy={busy}
                  key={record.recordId}
                  onRun={run}
                  record={record}
                  wallets={wallets}
                />
              ))}
            </div>
          ) : (
            <p className="py-4 text-sm text-rado-slate">
              No records yet. Add a synthetic record to begin.
            </p>
          )}
        </>
      ) : (
        <UnlockGate purpose="Sign once in your wallet to unlock your private keys for this session." />
      )}
    </Panel>
  );
}

export function AuditTimeline() {
  const { session } = useRecordSession();
  return <AuditTimelineContent key={session?.address ?? "locked"} />;
}

function AuditTimelineContent() {
  const { session, revision } = useRecordSession();
  const [entries, setEntries] = useState<TimelineEntry[]>([]);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!session) return;
    let current = true;
    const load = () =>
      session.service
        .timeline()
        .then((next) => {
          if (!current) return;
          setEntries(next);
          setFailed(false);
        })
        .catch(() => {
          if (current) setFailed(true);
        });
    void load();
    const timer = setInterval(() => void load(), POLL_MS);
    return () => {
      current = false;
      clearInterval(timer);
    };
  }, [session, revision]);

  return (
    <Panel title="Audit timeline" description="Read from on-chain events for your records.">
      {!session ? (
        <p className="text-sm text-rado-slate">Unlock Rado to read your timeline.</p>
      ) : failed ? (
        <p className="text-sm text-rado-error">Could not load your timeline.</p>
      ) : entries.length ? (
        <ol className="space-y-4">
          {entries.map((entry, index) => (
            <li className="flex gap-3" key={entry.id}>
              <span
                className={`mt-1.5 size-2 shrink-0 rounded-full ${index === 0 ? "bg-rado-green" : "bg-rado-line"}`}
              />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap justify-between gap-x-3">
                  <p className="text-sm text-rado-ink">{entry.title}</p>
                  <span className="whitespace-nowrap font-mono text-xs text-rado-muted">
                    {formatExpiry(entry.timestamp)}
                  </span>
                </div>
                <p className="mt-0.5 font-mono text-xs text-rado-slate">
                  Record {shortId(entry.recordId)}
                  {entry.actor ? ` · ${shortId(entry.actor)}` : ""}
                </p>
              </div>
            </li>
          ))}
        </ol>
      ) : (
        <p className="text-sm text-rado-slate">No on-chain activity yet.</p>
      )}
    </Panel>
  );
}
