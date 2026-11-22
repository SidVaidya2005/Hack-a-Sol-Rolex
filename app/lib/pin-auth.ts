import { CHAIN_ID } from "@rado/shared";
import type { Address, Hex32 } from "@rado/shared";

/** Largest encrypted bundle `/api/pin` accepts, in decoded bytes. */
export const MAX_BUNDLE_BYTES = 1024 * 1024;

/** Longer than inbox requests, because a person approves this one in MetaMask. */
export const PIN_AUTH_MAX_TTL_SECONDS = 300;

export interface PinAuthMessage {
  wallet: Address;
  bundleHash: Hex32;
  nonce: Hex32;
  expiresAt: bigint;
}

/** The wallet signs the hash of the encrypted bundle, so no record content is in the prompt. */
export function pinTypedData(message: PinAuthMessage) {
  return {
    domain: { name: "Rado", version: "1", chainId: CHAIN_ID },
    primaryType: "RadoPinBundle",
    types: {
      RadoPinBundle: [
        { name: "wallet", type: "address" },
        { name: "bundleHash", type: "bytes32" },
        { name: "nonce", type: "bytes32" },
        { name: "expiresAt", type: "uint64" },
      ],
    },
    message,
  } as const;
}
