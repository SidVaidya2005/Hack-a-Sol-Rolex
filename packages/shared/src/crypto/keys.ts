import { x25519 } from "@noble/curves/ed25519.js";
import { hkdf } from "@noble/hashes/hkdf.js";
import { sha256 } from "@noble/hashes/sha2.js";

import { HKDF_INFO, UNLOCK_TYPED_DATA } from "../constants.ts";
import type { Address, EddsaPublicKey } from "../types.ts";
import { hexToBytes, normalizeAddress, utf8Encode } from "./bytes.ts";
import { eddsaPublicKey } from "./zk.ts";

const SIGNATURE_BYTES = 65;
const R_AND_S_BYTES = 64;
const DERIVED_KEY_BYTES = 32;

/** Held in browser memory only. Never persist or transmit (Invariant 5). */
export interface UnlockedKeys {
  eddsaSeed: Uint8Array;
  eddsaPublicKey: EddsaPublicKey;
  x25519SecretKey: Uint8Array;
  x25519PublicKey: Uint8Array;
}

/** The EIP-712 payload the wallet signs once to unlock Rado. */
export function unlockTypedData(wallet: Address) {
  return {
    domain: UNLOCK_TYPED_DATA.domain,
    types: UNLOCK_TYPED_DATA.types,
    primaryType: UNLOCK_TYPED_DATA.primaryType,
    message: { wallet: normalizeAddress(wallet), purpose: UNLOCK_TYPED_DATA.purpose },
  };
}

/**
 * Derives from r||s only. Wallets report the recovery byte as 0/1 or 27/28,
 * and that difference must not change a user's keys.
 */
export async function deriveUnlockKeys(signature: string): Promise<UnlockedKeys> {
  const bytes = hexToBytes(signature);
  if (bytes.length !== SIGNATURE_BYTES) throw new Error("Invalid unlock signature");
  const material = bytes.slice(0, R_AND_S_BYTES);
  const derive = (info: string) =>
    hkdf(sha256, material, undefined, utf8Encode(info), DERIVED_KEY_BYTES);

  const eddsaSeed = derive(HKDF_INFO.eddsa);
  const x25519SecretKey = derive(HKDF_INFO.x25519);
  return {
    eddsaSeed,
    eddsaPublicKey: await eddsaPublicKey(eddsaSeed),
    x25519SecretKey,
    x25519PublicKey: x25519.getPublicKey(x25519SecretKey),
  };
}
