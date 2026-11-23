import "server-only";

import { readFile } from "node:fs/promises";
import path from "node:path";

import { recordAccessAbi } from "@rado/shared";
import type { Address, EddsaPublicKey, Hex32 } from "@rado/shared";
import {
  createPublicClient,
  hexToBytes,
  http,
  isAddress,
  isAddressEqual,
  parseAbi,
  parseEventLogs,
  TransactionReceiptNotFoundError,
  zeroAddress,
} from "viem";

import { providersFromWallets, type Provider } from "../providers";
import { HttpError } from "./http";

const DEFAULT_RPC_URL = "http://127.0.0.1:8545";
const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "[::1]"]);
const abi = parseAbi(recordAccessAbi);

/** The proxy must only ever reach the Hardhat node on this laptop. */
export function hardhatRpcUrl(): string {
  const value = process.env.HARDHAT_RPC_URL || DEFAULT_RPC_URL;
  const url = new URL(value);
  if (url.protocol !== "http:" || !LOOPBACK_HOSTS.has(url.hostname)) {
    throw new Error("HARDHAT_RPC_URL must point to this laptop");
  }
  return url.toString();
}

// The E2E script runs on its own chain, so it must not read the demo deployment.
function deploymentFile(): string {
  return process.env.RADO_E2E_DIR
    ? path.join(process.env.RADO_E2E_DIR, "localhost.json")
    : path.resolve(process.cwd(), "..", "contracts", "deployments", "localhost.json");
}

/** An older deployment has no directory, so sharing falls back to unlisted wallets. */
export async function deployedProviders(): Promise<Provider[]> {
  try {
    const deployment = JSON.parse(await readFile(deploymentFile(), "utf8")) as {
      wallets?: unknown;
    };
    return providersFromWallets(deployment.wallets);
  } catch {
    return [];
  }
}

/** Read on each call, so a fresh seed takes effect without restarting the app. */
async function deployedAddress(
  name: "recordAccess" | "claimSettlement" | "mockUsd",
): Promise<Address> {
  let address: unknown;
  try {
    const deployment = JSON.parse(await readFile(deploymentFile(), "utf8")) as {
      contracts?: Record<string, unknown>;
    };
    address = deployment.contracts?.[name];
  } catch {
    throw new HttpError(503, "The contracts are not deployed yet.");
  }
  if (typeof address !== "string" || !isAddress(address, { strict: false })) {
    throw new HttpError(503, "The contracts are not deployed yet.");
  }
  return address;
}

export const recordAccessAddress = () => deployedAddress("recordAccess");
export const claimSettlementAddress = () => deployedAddress("claimSettlement");
export const mockUsdAddress = () => deployedAddress("mockUsd");

async function readRecordAccess<T>(
  read: (client: ReturnType<typeof createPublicClient>, address: Address) => Promise<T>,
): Promise<T> {
  const address = await recordAccessAddress();
  const client = createPublicClient({ transport: http(hardhatRpcUrl(), { retryCount: 0 }) });
  try {
    return await read(client, address);
  } catch {
    throw new HttpError(503, "The blockchain is not reachable.");
  }
}

export async function registeredEddsaKey(wallet: Address): Promise<EddsaPublicKey | null> {
  const [Ax, Ay, , registered] = await readRecordAccess((client, address) =>
    client.readContract({ address, abi, functionName: "keysOf", args: [wallet] }),
  );
  return registered ? { Ax: Ax.toString(), Ay: Ay.toString() } : null;
}

export async function anchoredRecord(
  recordId: Hex32,
): Promise<{ patient: Address; bundleHash: Hex32; cid: string } | null> {
  const [patient, bundleHash, cid] = await readRecordAccess((client, address) =>
    client.readContract({ address, abi, functionName: "recordOf", args: [recordId] }),
  );
  return patient === zeroAddress ? null : { patient, bundleHash, cid };
}

export async function registeredX25519Key(wallet: Address): Promise<Uint8Array | null> {
  const [, , x25519PublicKey, registered] = await readRecordAccess((client, address) =>
    client.readContract({ address, abi, functionName: "keysOf", args: [wallet] }),
  );
  return registered ? hexToBytes(x25519PublicKey) : null;
}

export function isRegisteredResponder(wallet: Address): Promise<boolean> {
  return readRecordAccess((client, address) =>
    client.readContract({ address, abi, functionName: "isResponder", args: [wallet] }),
  );
}

/** Reads one log from a successful transaction on the deployed RecordAccess contract. */
export async function breakGlassEvent(
  hash: Hex32,
  logIndex: number,
): Promise<{ recordId: Hex32; patient: Address; responder: Address } | null> {
  const contract = await recordAccessAddress();
  const client = createPublicClient({ transport: http(hardhatRpcUrl(), { retryCount: 0 }) });
  let receipt;
  try {
    receipt = await client.getTransactionReceipt({ hash });
  } catch (error) {
    if (error instanceof TransactionReceiptNotFoundError) return null;
    throw new HttpError(503, "The blockchain is not reachable.");
  }
  if (receipt.status !== "success") return null;
  const log = receipt.logs.find(
    (entry) => entry.logIndex === logIndex && isAddressEqual(entry.address, contract),
  );
  if (!log) return null;
  const [event] = parseEventLogs({ abi, logs: [log], eventName: "BreakGlassInvoked" });
  return event ? event.args : null;
}
