import "server-only";

import { createPrivateKey, createPublicKey, hkdfSync } from "node:crypto";

import { parseBundle, unwrapRecordKey, wrapRecordKey } from "@rado/shared";
import type { Address, Hex32, WrappedRecordKey } from "@rado/shared";
import { hexToBytes, isAddress, isHex, keccak256, stringToHex, verifyTypedData } from "viem";

import {
  ESCROW_AUTH_MAX_TTL_SECONDS,
  escrowReaderAddress,
  escrowReleaseTypedData,
} from "../escrow-auth";
import {
  anchoredRecord,
  breakGlassEvent,
  isRegisteredResponder,
  recordAccessAddress,
  registeredX25519Key,
} from "./chain";
import { claimOnce } from "./file-store";
import { asObject, HttpError } from "./http";
import { loadVerifiedBundle } from "./records";

const KEY_PATTERN = /^0x[0-9a-fA-F]{64}$/;
const HASH_PATTERN = /^0x[0-9a-fA-F]{64}$/;
const SIGNATURE_PATTERN = /^0x[0-9a-fA-F]{130}$/;
const MAX_LOG_INDEX = 0xffff_ffff;
const X25519_INFO = "rado/escrow/x25519/v1";
/** The fixed PKCS#8 header for a raw X25519 private key. */
const X25519_PKCS8_PREFIX = Buffer.from("302e020100300506032b656e04220420", "hex");

/** Read only here, and derived per call so the secret is not kept in module state. */
function escrowKeys(): { secretKey: Uint8Array; publicKey: Uint8Array; address: Address } {
  const value = process.env.ESCROW_PRIVATE_KEY?.trim();
  if (!value || !KEY_PATTERN.test(value)) {
    throw new HttpError(503, "Emergency access is not set up on the host.");
  }
  const secretKey = new Uint8Array(
    hkdfSync("sha256", hexToBytes(value as Hex32), new Uint8Array(), X25519_INFO, 32),
  );
  const privateKey = createPrivateKey({
    key: Buffer.concat([X25519_PKCS8_PREFIX, secretKey]),
    format: "der",
    type: "pkcs8",
  });
  const spki = createPublicKey(privateKey).export({ format: "der", type: "spki" });
  const publicKey = new Uint8Array(spki.subarray(-32));
  return { secretKey, publicKey, address: escrowReaderAddress(publicKey) };
}

export function escrowPublicKey(): Uint8Array {
  return escrowKeys().publicKey;
}

function parseRequest(raw: unknown) {
  const { wallet, recordId, transactionHash, logIndex, expiresAt, signature } = asObject(raw);
  if (
    typeof wallet !== "string" ||
    !isAddress(wallet, { strict: false }) ||
    typeof recordId !== "string" ||
    !HASH_PATTERN.test(recordId) ||
    typeof transactionHash !== "string" ||
    !HASH_PATTERN.test(transactionHash) ||
    !Number.isInteger(logIndex) ||
    (logIndex as number) < 0 ||
    (logIndex as number) > MAX_LOG_INDEX ||
    !Number.isSafeInteger(expiresAt) ||
    typeof signature !== "string" ||
    !SIGNATURE_PATTERN.test(signature) ||
    !isHex(signature)
  ) {
    throw new HttpError(400, "This request has the wrong format.");
  }
  return {
    wallet: wallet.toLowerCase() as Address,
    recordId: recordId.toLowerCase() as Hex32,
    transactionHash: transactionHash.toLowerCase() as Hex32,
    logIndex: logIndex as number,
    expiresAt: expiresAt as number,
    signature,
  };
}

/**
 * Invariant 14: releases only a key wrapped to escrow, and only for a matching on-chain event.
 * The single-use marker is written last, so a failed check never spends a real event.
 */
export async function releaseEmergencyKey(raw: unknown): Promise<WrappedRecordKey> {
  const request = parseRequest(raw);
  const { wallet, recordId, transactionHash, logIndex, expiresAt, signature } = request;

  const now = Math.floor(Date.now() / 1000);
  if (expiresAt <= now || expiresAt > now + ESCROW_AUTH_MAX_TTL_SECONDS) {
    throw new HttpError(401, "This request has expired.");
  }
  let signed = false;
  try {
    signed = await verifyTypedData({
      address: wallet,
      signature,
      ...escrowReleaseTypedData({
        wallet,
        recordId,
        transactionHash,
        logIndex,
        expiresAt: BigInt(expiresAt),
      }),
    });
  } catch {
    signed = false;
  }
  if (!signed) throw new HttpError(401, "This request could not be verified.");

  if (!(await isRegisteredResponder(wallet))) {
    throw new HttpError(403, "This wallet is not a registered emergency responder.");
  }
  const event = await breakGlassEvent(transactionHash, logIndex);
  if (
    !event ||
    event.recordId.toLowerCase() !== recordId ||
    event.responder.toLowerCase() !== wallet
  ) {
    throw new HttpError(403, "No matching emergency access event was found on-chain.");
  }
  const record = await anchoredRecord(recordId);
  if (!record || record.patient.toLowerCase() !== event.patient.toLowerCase()) {
    throw new HttpError(403, "No matching emergency access event was found on-chain.");
  }
  const x25519PublicKey = await registeredX25519Key(wallet);
  if (!x25519PublicKey) throw new HttpError(403, "This wallet is not registered.");

  const escrow = escrowKeys();
  const bundle = parseBundle(await loadVerifiedBundle(record.cid));
  const escrowCopy = bundle.wrappedKeys.find(
    (entry) => entry.reader.toLowerCase() === escrow.address,
  );
  if (!escrowCopy) {
    throw new HttpError(403, "Only an emergency summary can be released.");
  }

  let recordKey: Uint8Array;
  try {
    recordKey = await unwrapRecordKey(escrowCopy, bundle.recordId, escrow.secretKey);
  } catch {
    throw new HttpError(403, "Only an emergency summary can be released.");
  }
  try {
    const rewrapped = await wrapRecordKey(recordKey, bundle.recordId, {
      address: wallet,
      x25519PublicKey,
    });
    const contract = (await recordAccessAddress()).toLowerCase();
    const marker = keccak256(stringToHex(`${contract}:${transactionHash}:${logIndex}`)).slice(2);
    if (!(await claimOnce("escrow-releases", marker))) {
      throw new HttpError(409, "This emergency access was already used.");
    }
    return rewrapped;
  } finally {
    recordKey.fill(0);
    escrow.secretKey.fill(0);
  }
}
