import { x25519 } from "@noble/curves/ed25519.js";
import { hkdf } from "@noble/hashes/hkdf.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { keccak_256 } from "@noble/hashes/sha3.js";

import {
  AES_IV_BYTES,
  AES_KEY_BYTES,
  HKDF_INFO,
  INBOX_AAD_TAG,
  INBOX_MAX_MESSAGE_BYTES,
  INBOX_MESSAGE_ID_PATTERN,
} from "../constants.ts";
import type { Address, Hex32, InboxEnvelope, InboxPlaintext } from "../types.ts";
import { aesGcmDecrypt, aesGcmEncrypt, randomBytes } from "./aes.ts";
import {
  addressToBytes,
  base64ToBytes,
  bytesToBase64,
  bytesToHex,
  concatBytes,
  hexToBytes,
  isAddress,
  normalizeAddress,
  utf8Decode,
  utf8Encode,
} from "./bytes.ts";
import { parseInboxPlaintext } from "./inbox-schema.ts";

const MESSAGE_ID_BYTES = 16;
const X25519_KEY_BYTES = 32;
const AES_TAG_BYTES = 16;
const ENVELOPE_KEYS = [
  "messageId",
  "sender",
  "recipient",
  "createdAt",
  "ephemeralPublicKey",
  "iv",
  "ciphertext",
];

export function generateMessageId(): string {
  return bytesToHex(randomBytes(MESSAGE_ID_BYTES));
}

/** Exactly 69 bytes: tag (13), messageId (16), sender (20), recipient (20). */
export function inboxAad(messageId: string, sender: Address, recipient: Address): Uint8Array {
  if (!INBOX_MESSAGE_ID_PATTERN.test(messageId)) throw new Error("Invalid message ID");
  return concatBytes(
    utf8Encode(INBOX_AAD_TAG),
    hexToBytes(messageId),
    addressToBytes(sender),
    addressToBytes(recipient),
  );
}

/** The envelope has no salt field, so the salt is both public keys of this exchange. */
function deriveInboxKey(
  shared: Uint8Array,
  ephemeralPublicKey: Uint8Array,
  recipientPublicKey: Uint8Array,
): Uint8Array {
  return hkdf(
    sha256,
    shared,
    concatBytes(ephemeralPublicKey, recipientPublicKey),
    utf8Encode(HKDF_INFO.inbox),
    AES_KEY_BYTES,
  );
}

export async function encryptInboxMessage(input: {
  sender: Address;
  recipient: Address;
  recipientX25519PublicKey: Uint8Array;
  plaintext: InboxPlaintext;
  messageId?: string;
  createdAt?: number;
}): Promise<InboxEnvelope> {
  const message = parseInboxPlaintext(input.plaintext);
  const messageId = input.messageId ?? generateMessageId();
  const sender = normalizeAddress(input.sender);
  const recipient = normalizeAddress(input.recipient);
  const ephemeral = x25519.keygen();
  const shared = x25519.getSharedSecret(ephemeral.secretKey, input.recipientX25519PublicKey);
  const { iv, ciphertext } = await aesGcmEncrypt(
    deriveInboxKey(shared, ephemeral.publicKey, input.recipientX25519PublicKey),
    utf8Encode(JSON.stringify(message)),
    inboxAad(messageId, sender, recipient),
  );
  if (ciphertext.length > INBOX_MAX_MESSAGE_BYTES) throw new Error("This message is too large");
  return {
    messageId,
    sender,
    recipient,
    createdAt: input.createdAt ?? Math.floor(Date.now() / 1000),
    ephemeralPublicKey: bytesToBase64(ephemeral.publicKey),
    iv: bytesToBase64(iv),
    ciphertext: bytesToBase64(ciphertext),
  };
}

/** Validates the fields L4 stores. Used by the client and by W07's routes. */
export function parseInboxEnvelope(value: unknown): InboxEnvelope {
  const fail = (): never => {
    throw new Error("Invalid message envelope");
  };
  if (typeof value !== "object" || value === null || Array.isArray(value)) fail();
  const envelope = value as Record<string, unknown>;
  const keys = Object.keys(envelope);
  if (keys.length !== ENVELOPE_KEYS.length || !ENVELOPE_KEYS.every((key) => keys.includes(key))) {
    fail();
  }
  const { messageId, sender, recipient, createdAt, ephemeralPublicKey, iv, ciphertext } = envelope;
  if (typeof messageId !== "string" || !INBOX_MESSAGE_ID_PATTERN.test(messageId)) fail();
  if (!isAddress(sender) || !isAddress(recipient)) fail();
  if (!Number.isSafeInteger(createdAt) || (createdAt as number) < 0) fail();
  if (
    typeof ephemeralPublicKey !== "string" ||
    typeof iv !== "string" ||
    typeof ciphertext !== "string"
  ) {
    fail();
  }
  try {
    const ciphertextLength = base64ToBytes(ciphertext as string).length;
    if (
      base64ToBytes(ephemeralPublicKey as string).length !== X25519_KEY_BYTES ||
      base64ToBytes(iv as string).length !== AES_IV_BYTES ||
      ciphertextLength < AES_TAG_BYTES ||
      ciphertextLength > INBOX_MAX_MESSAGE_BYTES
    ) {
      fail();
    }
  } catch {
    fail();
  }
  return envelope as unknown as InboxEnvelope;
}

/** The value signed in a `send` request: keccak256 of the decoded ciphertext bytes. */
export function inboxCiphertextHash(ciphertext: string): Hex32 {
  return `0x${bytesToHex(keccak_256(base64ToBytes(ciphertext)))}`;
}

/**
 * Decrypts and validates a message. The result is NOT yet safe to show:
 * run `checkInboxMessage` first (Invariant 22).
 */
export async function decryptInboxMessage(
  value: InboxEnvelope,
  recipientX25519SecretKey: Uint8Array,
): Promise<InboxPlaintext> {
  const envelope = parseInboxEnvelope(value);
  const ephemeralPublicKey = base64ToBytes(envelope.ephemeralPublicKey);
  let shared: Uint8Array;
  let recipientPublicKey: Uint8Array;
  try {
    recipientPublicKey = x25519.getPublicKey(recipientX25519SecretKey);
    shared = x25519.getSharedSecret(recipientX25519SecretKey, ephemeralPublicKey);
  } catch {
    throw new Error("Could not decrypt this data");
  }
  const plaintext = await aesGcmDecrypt(
    deriveInboxKey(shared, ephemeralPublicKey, recipientPublicKey),
    base64ToBytes(envelope.iv),
    base64ToBytes(envelope.ciphertext),
    inboxAad(envelope.messageId, envelope.sender, envelope.recipient),
  );
  let parsed: unknown;
  try {
    parsed = JSON.parse(utf8Decode(plaintext));
  } catch {
    throw new Error("Invalid message format");
  }
  return parseInboxPlaintext(parsed);
}
