import type { Address, Base64, Hex32 } from "../types.ts";

/** Strict encoders. Errors never include the rejected value, which may be secret. */

const HEX_PATTERN = /^(?:[0-9a-f]{2})*$/;
const ADDRESS_PATTERN = /^0x[0-9a-fA-F]{40}$/;
const HEX32_PATTERN = /^0x[0-9a-fA-F]{64}$/;
const DECIMAL_PATTERN = /^(?:0|[1-9][0-9]*)$/;
const BASE64_PATTERN = /^[A-Za-z0-9+/]*={0,2}$/;
const BASE64_CHUNK = 0x8000;

export function utf8Encode(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

export function utf8Decode(bytes: Uint8Array): string {
  return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
}

export function concatBytes(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((total, part) => total + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function hexToBytes(hex: string): Uint8Array {
  const body = (hex.startsWith("0x") ? hex.slice(2) : hex).toLowerCase();
  if (!HEX_PATTERN.test(body)) throw new Error("Invalid hex value");
  const out = new Uint8Array(body.length / 2);
  for (let i = 0; i < out.length; i += 1) {
    out[i] = Number.parseInt(body.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

export function bytesToBigInt(bytes: Uint8Array): bigint {
  return bytes.length === 0 ? 0n : BigInt(`0x${bytesToHex(bytes)}`);
}

/** Built-in base64 is far faster on large files. Older browsers use the fallback below. */
type NativeBase64 = {
  fromBase64?: (value: string, options: { lastChunkHandling: "strict" }) => Uint8Array;
};

export function bytesToBase64(bytes: Uint8Array): Base64 {
  const native = (bytes as Uint8Array & { toBase64?: () => string }).toBase64;
  if (native) return native.call(bytes);
  let binary = "";
  for (let i = 0; i < bytes.length; i += BASE64_CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + BASE64_CHUNK));
  }
  return btoa(binary);
}

/** Accepts only canonical base64, so one byte string has one encoding. */
export function base64ToBytes(value: string): Uint8Array {
  if (value.length % 4 !== 0 || !BASE64_PATTERN.test(value)) {
    throw new Error("Invalid base64 value");
  }
  const native = Uint8Array as unknown as NativeBase64;
  if (native.fromBase64) {
    try {
      // Strict mode rejects missing padding and non-zero trailing bits, so it stays canonical.
      return native.fromBase64(value, { lastChunkHandling: "strict" });
    } catch {
      throw new Error("Invalid base64 value");
    }
  }
  let binary: string;
  try {
    binary = atob(value);
  } catch {
    throw new Error("Invalid base64 value");
  }
  const out = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) out[index] = binary.charCodeAt(index);
  if (bytesToBase64(out) !== value) throw new Error("Invalid base64 value");
  return out;
}

export function isAddress(value: unknown): value is Address {
  return typeof value === "string" && ADDRESS_PATTERN.test(value);
}

export function isHex32(value: unknown): value is Hex32 {
  return typeof value === "string" && HEX32_PATTERN.test(value);
}

export function normalizeAddress(address: string): Address {
  if (!isAddress(address)) throw new Error("Invalid wallet address");
  return address.toLowerCase() as Address;
}

export function addressToBytes(address: string): Uint8Array {
  return hexToBytes(normalizeAddress(address));
}

export function hex32ToBytes(value: string): Uint8Array {
  if (!isHex32(value)) throw new Error("Invalid 32-byte value");
  return hexToBytes(value);
}

/** Parses a canonical decimal string that must be below `maxExclusive`. */
export function parseDecimal(value: unknown, maxExclusive: bigint): bigint {
  if (typeof value !== "string" || !DECIMAL_PATTERN.test(value)) {
    throw new Error("Invalid decimal value");
  }
  const parsed = BigInt(value);
  if (parsed >= maxExclusive) throw new Error("Decimal value is out of range");
  return parsed;
}
