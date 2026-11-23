import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  canShareProfile,
  decodeNameCard,
  decodeProfile,
  encodeNameCard,
  encodeProfile,
  isDocumentPayload,
  isNameCardPayload,
  isProfilePayload,
  ProfileError,
  utf8Encode,
} from "../src/index.ts";
import type { PatientProfile } from "../src/index.ts";

const profile: PatientProfile = {
  fullName: "Demo Patient Alpha",
  dateOfBirth: "1990-01-15",
  bloodGroup: "O+",
  allergies: "Sample allergy",
  emergencyContact: "Demo Contact",
};

const payloadOf = (value: unknown) => {
  const magic = utf8Encode("RADOPRF1");
  const body = utf8Encode(JSON.stringify(value));
  const output = new Uint8Array(magic.length + body.length);
  output.set(magic);
  output.set(body, magic.length);
  return output;
};

describe("patient profile", () => {
  it("round-trips and trims a valid profile", () => {
    const payload = encodeProfile({ ...profile, fullName: `  ${profile.fullName} ` });
    assert.equal(isProfilePayload(payload), true);
    assert.equal(isDocumentPayload(payload), false);
    assert.deepEqual(decodeProfile(payload), profile);
  });

  for (const [label, change] of [
    ["an empty name", { fullName: "  " }],
    ["a long name", { fullName: "x".repeat(81) }],
    ["an impossible date", { dateOfBirth: "2001-02-30" }],
    ["a future date", { dateOfBirth: "2999-01-01" }],
    ["a date before 1900", { dateOfBirth: "1899-12-31" }],
    ["an unknown blood group", { bloodGroup: "Z+" }],
    ["long allergies", { allergies: "x".repeat(201) }],
    ["a long contact", { emergencyContact: "x".repeat(121) }],
    ["a direction override", { fullName: "Demo‮Patient" }],
  ] as const) {
    it(`rejects ${label}`, () => {
      assert.throws(() => encodeProfile({ ...profile, ...change } as PatientProfile), ProfileError);
    });
  }

  it("rejects extra fields, missing fields, and wrong types when decoding", () => {
    assert.throws(() => decodeProfile(payloadOf({ ...profile, diagnosis: "x" })), ProfileError);
    const missing = Object.fromEntries(
      Object.entries(profile).filter(([key]) => key !== "allergies"),
    );
    assert.throws(() => decodeProfile(payloadOf(missing)), ProfileError);
    assert.throws(() => decodeProfile(payloadOf({ ...profile, allergies: 1 })), ProfileError);
    assert.throws(() => decodeProfile(utf8Encode("not a profile")), ProfileError);
  });

  it("keeps a name card to the name alone", () => {
    const card = encodeNameCard("  Demo Patient ");
    assert.equal(isNameCardPayload(card), true);
    assert.equal(isProfilePayload(card), false);
    assert.equal(decodeNameCard(card), "Demo Patient");
    const magic = utf8Encode("RADONAM1");
    const extra = utf8Encode(JSON.stringify({ fullName: "Demo", allergies: "x" }));
    const forged = new Uint8Array(magic.length + extra.length);
    forged.set(magic);
    forged.set(extra, magic.length);
    assert.throws(() => decodeNameCard(forged), ProfileError);
    assert.throws(() => encodeNameCard("Demo‮Patient"), ProfileError);
  });

  it("allows only hospitals and doctors as readers", () => {
    assert.equal(canShareProfile("hospital"), true);
    assert.equal(canShareProfile("doctor"), true);
    for (const kind of ["lab", "pharmacy", "insurer", "responder", undefined]) {
      assert.equal(canShareProfile(kind), false);
    }
  });
});
