import { utf8Decode, utf8Encode } from "./crypto/bytes.ts";

export type DocumentCategory = "prescription" | "lab-report" | "other";
export type DocumentMime = "application/pdf" | "image/png" | "image/jpeg";
export type DocumentReaderKind = "hospital" | "doctor" | "lab" | "pharmacy";

export interface RadoDocumentInfo {
  name: string;
  mime: DocumentMime;
  category: DocumentCategory;
  size: number;
}

export interface RadoDocument extends RadoDocumentInfo {
  bytes: Uint8Array;
}

/** Its message is plain enough to show a user. */
export class DocumentError extends Error {}

/** 5 MB. Leaves room for base64, bundle fields, and wrapped keys inside the 7 MiB bundle limit. */
export const MAX_DOCUMENT_BYTES = 5 * 1024 * 1024;
const MAX_NAME_CHARS = 120;
const MAX_HEADER_BYTES = 1024;
const MAGIC = utf8Encode("RADODOC1");
const LENGTH_BYTES = 2;
const HEADER_KEYS = ["name", "mime", "category", "size"];
// Control characters and text-direction overrides can disguise a file's real extension.
const UNSAFE_NAME = /[\u0000-\u001f\u007f-\u009f‎‏‪-‮⁦-⁩]/;

export const DOCUMENT_CATEGORIES: Record<
  DocumentCategory,
  { label: string; readers: readonly DocumentReaderKind[] }
> = {
  prescription: { label: "Prescription", readers: ["pharmacy", "hospital", "doctor"] },
  "lab-report": { label: "Lab report", readers: ["lab", "hospital", "doctor"] },
  other: { label: "Other medical document", readers: ["hospital", "doctor"] },
};

const DOCUMENT_TYPES: Record<
  DocumentMime,
  { extensions: readonly string[]; signature: readonly number[] }
> = {
  "application/pdf": { extensions: [".pdf"], signature: [0x25, 0x50, 0x44, 0x46, 0x2d] },
  "image/png": {
    extensions: [".png"],
    signature: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
  },
  "image/jpeg": { extensions: [".jpg", ".jpeg"], signature: [0xff, 0xd8, 0xff] },
};

function isCategory(value: unknown): value is DocumentCategory {
  return typeof value === "string" && Object.hasOwn(DOCUMENT_CATEGORIES, value);
}

/** Reads the type from the file's bytes, because a name or browser label can be faked. */
export function detectDocumentMime(bytes: Uint8Array): DocumentMime | null {
  for (const mime of Object.keys(DOCUMENT_TYPES) as DocumentMime[]) {
    const { signature } = DOCUMENT_TYPES[mime];
    if (signature.every((byte, index) => bytes[index] === byte)) return mime;
  }
  return null;
}

function cleanName(raw: string, mime: DocumentMime): string {
  const name = (raw.split(/[\\/]/).pop() ?? "").trim();
  if (!name || name.startsWith(".") || name.length > MAX_NAME_CHARS || UNSAFE_NAME.test(name)) {
    throw new DocumentError("Rename this file and try again.");
  }
  const lower = name.toLowerCase();
  const extension = DOCUMENT_TYPES[mime].extensions.find((item) => lower.endsWith(item));
  if (!extension || lower.length === extension.length) {
    throw new DocumentError("This file's name does not match its contents.");
  }
  return name;
}

export function encodeDocument(input: {
  name: string;
  category: DocumentCategory;
  bytes: Uint8Array;
}): Uint8Array {
  const { bytes, category } = input;
  if (!isCategory(category)) throw new DocumentError("Choose a document category.");
  if (bytes.length === 0) throw new DocumentError("This file is empty.");
  if (bytes.length > MAX_DOCUMENT_BYTES) {
    throw new DocumentError("This file is larger than the 5 MB limit.");
  }
  const mime = detectDocumentMime(bytes);
  if (!mime) throw new DocumentError("Only PDF, PNG, and JPG files can be uploaded.");
  const name = cleanName(input.name, mime);
  const header = utf8Encode(JSON.stringify({ name, mime, category, size: bytes.length }));
  if (header.length > MAX_HEADER_BYTES) throw new DocumentError("Rename this file and try again.");

  const output = new Uint8Array(MAGIC.length + LENGTH_BYTES + header.length + bytes.length);
  output.set(MAGIC);
  new DataView(output.buffer).setUint16(MAGIC.length, header.length);
  output.set(header, MAGIC.length + LENGTH_BYTES);
  output.set(bytes, MAGIC.length + LENGTH_BYTES + header.length);
  return output;
}

export function isDocumentPayload(payload: Uint8Array): boolean {
  return payload.length > MAGIC.length && MAGIC.every((byte, index) => payload[index] === byte);
}

/** Validates everything again, because decrypted bytes are still another person's input. */
export function decodeDocument(payload: Uint8Array): RadoDocument {
  const invalid = () => new DocumentError("This document could not be read.");
  if (!isDocumentPayload(payload) || payload.length < MAGIC.length + LENGTH_BYTES) throw invalid();
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);
  const headerLength = view.getUint16(MAGIC.length);
  const start = MAGIC.length + LENGTH_BYTES + headerLength;
  if (headerLength === 0 || headerLength > MAX_HEADER_BYTES || start >= payload.length) {
    throw invalid();
  }
  let header: Record<string, unknown>;
  try {
    header = JSON.parse(utf8Decode(payload.subarray(MAGIC.length + LENGTH_BYTES, start)));
  } catch {
    throw invalid();
  }
  if (typeof header !== "object" || header === null || Array.isArray(header)) throw invalid();
  const keys = Object.keys(header);
  if (keys.length !== HEADER_KEYS.length || !HEADER_KEYS.every((key) => keys.includes(key))) {
    throw invalid();
  }
  const { name, mime, category, size } = header;
  const bytes = payload.slice(start);
  if (
    typeof name !== "string" ||
    !isCategory(category) ||
    size !== bytes.length ||
    bytes.length > MAX_DOCUMENT_BYTES ||
    detectDocumentMime(bytes) !== mime
  ) {
    throw invalid();
  }
  try {
    if (cleanName(name, mime as DocumentMime) !== name) throw invalid();
  } catch {
    throw invalid();
  }
  return { name, mime: mime as DocumentMime, category, size: bytes.length, bytes };
}

export function canShareDocument(
  category: DocumentCategory,
  kind: DocumentReaderKind | undefined,
): boolean {
  return kind !== undefined && DOCUMENT_CATEGORIES[category].readers.includes(kind);
}
