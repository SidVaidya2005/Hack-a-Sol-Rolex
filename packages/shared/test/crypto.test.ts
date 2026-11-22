import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import { keccak_256 } from "@noble/hashes/sha3.js";

import {
  AES_IV_BYTES,
  BN254_FIELD_PRIME,
  HKDF_INFO,
  INBOX_AUTH_MAX_TTL_SECONDS,
  INBOX_MAX_MESSAGE_BYTES,
  addRecordReader,
  base64ToBytes,
  bytesToBase64,
  checkClaimApproval,
  checkClaimRequest,
  checkInboxMessage,
  checkPolicyTerms,
  decryptInboxMessage,
  decryptRecord,
  deriveUnlockKeys,
  eddsaPublicKey,
  eddsaSign,
  encodeBundle,
  encodeInboxAuth,
  encryptInboxMessage,
  encryptRecord,
  hashBundleBytes,
  inboxAad,
  inboxAuthDigest,
  inboxCiphertextHash,
  parseBundle,
  parseInboxEnvelope,
  parseInboxPlaintext,
  poseidonHash,
  requestHashInputs,
  claimHashInputs,
  policyCommitmentInputs,
  hospitalLeafInputs,
  rotateRecordKey,
  signInboxRequest,
  unlockTypedData,
  unwrapRecordKey,
  utf8Decode,
  utf8Encode,
  verifyInboxRequest,
} from "../src/index.ts";
import type {
  Address,
  ApprovedPolicyTerms,
  ClaimApprovalBody,
  ClaimRequestBody,
  EddsaPublicKey,
  Hex32,
  InboxEnvelope,
  InboxPlaintext,
  MerklePath,
  PolicyTerms,
  SenderCheckContext,
  UnlockedKeys,
} from "../src/index.ts";
import vector from "../vectors/claim-valid.json" with { type: "json" };

const ALICE: Address = "0x1111111111111111111111111111111111111111";
const BOB: Address = "0x2222222222222222222222222222222222222222";
const CAROL: Address = "0x3333333333333333333333333333333333333333";
const RECORD_ID: Hex32 = `0x${"ab".repeat(32)}`;
const OTHER_RECORD: Hex32 = `0x${"cd".repeat(32)}`;
const NOW = 1_800_000_000;

const signatureFor = (byte: string, v = "1b"): string => `0x${byte.repeat(64)}${v}`;
const unlock = (byte: string): Promise<UnlockedKeys> => deriveUnlockKeys(signatureFor(byte));
const readerOf = (address: Address, keys: UnlockedKeys) => ({
  address,
  x25519PublicKey: keys.x25519PublicKey,
});
const text = (value: string) => utf8Encode(value);
const flipBase64 = (value: string): string => {
  const bytes = base64ToBytes(value);
  bytes[0] = (bytes[0] as number) ^ 1;
  return bytesToBase64(bytes);
};

describe("unlock key derivation", () => {
  it("derives the same keys from the same signature", async () => {
    const [a, b] = await Promise.all([unlock("aa"), unlock("aa")]);
    assert.deepEqual(a, b);
  });

  it("ignores how the wallet encodes the recovery byte", async () => {
    const a = await deriveUnlockKeys(signatureFor("aa", "1b"));
    const b = await deriveUnlockKeys(signatureFor("aa", "00"));
    assert.deepEqual(a, b);
  });

  it("derives different keys from a different signature", async () => {
    const [a, b] = await Promise.all([unlock("aa"), unlock("bb")]);
    assert.notDeepEqual(a.eddsaSeed, b.eddsaSeed);
    assert.notDeepEqual(a.x25519SecretKey, b.x25519SecretKey);
  });

  it("separates the EdDSA seed from the X25519 secret", async () => {
    const keys = await unlock("aa");
    assert.notDeepEqual(keys.eddsaSeed, keys.x25519SecretKey);
    assert.equal(HKDF_INFO.eddsa, "rado/zk-eddsa/v1");
    assert.equal(HKDF_INFO.x25519, "rado/x25519/v1");
  });

  it("rejects a signature of the wrong length", async () => {
    await assert.rejects(deriveUnlockKeys("0xabcd"), /Invalid unlock signature/);
  });

  it("builds typed data without a contract address (D-034)", () => {
    const data = unlockTypedData(ALICE);
    assert.equal("verifyingContract" in data.domain, false);
    assert.equal(data.message.wallet, ALICE);
  });
});

describe("record encryption", () => {
  const record = text('{"resourceType":"Bundle","synthetic":true}');

  it("lets an approved reader decrypt", async () => {
    const alice = await unlock("aa");
    const { bundle } = await encryptRecord({
      recordId: RECORD_ID,
      plaintext: record,
      readers: [readerOf(ALICE, alice)],
    });
    assert.deepEqual(await decryptRecord(bundle, ALICE, alice.x25519SecretKey), record);
  });

  it("blocks a non-reader, with or without a stolen entry", async () => {
    const [alice, bob] = await Promise.all([unlock("aa"), unlock("bb")]);
    const { bundle } = await encryptRecord({
      recordId: RECORD_ID,
      plaintext: record,
      readers: [readerOf(ALICE, alice)],
    });
    await assert.rejects(decryptRecord(bundle, BOB, bob.x25519SecretKey), /do not have access/);
    await assert.rejects(decryptRecord(bundle, ALICE, bob.x25519SecretKey), /Could not decrypt/);
  });

  it("uses different IVs for two encryptions of the same data", async () => {
    const alice = await unlock("aa");
    const input = { recordId: RECORD_ID, plaintext: record, readers: [readerOf(ALICE, alice)] };
    const [a, b] = await Promise.all([encryptRecord(input), encryptRecord(input)]);
    assert.notEqual(a.bundle.iv, b.bundle.iv);
    assert.notEqual(a.bundle.ciphertext, b.bundle.ciphertext);
    assert.notEqual(a.bundle.wrappedKeys[0]?.iv, b.bundle.wrappedKeys[0]?.iv);
    assert.equal(base64ToBytes(a.bundle.iv).length, AES_IV_BYTES);
  });

  it("never places the record or its key in the bundle bytes", async () => {
    const alice = await unlock("aa");
    const { bundle, recordKey } = await encryptRecord({
      recordId: RECORD_ID,
      plaintext: record,
      readers: [readerOf(ALICE, alice)],
    });
    const pinned = utf8Decode(encodeBundle(bundle));
    assert.equal(pinned.includes("synthetic"), false);
    assert.equal(pinned.includes(bytesToBase64(recordKey)), false);
  });

  it("rejects tampered record ciphertext", async () => {
    const alice = await unlock("aa");
    const { bundle } = await encryptRecord({
      recordId: RECORD_ID,
      plaintext: record,
      readers: [readerOf(ALICE, alice)],
    });
    const tampered = { ...bundle, ciphertext: flipBase64(bundle.ciphertext) };
    await assert.rejects(decryptRecord(tampered, ALICE, alice.x25519SecretKey));
  });

  it("binds a wrapped key to its record", async () => {
    const alice = await unlock("aa");
    const { bundle } = await encryptRecord({
      recordId: RECORD_ID,
      plaintext: record,
      readers: [readerOf(ALICE, alice)],
    });
    const wrapped = bundle.wrappedKeys[0];
    assert.ok(wrapped);
    await assert.rejects(unwrapRecordKey(wrapped, OTHER_RECORD, alice.x25519SecretKey));
  });

  it("binds a wrapped key to its reader", async () => {
    const alice = await unlock("aa");
    const { bundle } = await encryptRecord({
      recordId: RECORD_ID,
      plaintext: record,
      readers: [readerOf(ALICE, alice)],
    });
    const wrapped = bundle.wrappedKeys[0];
    assert.ok(wrapped);
    await assert.rejects(
      unwrapRecordKey({ ...wrapped, reader: BOB }, RECORD_ID, alice.x25519SecretKey),
    );
  });

  it("adds a reader without changing the ciphertext, and changes the hash", async () => {
    const [alice, bob] = await Promise.all([unlock("aa"), unlock("bb")]);
    const { bundle, recordKey } = await encryptRecord({
      recordId: RECORD_ID,
      plaintext: record,
      readers: [readerOf(ALICE, alice)],
    });
    const granted = await addRecordReader(bundle, recordKey, readerOf(BOB, bob));
    assert.equal(granted.ciphertext, bundle.ciphertext);
    assert.notEqual(hashBundleBytes(encodeBundle(granted)), hashBundleBytes(encodeBundle(bundle)));
    assert.deepEqual(await decryptRecord(granted, BOB, bob.x25519SecretKey), record);
    await assert.rejects(addRecordReader(granted, recordKey, readerOf(BOB, bob)), /Duplicate/);
  });

  it("blocks the old reader after rotation and keeps remaining readers", async () => {
    const [alice, bob] = await Promise.all([unlock("aa"), unlock("bb")]);
    const first = await encryptRecord({
      recordId: RECORD_ID,
      plaintext: record,
      readers: [readerOf(ALICE, alice), readerOf(BOB, bob)],
    });
    const oldBobEntry = first.bundle.wrappedKeys.find((entry) => entry.reader === BOB);
    assert.ok(oldBobEntry);
    const oldBobKey = await unwrapRecordKey(oldBobEntry, RECORD_ID, bob.x25519SecretKey);

    const rotated = await rotateRecordKey({
      bundle: first.bundle,
      recordKey: first.recordKey,
      remainingReaders: [readerOf(ALICE, alice)],
    });

    assert.notDeepEqual(rotated.recordKey, first.recordKey);
    assert.notEqual(rotated.bundle.iv, first.bundle.iv);
    assert.notEqual(rotated.bundle.ciphertext, first.bundle.ciphertext);
    assert.deepEqual(await decryptRecord(rotated.bundle, ALICE, alice.x25519SecretKey), record);
    await assert.rejects(decryptRecord(rotated.bundle, BOB, bob.x25519SecretKey), /access/);

    // Even with the old key and the old wrapped entry spliced in, the new copy stays closed.
    const spliced = { ...rotated.bundle, wrappedKeys: [oldBobEntry] };
    await assert.rejects(decryptRecord(spliced, BOB, bob.x25519SecretKey));
    await assert.rejects(
      rotateRecordKey({
        bundle: rotated.bundle,
        recordKey: oldBobKey,
        remainingReaders: [readerOf(BOB, bob)],
      }),
    );
  });

  it("round-trips exact pinned bytes and refuses malformed bundles", async () => {
    const alice = await unlock("aa");
    const { bundle } = await encryptRecord({
      recordId: RECORD_ID,
      plaintext: record,
      readers: [readerOf(ALICE, alice)],
    });
    const bytes = encodeBundle(bundle);
    assert.deepEqual(encodeBundle(parseBundle(bytes)), bytes);
    assert.equal(hashBundleBytes(bytes), `0x${Buffer.from(keccak_256(bytes)).toString("hex")}`);
    for (const bad of [
      { ...bundle, plaintext: "leak" },
      { ...bundle, version: 2 },
      { ...bundle, iv: bytesToBase64(new Uint8Array(11)) },
      { ...bundle, wrappedKeys: [] },
      { ...bundle, wrappedKeys: [bundle.wrappedKeys[0], bundle.wrappedKeys[0]] },
    ]) {
      assert.throws(() => parseBundle(text(JSON.stringify(bad))), /Invalid bundle format/);
    }
  });
});

const input = vector.circuitInput;

const hospitalKey: EddsaPublicKey = { Ax: input.hospitalAx, Ay: input.hospitalAy };
const patientKey: EddsaPublicKey = { Ax: input.patientAx, Ay: input.patientAy };
const hospitalPath = {
  pathElements: input.hospitalPathElements,
  pathIndices: input.hospitalPathIndices,
} as MerklePath;
const coveredPath = {
  pathElements: input.coveredPathElements,
  pathIndices: input.coveredPathIndices,
} as MerklePath;

const approvedTerms: ApprovedPolicyTerms = {
  patientAx: input.patientAx,
  patientAy: input.patientAy,
  expiryDay: input.expiryDay,
  perClaimLimit: input.perClaimLimit,
  coveredRoot: input.coveredRoot,
  policySalt: input.policySalt,
};
const policyTerms: PolicyTerms = {
  ...approvedTerms,
  coveredProcedures: vector.policy.coveredProcedures,
};
const claimRequest: ClaimRequestBody = {
  encounterId: input.encounterId,
  procedureCode: input.procedureCode,
  claimAmount: input.claimAmount,
  claimDay: input.claimDay,
  payoutAddress: vector.payoutAddressHex as Address,
  hospitalPublicKey: hospitalKey,
  hospitalPath,
  hospitalSignature: vector.signatures.hospitalOverRequest,
};
const claimApproval: ClaimApprovalBody = {
  encounterId: input.encounterId,
  terms: approvedTerms,
  coveredPath,
  patientSignature: vector.signatures.patientOverClaim,
};

const policyContext = {
  recipientEddsaKey: patientKey,
  isRegisteredPolicy: (commitment: bigint) => commitment === BigInt(vector.hashes.policyCommitment),
};
const requestContext = {
  senderEddsaKey: hospitalKey,
  hospitalRoot: BigInt(vector.hashes.hospitalRoot),
};
const approvalContext = {
  senderEddsaKey: patientKey,
  isRegisteredPolicy: policyContext.isRegisteredPolicy,
  findClaimRequest: (encounterId: bigint) =>
    encounterId === BigInt(claimRequest.encounterId) ? claimRequest : null,
};

const expectFail = (result: { ok: boolean; reason?: string }, pattern: RegExp) => {
  assert.equal(result.ok, false);
  assert.match(result.reason ?? "", pattern);
};

const ATTACKER_SEED = keccak_256(text("rado/test-vector/attacker/v1"));

async function signRequest(body: ClaimRequestBody, seed: Uint8Array) {
  const hash = await poseidonHash(
    requestHashInputs({
      encounterId: BigInt(body.encounterId),
      procedureCode: BigInt(body.procedureCode),
      claimAmount: BigInt(body.claimAmount),
      claimDay: BigInt(body.claimDay),
      payoutAddress: BigInt(body.payoutAddress),
    }),
  );
  return eddsaSign(seed, hash);
}

describe("inbox encryption", () => {
  const message: InboxPlaintext = { type: "policy-terms", body: policyTerms };

  async function sealed(): Promise<{ envelope: InboxEnvelope; bob: UnlockedKeys }> {
    const bob = await unlock("bb");
    const envelope = await encryptInboxMessage({
      sender: ALICE,
      recipient: BOB,
      recipientX25519PublicKey: bob.x25519PublicKey,
      plaintext: message,
      createdAt: NOW,
    });
    return { envelope, bob };
  }

  it("round-trips for the recipient", async () => {
    const { envelope, bob } = await sealed();
    assert.deepEqual(await decryptInboxMessage(envelope, bob.x25519SecretKey), message);
  });

  it("exposes only the documented envelope fields", async () => {
    const { envelope } = await sealed();
    assert.deepEqual(Object.keys(envelope).sort(), [
      "ciphertext",
      "createdAt",
      "ephemeralPublicKey",
      "iv",
      "messageId",
      "recipient",
      "sender",
    ]);
    assert.equal(JSON.stringify(envelope).includes("policy-terms"), false);
    assert.equal(JSON.stringify(envelope).includes(input.policySalt), false);
    assert.match(envelope.messageId, /^[0-9a-f]{32}$/);
  });

  it("uses a fresh IV and ephemeral key per message", async () => {
    const [a, b] = await Promise.all([sealed(), sealed()]);
    assert.notEqual(a.envelope.iv, b.envelope.iv);
    assert.notEqual(a.envelope.ephemeralPublicKey, b.envelope.ephemeralPublicKey);
  });

  it("fails when the message ID changes", async () => {
    const { envelope, bob } = await sealed();
    const messageId = `${envelope.messageId[0] === "0" ? "1" : "0"}${envelope.messageId.slice(1)}`;
    await assert.rejects(
      decryptInboxMessage({ ...envelope, messageId }, bob.x25519SecretKey),
      /Could not decrypt/,
    );
  });

  it("fails when the sender changes", async () => {
    const { envelope, bob } = await sealed();
    await assert.rejects(
      decryptInboxMessage({ ...envelope, sender: CAROL }, bob.x25519SecretKey),
      /Could not decrypt/,
    );
  });

  it("fails when the recipient changes", async () => {
    const { envelope, bob } = await sealed();
    await assert.rejects(
      decryptInboxMessage({ ...envelope, recipient: CAROL }, bob.x25519SecretKey),
      /Could not decrypt/,
    );
  });

  it("fails for tampered ciphertext, IV, or ephemeral key", async () => {
    const { envelope, bob } = await sealed();
    for (const field of ["ciphertext", "iv", "ephemeralPublicKey"] as const) {
      await assert.rejects(
        decryptInboxMessage(
          { ...envelope, [field]: flipBase64(envelope[field]) },
          bob.x25519SecretKey,
        ),
      );
    }
  });

  it("fails for the wrong recipient key", async () => {
    const { envelope } = await sealed();
    const carol = await unlock("cc");
    await assert.rejects(decryptInboxMessage(envelope, carol.x25519SecretKey), /Could not decrypt/);
  });

  it("encodes AAD as exactly 69 bytes in the documented order", () => {
    const id = "0123456789abcdef0123456789abcdef";
    const aad = inboxAad(id, ALICE, BOB);
    assert.equal(aad.length, 69);
    assert.equal(utf8Decode(aad.slice(0, 13)), "rado/inbox/v1");
    assert.equal(Buffer.from(aad.slice(13, 29)).toString("hex"), id);
    assert.equal(`0x${Buffer.from(aad.slice(29, 49)).toString("hex")}`, ALICE);
    assert.equal(`0x${Buffer.from(aad.slice(49, 69)).toString("hex")}`, BOB);
  });

  it("refuses bad message IDs and oversized messages", async () => {
    const bob = await unlock("bb");
    const base = {
      sender: ALICE,
      recipient: BOB,
      recipientX25519PublicKey: bob.x25519PublicKey,
      plaintext: message,
    };
    await assert.rejects(encryptInboxMessage({ ...base, messageId: "../../etc" }), /message ID/);
    const { envelope } = await sealed();
    const oversized = bytesToBase64(new Uint8Array(INBOX_MAX_MESSAGE_BYTES + 1));
    assert.throws(() => parseInboxEnvelope({ ...envelope, ciphertext: oversized }), /envelope/);
    assert.throws(() => parseInboxEnvelope({ ...envelope, type: "policy-terms" }), /envelope/);
  });

  it("refuses an approval that carries the full coverage list (D-032)", () => {
    const leaked = {
      type: "claim-approval",
      body: { ...claimApproval, terms: policyTerms },
    };
    assert.throws(() => parseInboxPlaintext(leaked), /Invalid message format/);
  });

  it("refuses unknown message types and out-of-range values", () => {
    assert.throws(() => parseInboxPlaintext({ type: "other", body: {} }));
    assert.throws(() =>
      parseInboxPlaintext({
        type: "claim-request",
        body: { ...claimRequest, claimAmount: (1n << 64n).toString() },
      }),
    );
    assert.throws(() =>
      parseInboxPlaintext({
        type: "claim-request",
        body: { ...claimRequest, encounterId: BN254_FIELD_PRIME.toString() },
      }),
    );
  });
});

describe("inbox request authentication", () => {
  const hash: Hex32 = `0x${"11".repeat(32)}`;

  it("uses one exact 111-byte encoding", () => {
    const fields = {
      action: "send" as const,
      wallet: ALICE,
      nonce: `0x${"22".repeat(32)}` as Hex32,
      expiresAt: 0x0102030405,
      ciphertextHash: hash,
    };
    const encoded = encodeInboxAuth(fields);
    assert.equal(encoded.length, 111);
    assert.equal(
      Buffer.from(encoded).toString("hex"),
      Buffer.from("rado/inbox-auth/v1").toString("hex") +
        "01" +
        "11".repeat(20) +
        "22".repeat(32) +
        "0000000102030405" +
        "11".repeat(32),
    );
    const expected =
      BigInt(`0x${Buffer.from(keccak_256(encoded)).toString("hex")}`) % BN254_FIELD_PRIME;
    assert.equal(inboxAuthDigest(fields), expected);
    assert.equal(
      inboxAuthDigest({ ...fields, wallet: ALICE.toUpperCase().replace("0X", "0x") as Address }),
      expected,
    );
  });

  it("zero-fills the hash for list and ack, and rejects mismatched use", () => {
    const base = { wallet: ALICE, nonce: hash, expiresAt: NOW };
    const list = encodeInboxAuth({ ...base, action: "list" });
    assert.equal(Buffer.from(list.slice(79)).toString("hex"), "00".repeat(32));
    assert.notDeepEqual(list, encodeInboxAuth({ ...base, action: "ack" }));
    assert.throws(() => encodeInboxAuth({ ...base, action: "send" }));
    assert.throws(() => encodeInboxAuth({ ...base, action: "list", ciphertextHash: hash }));
  });

  async function signed(action: "send" | "list" | "ack" = "send") {
    const keys = await unlock("aa");
    const auth = await signInboxRequest({
      action,
      wallet: ALICE,
      eddsaSeed: keys.eddsaSeed,
      ...(action === "send" ? { ciphertextHash: hash } : {}),
      now: NOW,
    });
    const expected = {
      action,
      wallet: ALICE,
      publicKey: keys.eddsaPublicKey,
      now: NOW,
      ...(action === "send" ? { ciphertextHash: hash } : {}),
    };
    return { auth, expected, keys };
  }

  it("accepts a valid request for each action", async () => {
    for (const action of ["send", "list", "ack"] as const) {
      const { auth, expected } = await signed(action);
      assert.equal(await verifyInboxRequest(auth, expected), true);
    }
  });

  it("uses a new nonce for every request", async () => {
    const [a, b] = await Promise.all([signed(), signed()]);
    assert.notEqual(a.auth.nonce, b.auth.nonce);
  });

  it("rejects a wrong action, wallet, key, or ciphertext hash", async () => {
    const { auth, expected } = await signed();
    const other = await unlock("bb");
    assert.equal(await verifyInboxRequest(auth, { ...expected, action: "list" }), false);
    assert.equal(await verifyInboxRequest(auth, { ...expected, wallet: BOB }), false);
    assert.equal(
      await verifyInboxRequest(auth, { ...expected, publicKey: other.eddsaPublicKey }),
      false,
    );
    assert.equal(
      await verifyInboxRequest(auth, { ...expected, ciphertextHash: `0x${"33".repeat(32)}` }),
      false,
    );
  });

  it("rejects any signed field being changed", async () => {
    const { auth, expected } = await signed();
    const nonce: Hex32 = `0x${"44".repeat(32)}`;
    assert.equal(await verifyInboxRequest({ ...auth, nonce }, expected), false);
    assert.equal(
      await verifyInboxRequest({ ...auth, expiresAt: auth.expiresAt + 1 }, expected),
      false,
    );
    const moved = { ...auth, ciphertextHash: nonce };
    assert.equal(await verifyInboxRequest(moved, { ...expected, ciphertextHash: nonce }), false);
  });

  it("rejects expired requests and expiries too far ahead", async () => {
    const { auth, expected } = await signed();
    assert.equal(await verifyInboxRequest(auth, { ...expected, now: auth.expiresAt }), false);
    assert.equal(
      await verifyInboxRequest(auth, {
        ...expected,
        now: auth.expiresAt - INBOX_AUTH_MAX_TTL_SECONDS - 1,
      }),
      false,
    );
    assert.equal(
      await verifyInboxRequest(auth, {
        ...expected,
        now: auth.expiresAt - INBOX_AUTH_MAX_TTL_SECONDS,
      }),
      true,
    );
  });

  it("rejects malformed requests without throwing", async () => {
    const { auth, expected } = await signed();
    for (const bad of [
      null,
      "x",
      {},
      { ...auth, extra: 1 },
      { ...auth, signature: { R8x: "1" } },
      { ...auth, signature: { ...auth.signature, S: "-1" } },
      { ...auth, expiresAt: "soon" },
    ]) {
      assert.equal(await verifyInboxRequest(bad, expected), false);
    }
  });

  it("hashes the decoded ciphertext bytes", () => {
    const bytes = text("ciphertext");
    assert.equal(
      inboxCiphertextHash(bytesToBase64(bytes)),
      `0x${Buffer.from(keccak_256(bytes)).toString("hex")}`,
    );
  });
});

describe("sender checks", () => {
  it("accepts each genuine message type from the claim vector", async () => {
    assert.deepEqual(await checkPolicyTerms(policyTerms, policyContext), { ok: true });
    assert.deepEqual(await checkClaimRequest(claimRequest, requestContext), { ok: true });
    assert.deepEqual(await checkClaimApproval(claimApproval, approvalContext), { ok: true });
  });

  it("recomputes the vector's shared hashes", async () => {
    const commitment = await poseidonHash(
      policyCommitmentInputs({
        patientAx: BigInt(input.patientAx),
        patientAy: BigInt(input.patientAy),
        expiryDay: BigInt(input.expiryDay),
        perClaimLimit: BigInt(input.perClaimLimit),
        coveredRoot: BigInt(input.coveredRoot),
        policySalt: BigInt(input.policySalt),
      }),
    );
    assert.equal(commitment.toString(), vector.hashes.policyCommitment);
    const claimHash = await poseidonHash(
      claimHashInputs({
        policyCommitment: commitment,
        encounterId: BigInt(input.encounterId),
        procedureCode: BigInt(input.procedureCode),
        claimAmount: BigInt(input.claimAmount),
        claimDay: BigInt(input.claimDay),
        payoutAddress: BigInt(input.payoutAddress),
      }),
    );
    assert.equal(claimHash.toString(), vector.hashes.claimHash);
  });

  describe("forged policy-terms", () => {
    it("rejects terms that hash to no registered policy", async () => {
      const forged = { ...policyTerms, perClaimLimit: "999999999" };
      expectFail(await checkPolicyTerms(forged, policyContext), /registered policy/);
    });

    it("rejects a registered policy naming another patient", async () => {
      const result = await checkPolicyTerms(policyTerms, {
        ...policyContext,
        recipientEddsaKey: hospitalKey,
      });
      expectFail(result, /different patient/);
    });

    it("rejects a coverage list that does not match the root", async () => {
      const forged = {
        ...policyTerms,
        coveredProcedures: [...policyTerms.coveredProcedures, "424242"],
      };
      expectFail(await checkPolicyTerms(forged, policyContext), /coverage list/);
    });
  });

  describe("forged claim-request", () => {
    it("rejects a changed claim under the original signature", async () => {
      for (const change of [
        { claimAmount: "1" },
        { claimDay: "1" },
        { procedureCode: "1" },
        { encounterId: "1" },
        { payoutAddress: CAROL },
      ]) {
        expectFail(
          await checkClaimRequest({ ...claimRequest, ...change }, requestContext),
          /signature/,
        );
      }
    });

    it("rejects a signature from a key other than the named hospital", async () => {
      const forged = {
        ...claimRequest,
        hospitalSignature: await signRequest(claimRequest, ATTACKER_SEED),
      };
      expectFail(await checkClaimRequest(forged, requestContext), /signature/);
    });

    it("rejects a correctly signed request from an unapproved hospital", async () => {
      const attackerKey = await eddsaPublicKey(ATTACKER_SEED);
      const forged = {
        ...claimRequest,
        hospitalPublicKey: attackerKey,
        hospitalSignature: await signRequest(claimRequest, ATTACKER_SEED),
      };
      const result = await checkClaimRequest(forged, {
        ...requestContext,
        senderEddsaKey: attackerKey,
      });
      expectFail(result, /not currently approved/);
    });

    it("rejects a hospital removed from the current root", async () => {
      const staleRoot = await poseidonHash(
        hospitalLeafInputs(BigInt(hospitalKey.Ax), BigInt(hospitalKey.Ay)),
      );
      const result = await checkClaimRequest(claimRequest, {
        ...requestContext,
        hospitalRoot: staleRoot,
      });
      expectFail(result, /not currently approved/);
    });

    it("rejects a genuine request resent by a different wallet", async () => {
      const attackerKey = await eddsaPublicKey(ATTACKER_SEED);
      for (const senderEddsaKey of [attackerKey, null]) {
        expectFail(
          await checkClaimRequest(claimRequest, { ...requestContext, senderEddsaKey }),
          /did not come from/,
        );
      }
    });
  });

  describe("forged claim-approval", () => {
    it("rejects terms that hash to no registered policy", async () => {
      const forged = {
        ...claimApproval,
        terms: { ...approvedTerms, perClaimLimit: "999999999" },
      };
      expectFail(await checkClaimApproval(forged, approvalContext), /registered policy/);
    });

    it("rejects a signature from someone other than the policy's patient", async () => {
      const forged = {
        ...claimApproval,
        patientSignature: await eddsaSign(ATTACKER_SEED, BigInt(vector.hashes.claimHash)),
      };
      expectFail(await checkClaimApproval(forged, approvalContext), /patient signature/);
    });

    it("rejects a patient signature over different claim details", async () => {
      for (const change of [
        { claimAmount: "1" },
        { claimDay: "1" },
        { procedureCode: "1" },
        { payoutAddress: CAROL },
      ]) {
        const changedRequest = { ...claimRequest, ...change };
        expectFail(
          await checkClaimApproval(claimApproval, {
            ...approvalContext,
            findClaimRequest: () => changedRequest,
          }),
          /patient signature/,
        );
      }
    });

    it("rejects an approval for a claim this hospital never requested", async () => {
      const result = await checkClaimApproval(
        { ...claimApproval, encounterId: "12345" },
        approvalContext,
      );
      expectFail(result, /does not match a claim/);
    });

    it("rejects an approval sent by a wallet other than the patient", async () => {
      const attackerKey = await eddsaPublicKey(ATTACKER_SEED);
      for (const senderEddsaKey of [attackerKey, null]) {
        expectFail(
          await checkClaimApproval(claimApproval, { ...approvalContext, senderEddsaKey }),
          /did not come from/,
        );
      }
    });

    it("rejects a covered path that does not reach the policy root", async () => {
      const pathElements = [...coveredPath.pathElements];
      pathElements[0] = "1";
      const forged = { ...claimApproval, coveredPath: { ...coveredPath, pathElements } };
      expectFail(await checkClaimApproval(forged, approvalContext), /not covered/);
    });
  });

  it("dispatches each message type through checkInboxMessage", async () => {
    const context: SenderCheckContext = {
      recipientEddsaKey: patientKey,
      senderEddsaKey: hospitalKey,
      hospitalRoot: requestContext.hospitalRoot,
      isRegisteredPolicy: policyContext.isRegisteredPolicy,
      findClaimRequest: approvalContext.findClaimRequest,
    };
    assert.equal(
      (await checkInboxMessage({ type: "policy-terms", body: policyTerms }, context)).ok,
      true,
    );
    assert.equal(
      (await checkInboxMessage({ type: "claim-request", body: claimRequest }, context)).ok,
      true,
    );
    assert.equal(
      (
        await checkInboxMessage(
          { type: "claim-approval", body: claimApproval },
          { ...context, senderEddsaKey: patientKey },
        )
      ).ok,
      true,
    );
    assert.equal(
      (await checkInboxMessage({ type: "claim-approval", body: claimApproval }, context)).ok,
      false,
    );
  });
});

describe("library boundaries", () => {
  const cryptoDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "src", "crypto");
  const sources = readdirSync(cryptoDir).map((file) => ({
    file,
    code: readFileSync(path.join(cryptoDir, file), "utf8"),
  }));

  it("has no React, server secrets, logging, or browser storage", () => {
    const banned =
      /from "react|server-only|process\.env|PINATA_JWT|ESCROW_PRIVATE_KEY|console\.|localStorage|sessionStorage|indexedDB/;
    for (const { file, code } of sources) assert.doesNotMatch(code, banned, file);
  });

  it("does not re-declare shared labels", () => {
    const labels = /"rado\/(?:zk-eddsa|x25519|wrap|inbox|inbox-auth)\/v1"/;
    for (const { file, code } of sources) assert.doesNotMatch(code, labels, file);
  });
});
