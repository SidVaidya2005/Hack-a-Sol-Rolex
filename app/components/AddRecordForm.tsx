"use client";

import { MAX_DOCUMENT_BYTES, PATIENT_ENTRY_TYPES } from "@rado/shared";
import type { DocumentCategory, PatientEntryType } from "@rado/shared";
import { useState } from "react";

import { RecordError, type WalletPromptHandler } from "../lib/record-service";
import { useRecordSession } from "./RecordSession";

const ENTRY_TYPES = Object.keys(PATIENT_ENTRY_TYPES) as PatientEntryType[];
const FILE_CATEGORY: Record<PatientEntryType, DocumentCategory> = {
  condition: "other",
  medication: "prescription",
  allergy: "other",
  "lab-result": "lab-report",
  procedure: "other",
  note: "other",
};

const initialDetail = (type: PatientEntryType) => (type === "allergy" ? "low" : "");

/** Holds typed details and the chosen file only in React state until they are encrypted. */
export function AddRecordForm({
  busy,
  onRun,
}: {
  busy: string;
  onRun: (id: string, action: (onPrompt: WalletPromptHandler) => Promise<string>) => Promise<void>;
}) {
  const { session } = useRecordSession();
  const [type, setType] = useState<PatientEntryType>("condition");
  const [title, setTitle] = useState("");
  const [detail, setDetail] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [inputKey, setInputKey] = useState(0);
  const labels = PATIENT_ENTRY_TYPES[type];
  const saving = busy === "add-record";
  const tooLarge = Boolean(file && file.size > MAX_DOCUMENT_BYTES);
  const hasDetails = Boolean(title.trim()) || (type === "note" && Boolean(detail.trim()));

  function reset(nextType: PatientEntryType) {
    setType(nextType);
    setTitle("");
    setDetail(initialDetail(nextType));
  }

  async function save() {
    if (!session || tooLarge || (!hasDetails && !file)) return;
    const chosen = file;
    await onRun("add-record", async (onPrompt) => {
      if (hasDetails) {
        await session.service.addPatientEntry(session.keys, { type, title, detail }, onPrompt);
      }
      if (chosen) {
        try {
          const bytes = new Uint8Array(await chosen.arrayBuffer());
          await session.service.addDocument(
            session.keys,
            { name: chosen.name, category: FILE_CATEGORY[type], bytes },
            onPrompt,
          );
        } catch (error) {
          if (!hasDetails) throw error;
          throw new RecordError("Your details were saved, but the file was not. Add it again.");
        }
      }
      reset(type);
      setFile(null);
      setInputKey((value) => value + 1);
      return "Record encrypted and saved.";
    });
  }

  return (
    <div className="mb-6 rounded-lg border border-rado-line p-4">
      <p className="text-base text-rado-ink">Add a record</p>
      <p className="mt-1 text-xs leading-5 text-rado-slate">
        Enter the details, attach a PDF, PNG, or JPG up to 5 MB, or do both.
      </p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <div>
          <label className="mb-1.5 block text-xs text-rado-slate" htmlFor="record-type">
            Record type
          </label>
          <select
            className="field"
            disabled={saving}
            id="record-type"
            onChange={(event) => reset(event.target.value as PatientEntryType)}
            value={type}
          >
            {ENTRY_TYPES.map((item) => (
              <option key={item} value={item}>
                {PATIENT_ENTRY_TYPES[item].label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1.5 block text-xs text-rado-slate" htmlFor="record-title">
            {labels.title}
          </label>
          <input
            className="field"
            disabled={saving}
            id="record-title"
            maxLength={120}
            onChange={(event) => setTitle(event.target.value)}
            value={title}
          />
        </div>
        <div className="sm:col-span-2">
          <label className="mb-1.5 block text-xs text-rado-slate" htmlFor="record-detail">
            {labels.detail}
          </label>
          {type === "allergy" ? (
            <select
              className="field"
              disabled={saving}
              id="record-detail"
              onChange={(event) => setDetail(event.target.value)}
              value={detail}
            >
              <option value="low">Mild or moderate</option>
              <option value="high">Severe</option>
            </select>
          ) : type === "note" ? (
            <textarea
              className="field min-h-24"
              disabled={saving}
              id="record-detail"
              maxLength={1000}
              onChange={(event) => setDetail(event.target.value)}
              value={detail}
            />
          ) : (
            <input
              className="field"
              disabled={saving}
              id="record-detail"
              maxLength={200}
              onChange={(event) => setDetail(event.target.value)}
              type={type === "procedure" ? "date" : "text"}
              value={detail}
            />
          )}
        </div>
        <div className="sm:col-span-2">
          <label className="mb-1.5 block text-xs text-rado-slate" htmlFor="record-file">
            Attachment (optional)
          </label>
          <input
            accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg"
            className="field"
            disabled={saving}
            id="record-file"
            key={inputKey}
            onChange={(event) => setFile(event.target.files?.[0] ?? null)}
            type="file"
          />
        </div>
      </div>
      {tooLarge ? (
        <p className="mt-2 text-xs text-rado-error" role="alert">
          This file is larger than the 5 MB limit.
        </p>
      ) : null}
      <div className="mt-3 flex items-center justify-between gap-3">
        <p className="text-xs text-rado-slate">Saved as patient-reported.</p>
        <button
          className="button-primary whitespace-nowrap disabled:opacity-50"
          disabled={Boolean(busy) || !session || tooLarge || (!hasDetails && !file)}
          onClick={() => void save()}
          type="button"
        >
          {saving ? "Encrypting…" : "Encrypt and save"}
        </button>
      </div>
    </div>
  );
}
