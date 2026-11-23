"use client";

import {
  canShareDocument,
  DOCUMENT_CATEGORIES,
  SAMPLE_CARE_RECORD,
  SAMPLE_EMERGENCY_SUMMARY,
  SHARE_PROFILES,
  utf8Encode,
} from "@rado/shared";
import type { Address, Hex32 } from "@rado/shared";
import { useEffect, useState } from "react";

import { shareProfileFor, type Provider } from "../lib/providers";
import {
  plainRecordError,
  type OpenedRecord,
  type PatientRecord,
  type RecordInfo,
  type TimelineEntry,
  type WalletPromptHandler,
} from "../lib/record-service";
import { DocumentUploadForm } from "./DocumentUploadForm";
import { DocumentViewer, formatDocumentSize } from "./DocumentViewer";
import { Icon } from "./icons";
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

const EXPIRY_OPTIONS = [1, 7, 30];
const POLL_MS = 5_000;
const STATUS_TONE = { Active: "success", Expired: "neutral", Revoked: "warning" } as const;

function providerFor(wallet: string, providers: Provider[]) {
  return providers.find((item) => item.wallet.toLowerCase() === wallet.toLowerCase());
}

function providerLabel(wallet: string, providers: Provider[]) {
  const provider = providerFor(wallet, providers);
  return provider ? `${provider.name} · ${shortId(wallet)}` : `Unlisted · ${shortId(wallet)}`;
}

function RecordRow({
  record,
  emergency,
  info,
  wallets,
  providers,
  busy,
  onRun,
}: {
  record: PatientRecord;
  emergency: boolean;
  /** Undefined until this record has been read, so a copy is never mistaken for a full record. */
  info: RecordInfo | undefined;
  wallets: Address[];
  providers: Provider[];
  busy: string;
  onRun: (id: string, action: (onPrompt: WalletPromptHandler) => Promise<string>) => Promise<void>;
}) {
  const { session } = useRecordSession();
  const [opened, setOpened] = useState<OpenedRecord | null>(null);
  const [selected, setSelected] = useState("");
  const [days, setDays] = useState(7);
  const { recordId, grants, keyVersion } = record;
  const sliceProfile = info === undefined ? undefined : info.sliceProfile;
  const documentInfo = info?.document ?? null;
  const active = new Set(
    grants.filter(({ status }) => status === "Active").map(({ reader }) => reader.toLowerCase()),
  );
  // A limited copy can only go to its own provider type, so a lab never gets a pharmacy copy.
  const candidates = wallets
    .filter((wallet) => !active.has(wallet.toLowerCase()))
    .filter((wallet) => !sliceProfile || providerFor(wallet, providers)?.kind === sliceProfile)
    .filter(
      (wallet) =>
        !documentInfo ||
        canShareDocument(documentInfo.category, providerFor(wallet, providers)?.kind),
    )
    .sort(
      (a, b) =>
        Number(Boolean(providerFor(b, providers))) - Number(Boolean(providerFor(a, providers))),
    );
  const target = candidates.find((wallet) => wallet === selected) ?? candidates[0] ?? "";
  const profile = shareProfileFor(target ? providerFor(target, providers)?.kind : undefined);
  const locked = Boolean(busy) || !session;

  return (
    <div className="py-5 first:pt-0 last:pb-0">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <span className="text-rado-muted">
          <Icon name="file" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-base text-rado-ink">
            {documentInfo
              ? documentInfo.name
              : `${
                  emergency
                    ? "Emergency summary"
                    : sliceProfile
                      ? `${SHARE_PROFILES[sliceProfile].label} copy`
                      : "Encrypted record"
                } ${shortId(recordId)}`}
          </p>
          <p className="mt-0.5 font-mono text-xs text-rado-slate">
            {documentInfo
              ? `${DOCUMENT_CATEGORIES[documentInfo.category].label} · ${formatDocumentSize(documentInfo.size)} · `
              : ""}
            Key version {keyVersion.toString()}
          </p>
        </div>
        {emergency ? <Badge tone="warning">Break-glass enabled</Badge> : null}
        <button
          className="button-pill-outline disabled:opacity-50"
          disabled={locked}
          onClick={() =>
            opened
              ? setOpened(null)
              : void onRun(`open-${recordId}`, async () => {
                  if (!session) return "";
                  setOpened(await session.service.openRecord(session.keys, recordId));
                  return "";
                })
          }
          type="button"
        >
          {busy === `open-${recordId}` ? "Opening…" : opened ? "Close" : "Open"}
        </button>
      </div>
      {opened?.kind === "record" ? <RecordItems items={opened.items} /> : null}
      {opened?.kind === "document" ? (
        <DocumentViewer canDownload document={opened.document} onClose={() => setOpened(null)} />
      ) : null}

      <div className="mt-4 divide-y divide-rado-line">
        {grants.map(({ reader, expiresAt, status }) => (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3" key={reader}>
            <div className="min-w-0 flex-1">
              <p className="text-sm text-rado-ink">{providerLabel(reader, providers)}</p>
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
                  void onRun(`revoke-${recordId}-${reader}`, async (onPrompt) => {
                    if (!session) return "";
                    await session.service.revoke(session.keys, recordId, reader, onPrompt);
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
            htmlFor={`grant-provider-${recordId}`}
          >
            Share with
          </label>
          <select
            className="field"
            disabled={!candidates.length}
            id={`grant-provider-${recordId}`}
            onChange={(event) => setSelected(event.target.value)}
            value={target}
          >
            {candidates.length ? (
              candidates.map((wallet) => (
                <option key={wallet} value={wallet}>
                  {providerLabel(wallet, providers)}
                </option>
              ))
            ) : (
              <option value="">
                {sliceProfile || documentInfo
                  ? "No allowed provider has unlocked"
                  : "No other unlocked wallets"}
              </option>
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
          disabled={locked || !target || sliceProfile === undefined}
          onClick={() =>
            void onRun(`grant-${recordId}`, async (onPrompt) => {
              if (!session || !target) return "";
              if (!documentInfo && !sliceProfile && profile !== "hospital") {
                const { expiresAt } = await session.service.shareSlice(
                  session.keys,
                  recordId,
                  target as Address,
                  profile,
                  days,
                  onPrompt,
                );
                return `Limited ${SHARE_PROFILES[profile].label.toLowerCase()} copy shared until ${formatExpiry(expiresAt)}.`;
              }
              const expiresAt = await session.service.grant(
                session.keys,
                recordId as Hex32,
                target as Address,
                days,
                onPrompt,
              );
              return `Access granted until ${formatExpiry(expiresAt)}.`;
            })
          }
          type="button"
        >
          {busy === `grant-${recordId}`
            ? "Sharing…"
            : !documentInfo && !sliceProfile && profile !== "hospital"
              ? "Share limited copy"
              : "Grant access"}
        </button>
      </div>
      {target && documentInfo ? (
        <div className="mt-3 grid gap-3 rounded-lg bg-rado-stone-wash px-4 py-3 text-xs sm:grid-cols-2">
          <div>
            <p className="text-rado-ink">Will be shared</p>
            <p className="mt-1 text-rado-slate">
              The whole document. A file cannot be partly shared, so check that it holds only what
              this provider needs.
            </p>
          </div>
          <div>
            <p className="text-rado-ink">Stays private</p>
            <p className="mt-1 text-rado-slate">Your other records and documents</p>
          </div>
        </div>
      ) : null}
      {target && !documentInfo && sliceProfile !== undefined ? (
        <div className="mt-3 grid gap-3 rounded-lg bg-rado-stone-wash px-4 py-3 text-xs sm:grid-cols-2">
          <div>
            <p className="text-rado-ink">Will be shared</p>
            <p className="mt-1 text-rado-slate">
              {sliceProfile
                ? SHARE_PROFILES[sliceProfile].shares.join(", ")
                : SHARE_PROFILES[profile].shares.join(", ")}
            </p>
          </div>
          <div>
            <p className="text-rado-ink">Stays private</p>
            <p className="mt-1 text-rado-slate">
              {SHARE_PROFILES[sliceProfile ?? profile].withholds.join(", ") ||
                "Nothing. This wallet can read the whole record."}
            </p>
          </div>
        </div>
      ) : null}
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
  const [providers, setProviders] = useState<Provider[]>([]);
  const [recordInfos, setRecordInfos] = useState<Map<string, RecordInfo>>(new Map());
  const [summaryIds, setSummaryIds] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState("");
  const [walletPrompt, setWalletPrompt] = useState("");
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    if (!session) return;
    let current = true;
    const load = () =>
      Promise.all([
        session.service.listPatientRecords(),
        session.service.listRegisteredWallets(),
        session.service.listProviders(),
      ])
        .then(async ([nextRecords, nextWallets, nextProviders]) => {
          if (!current) return;
          setRecords(nextRecords);
          setWallets(nextWallets);
          setProviders(nextProviders);
          const nextInfos = await session.service.recordInfos(
            session.keys,
            nextRecords.map(({ recordId }) => recordId),
          );
          if (current) setRecordInfos(nextInfos);
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

  // Separate and unpolled, so an escrow problem can never affect records or the claim flow.
  useEffect(() => {
    if (!session) return;
    let current = true;
    session.service
      .emergencySummaryIds()
      .then((ids) => {
        if (current) setSummaryIds(ids);
      })
      .catch(() => {});
    return () => {
      current = false;
    };
  }, [session, revision]);

  async function run(id: string, action: (onPrompt: WalletPromptHandler) => Promise<string>) {
    setBusy(id);
    setMessage(null);
    try {
      const text = await action(setWalletPrompt);
      if (text) setMessage({ ok: true, text });
      refresh();
    } catch (error) {
      setMessage({ ok: false, text: plainRecordError(error) });
    } finally {
      setBusy("");
      setWalletPrompt("");
    }
  }

  return (
    <Panel
      title="Your records"
      description="Encrypted in this browser. You choose who can read them and for how long."
      action={
        session ? (
          <div className="flex flex-wrap justify-end gap-2">
            <button
              className="button-pill-outline whitespace-nowrap disabled:opacity-50"
              disabled={Boolean(busy) || summaryIds.size > 0}
              onClick={() =>
                void run("add-summary", async (onPrompt) => {
                  await session.service.addEmergencySummary(
                    session.keys,
                    utf8Encode(JSON.stringify(SAMPLE_EMERGENCY_SUMMARY)),
                    onPrompt,
                  );
                  return "Emergency summary encrypted. Only this summary can be released in an emergency.";
                })
              }
              type="button"
            >
              {busy === "add-summary"
                ? "Adding…"
                : summaryIds.size > 0
                  ? "Emergency summary added"
                  : "Add emergency summary"}
            </button>
            <button
              className="button-primary whitespace-nowrap disabled:opacity-50"
              disabled={Boolean(busy)}
              onClick={() =>
                void run("add", async (onPrompt) => {
                  await session.service.addRecord(
                    session.keys,
                    utf8Encode(JSON.stringify(SAMPLE_CARE_RECORD)),
                    onPrompt,
                  );
                  return "Synthetic record encrypted, stored, and anchored on-chain.";
                })
              }
              type="button"
            >
              <Icon name="plus" className="size-4" />
              {busy === "add" ? "Adding…" : "Add synthetic record"}
            </button>
          </div>
        ) : null
      }
    >
      {session ? (
        <>
          <WalletPromptNotice text={walletPrompt} />
          <StatusMessage message={message} />
          <DocumentUploadForm busy={busy} onRun={run} />
          {records.length ? (
            <div className="divide-y divide-rado-line">
              {records.map((record) => (
                <RecordRow
                  busy={busy}
                  emergency={summaryIds.has(record.recordId)}
                  key={record.recordId}
                  onRun={run}
                  providers={providers}
                  info={recordInfos.get(record.recordId)}
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
