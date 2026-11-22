import { x25519 } from "@noble/curves/ed25519.js";
import { hkdf } from "@noble/hashes/hkdf.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { keccak_256 } from "@noble/hashes/sha3.js";

import { AES_IV_BYTES, AES_KEY_BYTES, BUNDLE_VERSION, HKDF_INFO } from "../constants.ts";
import type { Address, EncryptedBundle, Hex32, WrappedRecordKey } from "../types.ts";
import { aesGcmDecrypt, aesGcmEncrypt, randomBytes } from "./aes.ts";
import {
  addressToBytes,
  base64ToBytes,
  bytesToBase64,
  bytesToHex,
  concatBytes,
  hex32ToBytes,
  isAddress,
  isHex32,
  normalizeAddress,
  utf8Decode,
  utf8Encode,
} from "./bytes.ts";

const WRAP_SALT_BYTES = 32;
const X25519_KEY_BYTES = 32;
const AES_TAG_BYTES = 16;
const WRAPPED_KEY_BYTES = AES_KEY_BYTES + AES_TAG_BYTES;
const BUNDLE_KEYS = ["version", "recordId", "iv", "ciphertext", "wrappedKeys"];
const WRAPPED_KEY_KEYS = ["reader", "ephemeralPublicKey", "salt", "iv", "wrappedKey"];

export interface RecordReader {
  address: Address;
  x25519PublicKey: Uint8Array;
}

export function generateRecordKey(): Uint8Array {
  return randomBytes(AES_KEY_BYTES);
}

/** Stops a wrapped key being moved to another record or reader. */
function wrapAad(recordId: Hex32, reader: Address): Uint8Array {
  return concatBytes(utf8Encode(HKDF_INFO.wrap), hex32ToBytes(recordId), addressToBytes(reader));
}

function deriveWrapKey(shared: Uint8Array, salt: Uint8Array): Uint8Array {
  return hkdf(sha256, shared, salt, utf8Encode(HKDF_INFO.wrap), AES_KEY_BYTES);
}

export async function wrapRecordKey(
  recordKey: Uint8Array,
  recordId: Hex32,
  reader: RecordReader,
): Promise<WrappedRecordKey> {
  if (recordKey.length !== AES_KEY_BYTES) throw new Error("Invalid record key");
  const ephemeral = x25519.keygen();
  const salt = randomBytes(WRAP_SALT_BYTES);
  const shared = x25519.getSharedSecret(ephemeral.secretKey, reader.x25519PublicKey);
  const address = normalizeAddress(reader.address);
  const { iv, ciphertext } = await aesGcmEncrypt(
    deriveWrapKey(shared, salt),
    recordKey,
    wrapAad(recordId, address),
  );
  return {
    reader: address,
    ephemeralPublicKey: bytesToBase64(ephemeral.publicKey),
    salt: bytesToBase64(salt),
    iv: bytesToBase64(iv),
    wrappedKey: bytesToBase64(ciphertext),
  };
}

export async function unwrapRecordKey(
  wrapped: WrappedRecordKey,
  recordId: Hex32,
  x25519SecretKey: Uint8Array,
): Promise<Uint8Array> {
  let shared: Uint8Array;
  try {
    shared = x25519.getSharedSecret(x25519SecretKey, base64ToBytes(wrapped.ephemeralPublicKey));
  } catch {
    throw new Error("Could not decrypt this data");
  }
  return aesGcmDecrypt(
    deriveWrapKey(shared, base64ToBytes(wrapped.salt)),
    base64ToBytes(wrapped.iv),
    base64ToBytes(wrapped.wrappedKey),
    wrapAad(recordId, wrapped.reader),
  );
}

function assertReaders(readers: RecordReader[]): void {
  if (readers.length === 0) throw new Error("A record needs at least one reader");
  const addresses = readers.map((reader) => normalizeAddress(reader.address));
  if (new Set(addresses).size !== addresses.length) throw new Error("Duplicate record reader");
}

async function buildBundle(
  recordId: Hex32,
  recordKey: Uint8Array,
  plaintext: Uint8Array,
  readers: RecordReader[],
): Promise<EncryptedBundle> {
  assertReaders(readers);
  const { iv, ciphertext } = await aesGcmEncrypt(recordKey, plaintext, hex32ToBytes(recordId));
  return {
    version: BUNDLE_VERSION,
    recordId,
    iv: bytesToBase64(iv),
    ciphertext: bytesToBase64(ciphertext),
    wrappedKeys: await Promise.all(
      readers.map((reader) => wrapRecordKey(recordKey, recordId, reader)),
    ),
  };
}

function decryptBundle(bundle: EncryptedBundle, recordKey: Uint8Array): Promise<Uint8Array> {
  return aesGcmDecrypt(
    recordKey,
    base64ToBytes(bundle.iv),
    base64ToBytes(bundle.ciphertext),
    hex32ToBytes(bundle.recordId),
  );
}

export async function encryptRecord(input: {
  recordId: Hex32;
  plaintext: Uint8Array;
  readers: RecordReader[];
}): Promise<{ bundle: EncryptedBundle; recordKey: Uint8Array }> {
  const recordKey = generateRecordKey();
  const bundle = await buildBundle(input.recordId, recordKey, input.plaintext, input.readers);
  return { bundle, recordKey };
}

export async function decryptRecord(
  bundle: EncryptedBundle,
  reader: Address,
  x25519SecretKey: Uint8Array,
): Promise<Uint8Array> {
  const address = normalizeAddress(reader);
  const wrapped = bundle.wrappedKeys.find((entry) => normalizeAddress(entry.reader) === address);
  if (!wrapped) throw new Error("You do not have access to this record");
  const recordKey = await unwrapRecordKey(wrapped, bundle.recordId, x25519SecretKey);
  return decryptBundle(bundle, recordKey);
}

/** Grant: keeps the ciphertext and adds one wrapped key, so the bundle hash changes (D-031). */
export async function addRecordReader(
  bundle: EncryptedBundle,
  recordKey: Uint8Array,
  reader: RecordReader,
): Promise<EncryptedBundle> {
  const address = normalizeAddress(reader.address);
  if (bundle.wrappedKeys.some((entry) => normalizeAddress(entry.reader) === address)) {
    throw new Error("Duplicate record reader");
  }
  await decryptBundle(bundle, recordKey);
  const wrapped = await wrapRecordKey(recordKey, bundle.recordId, reader);
  return { ...bundle, wrappedKeys: [...bundle.wrappedKeys, wrapped] };
}

/** Revoke: new key, new IV, new ciphertext, and new wrapped keys for remaining readers only. */
export async function rotateRecordKey(input: {
  bundle: EncryptedBundle;
  recordKey: Uint8Array;
  remainingReaders: RecordReader[];
}): Promise<{ bundle: EncryptedBundle; recordKey: Uint8Array }> {
  const plaintext = await decryptBundle(input.bundle, input.recordKey);
  const recordKey = generateRecordKey();
  const bundle = await buildBundle(
    input.bundle.recordId,
    recordKey,
    plaintext,
    input.remainingReaders,
  );
  return { bundle, recordKey };
}

/** The exact bytes to pin. The on-chain hash is taken over these bytes. */
export function encodeBundle(bundle: EncryptedBundle): Uint8Array {
  return utf8Encode(
    JSON.stringify({
      version: bundle.version,
      recordId: bundle.recordId,
      iv: bundle.iv,
      ciphertext: bundle.ciphertext,
      wrappedKeys: bundle.wrappedKeys.map((entry) => ({
        reader: entry.reader,
        ephemeralPublicKey: entry.ephemeralPublicKey,
        salt: entry.salt,
        iv: entry.iv,
        wrappedKey: entry.wrappedKey,
      })),
    }),
  );
}

export function hashBundleBytes(bytes: Uint8Array): Hex32 {
  return `0x${bytesToHex(keccak_256(bytes))}`;
}

function hasExactKeys(value: unknown, keys: string[]): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const actual = Object.keys(value);
  return actual.length === keys.length && keys.every((key) => actual.includes(key));
}

function base64Length(value: unknown): number {
  if (typeof value !== "string") throw new Error("Invalid bundle format");
  return base64ToBytes(value).length;
}

function assertWrappedKey(value: unknown): asserts value is WrappedRecordKey {
  if (
    !hasExactKeys(value, WRAPPED_KEY_KEYS) ||
    !isAddress(value.reader) ||
    base64Length(value.ephemeralPublicKey) !== X25519_KEY_BYTES ||
    base64Length(value.salt) !== WRAP_SALT_BYTES ||
    base64Length(value.iv) !== AES_IV_BYTES ||
    base64Length(value.wrappedKey) !== WRAPPED_KEY_BYTES
  ) {
    throw new Error("Invalid bundle format");
  }
}

/** Validates pinned bytes and rejects anything that is not an encrypted bundle. */
export function parseBundle(bytes: Uint8Array): EncryptedBundle {
  try {
    const value: unknown = JSON.parse(utf8Decode(bytes));
    if (
      !hasExactKeys(value, BUNDLE_KEYS) ||
      value.version !== BUNDLE_VERSION ||
      !isHex32(value.recordId) ||
      base64Length(value.iv) !== AES_IV_BYTES ||
      base64Length(value.ciphertext) < AES_TAG_BYTES ||
      !Array.isArray(value.wrappedKeys) ||
      value.wrappedKeys.length === 0
    ) {
      throw new Error("Invalid bundle format");
    }
    value.wrappedKeys.forEach(assertWrappedKey);
    const readers = (value.wrappedKeys as WrappedRecordKey[]).map((entry) =>
      normalizeAddress(entry.reader),
    );
    if (new Set(readers).size !== readers.length) throw new Error("Invalid bundle format");
    return value as unknown as EncryptedBundle;
  } catch {
    throw new Error("Invalid bundle format");
  }
}
