import "server-only";

import { verifyInboxRequest } from "@rado/shared";
import type { Address, Hex32, InboxAction } from "@rado/shared";
import { isAddress } from "viem";

import { registeredEddsaKey } from "./chain";
import { consumeNonce } from "./file-store";
import { asObject, HttpError } from "./http";

/**
 * Verifies the signature against the on-chain key before spending the nonce,
 * so an unauthenticated caller cannot burn someone else's nonce.
 */
export async function authenticateInbox(
  rawAuth: unknown,
  action: InboxAction,
  ciphertextHash?: Hex32,
): Promise<Address> {
  const auth = asObject(rawAuth);
  if (typeof auth.wallet !== "string" || !isAddress(auth.wallet, { strict: false })) {
    throw new HttpError(400, "This request has the wrong format.");
  }
  const wallet = auth.wallet.toLowerCase() as Address;
  const publicKey = await registeredEddsaKey(wallet);
  if (!publicKey) throw new HttpError(403, "This wallet is not registered.");

  const now = Math.floor(Date.now() / 1000);
  const valid = await verifyInboxRequest(rawAuth, {
    action,
    wallet,
    publicKey,
    now,
    ...(ciphertextHash ? { ciphertextHash } : {}),
  });
  if (!valid) throw new HttpError(401, "This request could not be verified.");

  if (!(await consumeNonce(auth.nonce as string, auth.expiresAt as number))) {
    throw new HttpError(401, "This request was already used.");
  }
  return wallet;
}
