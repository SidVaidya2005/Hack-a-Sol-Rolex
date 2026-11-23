"use client";

import { DOCUMENT_CATEGORIES, MAX_DOCUMENT_BYTES } from "@rado/shared";
import type { DocumentCategory } from "@rado/shared";
import { useState } from "react";

import { RecordError, type WalletPromptHandler } from "../lib/record-service";
import { useRecordSession } from "./RecordSession";

const CATEGORIES = Object.keys(DOCUMENT_CATEGORIES) as DocumentCategory[];
const DEMO_FILES = [
  ["Prescription", "/demo-documents/demo-prescription.pdf"],
  ["Lab report", "/demo-documents/demo-lab-report.pdf"],
  ["Discharge summary", "/demo-documents/demo-discharge-summary.pdf"],
] as const;

/** Holds the chosen file only in React state, and clears it once the upload finishes. */
export function DocumentUploadForm({
  busy,
  onRun,
}: {
  busy: string;
  onRun: (id: string, action: (onPrompt: WalletPromptHandler) => Promise<string>) => Promise<void>;
}) {
  const { session } = useRecordSession();
  const [file, setFile] = useState<File | null>(null);
  const [category, setCategory] = useState<DocumentCategory>("lab-report");
  const [confirmed, setConfirmed] = useState(false);
  const [inputKey, setInputKey] = useState(0);
  const tooLarge = Boolean(file && file.size > MAX_DOCUMENT_BYTES);
  const uploading = busy === "upload-document";

  async function upload() {
    if (!session || !file || !confirmed || tooLarge) return;
    const chosen = file;
    await onRun("upload-document", async (onPrompt) => {
      let bytes: Uint8Array;
      try {
        bytes = new Uint8Array(await chosen.arrayBuffer());
      } catch {
        throw new RecordError("This file could not be read.");
      }
      await session.service.addDocument(
        session.keys,
        { name: chosen.name, category, bytes },
        onPrompt,
      );
      setFile(null);
      setConfirmed(false);
      setInputKey((value) => value + 1);
      return "Document encrypted, stored, and anchored on-chain.";
    });
  }

  return (
    <div className="mb-6 rounded-lg border border-rado-line p-4">
      <p className="text-base text-rado-ink">Upload a document</p>
      <p className="mt-1 text-xs leading-5 text-rado-slate">
        <strong className="font-normal text-rado-error">Demo files only.</strong> Do not upload real
        medical documents. PDF, PNG, or JPG up to 750 KB. Try a sample:{" "}
        {DEMO_FILES.map(([label, href], index) => (
          <span key={href}>
            {index ? ", " : ""}
            <a className="underline" download href={href}>
              {label}
            </a>
          </span>
        ))}
        .
      </p>
      <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
        <div>
          <label className="mb-1.5 block text-xs text-rado-slate" htmlFor="document-file">
            File
          </label>
          <input
            accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg"
            className="field"
            disabled={uploading}
            id="document-file"
            key={inputKey}
            onChange={(event) => setFile(event.target.files?.[0] ?? null)}
            type="file"
          />
        </div>
        <div>
          <label className="mb-1.5 block text-xs text-rado-slate" htmlFor="document-category">
            Category
          </label>
          <select
            className="field"
            disabled={uploading}
            id="document-category"
            onChange={(event) => setCategory(event.target.value as DocumentCategory)}
            value={category}
          >
            {CATEGORIES.map((item) => (
              <option key={item} value={item}>
                {DOCUMENT_CATEGORIES[item].label}
              </option>
            ))}
          </select>
        </div>
      </div>
      {tooLarge ? (
        <p className="mt-2 text-xs text-rado-error" role="alert">
          This file is larger than the 750 KB limit.
        </p>
      ) : null}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <label className="flex items-center gap-2 text-xs text-rado-ink">
          <input
            checked={confirmed}
            disabled={uploading}
            onChange={(event) => setConfirmed(event.target.checked)}
            type="checkbox"
          />
          This is a made-up demo file with no real patient information.
        </label>
        <button
          className="button-primary whitespace-nowrap disabled:opacity-50"
          disabled={Boolean(busy) || !session || !file || !confirmed || tooLarge}
          onClick={() => void upload()}
          type="button"
        >
          {uploading ? "Encrypting…" : "Encrypt and upload"}
        </button>
      </div>
    </div>
  );
}
