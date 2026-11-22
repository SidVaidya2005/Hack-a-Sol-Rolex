import { base64ToBytes, hashBundleBytes } from "@rado/shared";
import type { Address, Hex32 } from "@rado/shared";
import { isAddress, isHex, verifyTypedData } from "viem";

import { MAX_BUNDLE_BYTES, PIN_AUTH_MAX_TTL_SECONDS, pinTypedData } from "@/lib/pin-auth";
import { registeredEddsaKey } from "@/lib/server/chain";
import { consumeNonce } from "@/lib/server/file-store";
import { asObject, handleRoute, HttpError, readJsonBody } from "@/lib/server/http";
import { assertEncryptedBundle, pinBundle } from "@/lib/server/records";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Base64 grows data by a third. The extra 4 KiB covers the signature fields. */
const MAX_BODY_BYTES = Math.ceil((MAX_BUNDLE_BYTES * 4) / 3) + 4096;
const NONCE_PATTERN = /^0x[0-9a-fA-F]{64}$/;
const SIGNATURE_PATTERN = /^0x[0-9a-fA-F]{130}$/;

async function assertSigned(rawAuth: unknown, bundleHash: Hex32): Promise<void> {
  const auth = asObject(rawAuth);
  const { wallet, nonce, expiresAt, signature } = auth;
  if (
    typeof wallet !== "string" ||
    !isAddress(wallet, { strict: false }) ||
    typeof nonce !== "string" ||
    !NONCE_PATTERN.test(nonce) ||
    !Number.isSafeInteger(expiresAt) ||
    typeof signature !== "string" ||
    !SIGNATURE_PATTERN.test(signature) ||
    !isHex(signature)
  ) {
    throw new HttpError(400, "This request has the wrong format.");
  }
  const expiry = expiresAt as number;
  const now = Math.floor(Date.now() / 1000);
  if (expiry <= now || expiry > now + PIN_AUTH_MAX_TTL_SECONDS) {
    throw new HttpError(401, "This request has expired.");
  }
  const address = wallet.toLowerCase() as Address;
  if (!(await registeredEddsaKey(address))) {
    throw new HttpError(403, "This wallet is not registered.");
  }
  let valid = false;
  try {
    valid = await verifyTypedData({
      address,
      signature,
      ...pinTypedData({
        wallet: address,
        bundleHash,
        nonce: nonce as Hex32,
        expiresAt: BigInt(expiry),
      }),
    });
  } catch {
    valid = false;
  }
  if (!valid) throw new HttpError(401, "This request could not be verified.");
  if (!(await consumeNonce(nonce, expiry))) {
    throw new HttpError(401, "This request was already used.");
  }
}

export function POST(request: Request): Promise<Response> {
  return handleRoute("pin", async () => {
    const body = asObject(await readJsonBody(request, MAX_BODY_BYTES));
    if (typeof body.bundle !== "string") {
      throw new HttpError(400, "This is not a valid encrypted bundle.");
    }
    let bytes: Uint8Array;
    try {
      bytes = base64ToBytes(body.bundle);
    } catch {
      throw new HttpError(400, "This is not a valid encrypted bundle.");
    }
    if (bytes.length > MAX_BUNDLE_BYTES) throw new HttpError(413, "This record is too large.");
    assertEncryptedBundle(bytes);

    const bundleHash = hashBundleBytes(bytes);
    await assertSigned(body.auth, bundleHash);
    const cid = await pinBundle(bytes);
    return Response.json({ cid, bundleHash });
  });
}
