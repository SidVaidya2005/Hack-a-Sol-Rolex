import { AES_IV_BYTES, AES_KEY_BYTES } from "../constants.ts";

const AES_TAG_BITS = 128;

export function randomBytes(length: number): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(length));
}

function importAesKey(key: Uint8Array, usage: "encrypt" | "decrypt"): Promise<CryptoKey> {
  if (key.length !== AES_KEY_BYTES) throw new Error("Invalid encryption key");
  return crypto.subtle.importKey("raw", Uint8Array.from(key), "AES-GCM", false, [usage]);
}

/** Always draws a new random 96-bit IV. Callers cannot supply one (Invariant 12). */
export async function aesGcmEncrypt(
  key: Uint8Array,
  plaintext: Uint8Array,
  additionalData: Uint8Array,
): Promise<{ iv: Uint8Array; ciphertext: Uint8Array }> {
  const iv = randomBytes(AES_IV_BYTES);
  const cryptoKey = await importAesKey(key, "encrypt");
  const ciphertext = await crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv: Uint8Array.from(iv),
      additionalData: Uint8Array.from(additionalData),
      tagLength: AES_TAG_BITS,
    },
    cryptoKey,
    Uint8Array.from(plaintext),
  );
  return { iv, ciphertext: new Uint8Array(ciphertext) };
}

export async function aesGcmDecrypt(
  key: Uint8Array,
  iv: Uint8Array,
  ciphertext: Uint8Array,
  additionalData: Uint8Array,
): Promise<Uint8Array> {
  if (iv.length !== AES_IV_BYTES) throw new Error("Could not decrypt this data");
  const cryptoKey = await importAesKey(key, "decrypt");
  try {
    const plaintext = await crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: Uint8Array.from(iv),
        additionalData: Uint8Array.from(additionalData),
        tagLength: AES_TAG_BITS,
      },
      cryptoKey,
      Uint8Array.from(ciphertext),
    );
    return new Uint8Array(plaintext);
  } catch {
    throw new Error("Could not decrypt this data");
  }
}
