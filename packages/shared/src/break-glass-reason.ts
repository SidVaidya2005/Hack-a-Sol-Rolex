import { utf8Decode, utf8Encode } from "./crypto/bytes.ts";

export const BREAK_GLASS_REASONS = {
  unconscious: "Patient is unconscious",
  "cannot-communicate": "Patient cannot communicate",
  "life-threatening": "Life-threatening emergency",
  other: "Other",
} as const;

export type BreakGlassCategory = keyof typeof BREAK_GLASS_REASONS;

export interface BreakGlassReason {
  category: BreakGlassCategory;
  note: string;
}

/** Its message is plain enough to show a user. */
export class BreakGlassReasonError extends Error {}

const MAGIC = utf8Encode("RADOWHY1");
const MAX_NOTE_CHARS = 280;
const UNSAFE_TEXT = /[\u0000-\u001f\u007f-\u009f‎‏‪-‮⁦-⁩]/;

function checkReason({ category, note }: BreakGlassReason): void {
  if (typeof category !== "string" || !Object.hasOwn(BREAK_GLASS_REASONS, category)) {
    throw new BreakGlassReasonError("Choose a reason for emergency access.");
  }
  if (typeof note !== "string" || note.length > MAX_NOTE_CHARS || UNSAFE_TEXT.test(note)) {
    throw new BreakGlassReasonError("Keep the note to 280 characters on one line.");
  }
  if (category === "other" && !note) {
    throw new BreakGlassReasonError("Describe the reason for emergency access.");
  }
}

export function encodeBreakGlassReason(input: BreakGlassReason): Uint8Array {
  const reason = { category: input.category, note: input.note.trim() };
  checkReason(reason);
  const body = utf8Encode(JSON.stringify(reason));
  const output = new Uint8Array(MAGIC.length + body.length);
  output.set(MAGIC);
  output.set(body, MAGIC.length);
  return output;
}

/** Validates again, because the reason was written by another wallet. */
export function decodeBreakGlassReason(payload: Uint8Array): BreakGlassReason {
  const invalid = () => new BreakGlassReasonError("This reason could not be read.");
  if (
    payload.length <= MAGIC.length ||
    payload.length > MAGIC.length + 2048 ||
    !MAGIC.every((byte, index) => payload[index] === byte)
  ) {
    throw invalid();
  }
  let value: unknown;
  try {
    value = JSON.parse(utf8Decode(payload.subarray(MAGIC.length)));
  } catch {
    throw invalid();
  }
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw invalid();
  const keys = Object.keys(value);
  if (keys.length !== 2 || !keys.includes("category") || !keys.includes("note")) throw invalid();
  const reason = value as BreakGlassReason;
  try {
    checkReason(reason);
  } catch {
    throw invalid();
  }
  return reason;
}

export function breakGlassReasonText({ category, note }: BreakGlassReason): string {
  if (category === "other") return note;
  return note ? `${BREAK_GLASS_REASONS[category]}: ${note}` : BREAK_GLASS_REASONS[category];
}
