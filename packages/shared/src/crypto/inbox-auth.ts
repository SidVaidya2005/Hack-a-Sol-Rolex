import { keccak_256 } from "@noble/hashes/sha3.js";

import { BN254_FIELD_PRIME, INBOX_AUTH_MAX_TTL_SECONDS, INBOX_AUTH_TAG } from "../constants.ts";
import type { Address, EddsaPublicKey, Hex32, InboxAction, InboxAuth } from "../types.ts";
import { randomBytes } from "./aes.ts";
import {
  addressToBytes,
  bytesToBigInt,
  bytesToHex,
  concatBytes,
  hex32ToBytes,
  isAddress,
  isHex32,
  normalizeAddress,
  parseDecimal,
  utf8Encode,
} from "./bytes.ts";
import { eddsaSign, eddsaVerify } from "./zk.ts";

const ACTION_CODES: Record<InboxAction, number> = { send: 1, list: 2, ack: 3 };
const HASH_BYTES = 32;
const NONCE_BYTES = 32;
const AUTH_KEYS = ["action", "wallet", "nonce", "expiresAt", "signature"];
const SIGNATURE_KEYS = ["R8x", "R8y", "S"];

/** Half the allowed lifetime, so laptop clocks may differ by up to 30 seconds. */
const DEFAULT_TTL_SECONDS = Math.floor(INBOX_AUTH_MAX_TTL_SECONDS / 2);

export type InboxAuthFields = Omit<InboxAuth, "signature">;

/**
 * The one digest encoding, always 111 bytes:
 * tag (18, UTF-8) | action (1: send=1, list=2, ack=3) | wallet (20) | nonce (32) |
 * expiresAt (8, unsigned big-endian seconds) | ciphertextHash (32, zeros unless send).
 */
export function encodeInboxAuth(fields: InboxAuthFields): Uint8Array {
  const code = ACTION_CODES[fields.action];
  if (code === undefined) throw new Error("Invalid inbox action");
  if (!Number.isSafeInteger(fields.expiresAt) || fields.expiresAt < 0) {
    throw new Error("Invalid inbox request expiry");
  }
  const isSend = fields.action === "send";
  if (isSend !== (fields.ciphertextHash !== undefined)) {
    throw new Error("Only a send request carries a ciphertext hash");
  }
  const expiresAt = new Uint8Array(8);
  new DataView(expiresAt.buffer).setBigUint64(0, BigInt(fields.expiresAt), false);
  return concatBytes(
    utf8Encode(INBOX_AUTH_TAG),
    Uint8Array.of(code),
    addressToBytes(fields.wallet),
    hex32ToBytes(fields.nonce),
    expiresAt,
    fields.ciphertextHash ? hex32ToBytes(fields.ciphertextHash) : new Uint8Array(HASH_BYTES),
  );
}

export function inboxAuthDigest(fields: InboxAuthFields): bigint {
  return bytesToBigInt(keccak_256(encodeInboxAuth(fields))) % BN254_FIELD_PRIME;
}

export async function signInboxRequest(input: {
  action: InboxAction;
  wallet: Address;
  eddsaSeed: Uint8Array;
  ciphertextHash?: Hex32;
  now?: number;
}): Promise<InboxAuth> {
  const now = input.now ?? Math.floor(Date.now() / 1000);
  const fields: InboxAuthFields = {
    action: input.action,
    wallet: normalizeAddress(input.wallet),
    nonce: `0x${bytesToHex(randomBytes(NONCE_BYTES))}`,
    expiresAt: now + DEFAULT_TTL_SECONDS,
    ...(input.ciphertextHash ? { ciphertextHash: input.ciphertextHash } : {}),
  };
  return { ...fields, signature: await eddsaSign(input.eddsaSeed, inboxAuthDigest(fields)) };
}

function isInboxAuth(value: unknown): value is InboxAuth {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const auth = value as Record<string, unknown>;
  const keys = Object.keys(auth);
  const expected = auth.action === "send" ? [...AUTH_KEYS, "ciphertextHash"] : AUTH_KEYS;
  if (keys.length !== expected.length || !expected.every((key) => keys.includes(key))) {
    return false;
  }
  if (auth.action !== "send" && auth.action !== "list" && auth.action !== "ack") return false;
  if (!isAddress(auth.wallet) || !isHex32(auth.nonce)) return false;
  if (auth.action === "send" && !isHex32(auth.ciphertextHash)) return false;
  if (!Number.isSafeInteger(auth.expiresAt)) return false;

  const signature = auth.signature;
  if (typeof signature !== "object" || signature === null) return false;
  const parts = signature as Record<string, unknown>;
  if (
    Object.keys(parts).length !== SIGNATURE_KEYS.length ||
    !SIGNATURE_KEYS.every((key) => key in parts)
  ) {
    return false;
  }
  try {
    SIGNATURE_KEYS.forEach((key) => parseDecimal(parts[key], BN254_FIELD_PRIME));
  } catch {
    return false;
  }
  return true;
}

/**
 * Checks shape, action, wallet, freshness, ciphertext hash, and signature.
 * The caller must still enforce single-use nonces and registered keys (W07).
 */
export async function verifyInboxRequest(
  auth: unknown,
  expected: {
    action: InboxAction;
    wallet: Address;
    publicKey: EddsaPublicKey;
    now: number;
    ciphertextHash?: Hex32;
  },
): Promise<boolean> {
  if (!isInboxAuth(auth)) return false;
  if (auth.action !== expected.action) return false;
  if (normalizeAddress(auth.wallet) !== normalizeAddress(expected.wallet)) return false;
  if (auth.expiresAt <= expected.now) return false;
  if (auth.expiresAt > expected.now + INBOX_AUTH_MAX_TTL_SECONDS) return false;
  if (auth.action === "send") {
    if (
      !expected.ciphertextHash ||
      auth.ciphertextHash?.toLowerCase() !== expected.ciphertextHash.toLowerCase()
    ) {
      return false;
    }
  }
  const { signature, ...fields } = auth;
  return eddsaVerify(inboxAuthDigest(fields), signature, expected.publicKey);
}
