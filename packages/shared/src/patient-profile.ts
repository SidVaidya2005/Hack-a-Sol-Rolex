import { utf8Decode, utf8Encode } from "./crypto/bytes.ts";

export const BLOOD_GROUPS = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-", "Unknown"] as const;
export type BloodGroup = (typeof BLOOD_GROUPS)[number];

export interface PatientProfile {
  fullName: string;
  /** Calendar date as YYYY-MM-DD. */
  dateOfBirth: string;
  bloodGroup: BloodGroup;
  allergies: string;
  emergencyContact: string;
}

/** Its message is plain enough to show a user. */
export class ProfileError extends Error {}

const MAGIC = utf8Encode("RADOPRF1");
const MAX_PROFILE_BYTES = 2048;
const MAX_NAME_CHARS = 80;
const MAX_ALLERGIES_CHARS = 200;
const MAX_CONTACT_CHARS = 120;
const EARLIEST_BIRTH_YEAR = 1900;
const PROFILE_KEYS = ["fullName", "dateOfBirth", "bloodGroup", "allergies", "emergencyContact"];
// Control characters and text-direction overrides can disguise what a reader sees.
const UNSAFE_TEXT = /[\u0000-\u001f\u007f-\u009f‎‏‪-‮⁦-⁩]/;

function isRealDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return (
    !Number.isNaN(date.getTime()) &&
    date.toISOString().slice(0, 10) === value &&
    date.getUTCFullYear() >= EARLIEST_BIRTH_YEAR
  );
}

function checkProfile(profile: PatientProfile): void {
  const { fullName, dateOfBirth, bloodGroup, allergies, emergencyContact } = profile;
  if (!fullName || fullName.length > MAX_NAME_CHARS) {
    throw new ProfileError("Enter a name of at most 80 characters.");
  }
  if (!isRealDate(dateOfBirth)) throw new ProfileError("Enter a valid date of birth.");
  if (!BLOOD_GROUPS.includes(bloodGroup)) throw new ProfileError("Choose a blood group.");
  if (allergies.length > MAX_ALLERGIES_CHARS) {
    throw new ProfileError("Keep allergies to 200 characters.");
  }
  if (emergencyContact.length > MAX_CONTACT_CHARS) {
    throw new ProfileError("Keep the emergency contact to 120 characters.");
  }
  if ([fullName, allergies, emergencyContact].some((text) => UNSAFE_TEXT.test(text))) {
    throw new ProfileError("Remove unusual characters and try again.");
  }
}

export function encodeProfile(input: PatientProfile): Uint8Array {
  const profile: PatientProfile = {
    fullName: input.fullName.trim(),
    dateOfBirth: input.dateOfBirth.trim(),
    bloodGroup: input.bloodGroup,
    allergies: input.allergies.trim(),
    emergencyContact: input.emergencyContact.trim(),
  };
  checkProfile(profile);
  if (profile.dateOfBirth > new Date().toISOString().slice(0, 10)) {
    throw new ProfileError("Enter a valid date of birth.");
  }
  const body = utf8Encode(JSON.stringify(profile));
  const output = new Uint8Array(MAGIC.length + body.length);
  output.set(MAGIC);
  output.set(body, MAGIC.length);
  return output;
}

export function isProfilePayload(payload: Uint8Array): boolean {
  return payload.length > MAGIC.length && MAGIC.every((byte, index) => payload[index] === byte);
}

/** Validates everything again, because decrypted bytes are still another person's input. */
export function decodeProfile(payload: Uint8Array): PatientProfile {
  const invalid = () => new ProfileError("This profile could not be read.");
  if (!isProfilePayload(payload) || payload.length > MAGIC.length + MAX_PROFILE_BYTES) {
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
  if (keys.length !== PROFILE_KEYS.length || !PROFILE_KEYS.every((key) => keys.includes(key))) {
    throw invalid();
  }
  const profile = value as PatientProfile;
  if (PROFILE_KEYS.some((key) => typeof (value as Record<string, unknown>)[key] !== "string")) {
    throw invalid();
  }
  try {
    checkProfile(profile);
  } catch {
    throw invalid();
  }
  return profile;
}

const NAME_CARD_MAGIC = utf8Encode("RADONAM1");

/** Holds only the patient's name, so care teams can recognise them in a list. */
export function encodeNameCard(fullName: string): Uint8Array {
  const name = fullName.trim();
  if (!name || name.length > MAX_NAME_CHARS || UNSAFE_TEXT.test(name)) {
    throw new ProfileError("Enter a name of at most 80 characters.");
  }
  const body = utf8Encode(JSON.stringify({ fullName: name }));
  const output = new Uint8Array(NAME_CARD_MAGIC.length + body.length);
  output.set(NAME_CARD_MAGIC);
  output.set(body, NAME_CARD_MAGIC.length);
  return output;
}

export function isNameCardPayload(payload: Uint8Array): boolean {
  return (
    payload.length > NAME_CARD_MAGIC.length &&
    NAME_CARD_MAGIC.every((byte, index) => payload[index] === byte)
  );
}

/** Validates again, because a card comes from another wallet. */
export function decodeNameCard(payload: Uint8Array): string {
  const invalid = () => new ProfileError("This name could not be read.");
  if (!isNameCardPayload(payload) || payload.length > NAME_CARD_MAGIC.length + 512) {
    throw invalid();
  }
  let value: unknown;
  try {
    value = JSON.parse(utf8Decode(payload.subarray(NAME_CARD_MAGIC.length)));
  } catch {
    throw invalid();
  }
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw invalid();
  const keys = Object.keys(value);
  const { fullName } = value as { fullName?: unknown };
  if (keys.length !== 1 || typeof fullName !== "string") throw invalid();
  if (
    !fullName ||
    fullName !== fullName.trim() ||
    fullName.length > MAX_NAME_CHARS ||
    UNSAFE_TEXT.test(fullName)
  ) {
    throw invalid();
  }
  return fullName;
}

/** Hospitals and doctors only. Labs, pharmacies, responders, and insurers never qualify. */
export function canShareProfile(kind: string | undefined): boolean {
  return kind === "hospital" || kind === "doctor";
}
