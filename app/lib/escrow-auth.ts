import { CHAIN_ID } from "@rado/shared";
import type { Address, Hex32 } from "@rado/shared";
import { keccak256 } from "viem";

/** Long enough for a person to approve the request in MetaMask. */
export const ESCROW_AUTH_MAX_TTL_SECONDS = 300;

export interface EscrowReleaseMessage {
  wallet: Address;
  recordId: Hex32;
  transactionHash: Hex32;
  logIndex: number;
  expiresAt: bigint;
}

/** Binds the signature to one on-chain break-glass event. */
export function escrowReleaseTypedData(message: EscrowReleaseMessage) {
  return {
    domain: { name: "Rado", version: "1", chainId: CHAIN_ID },
    primaryType: "RadoEscrowRelease",
    types: {
      RadoEscrowRelease: [
        { name: "wallet", type: "address" },
        { name: "recordId", type: "bytes32" },
        { name: "transactionHash", type: "bytes32" },
        { name: "logIndex", type: "uint32" },
        { name: "expiresAt", type: "uint64" },
      ],
    },
    message,
  } as const;
}

/** The bundle reader label for escrow. It is computed from the key, so it cannot be mismatched. */
export function escrowReaderAddress(publicKey: Uint8Array): Address {
  return `0x${keccak256(publicKey).slice(-40)}`;
}
