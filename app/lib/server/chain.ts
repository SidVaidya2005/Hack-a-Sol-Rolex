import "server-only";

import { readFile } from "node:fs/promises";
import path from "node:path";

import { recordAccessAbi } from "@rado/shared";
import type { Address, EddsaPublicKey, Hex32 } from "@rado/shared";
import { createPublicClient, http, isAddress, parseAbi, zeroAddress } from "viem";

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

/** Read on each call, so a fresh seed takes effect without restarting the app. */
export async function recordAccessAddress(): Promise<Address> {
  const file = path.resolve(process.cwd(), "..", "contracts", "deployments", "localhost.json");
  let address: unknown;
  try {
    const deployment = JSON.parse(await readFile(file, "utf8")) as {
      contracts?: { recordAccess?: unknown };
    };
    address = deployment.contracts?.recordAccess;
  } catch {
    throw new HttpError(503, "The contracts are not deployed yet.");
  }
  if (typeof address !== "string" || !isAddress(address, { strict: false })) {
    throw new HttpError(503, "The contracts are not deployed yet.");
  }
  return address;
}

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
): Promise<{ bundleHash: Hex32; cid: string } | null> {
  const [patient, bundleHash, cid] = await readRecordAccess((client, address) =>
    client.readContract({ address, abi, functionName: "recordOf", args: [recordId] }),
  );
  return patient === zeroAddress ? null : { bundleHash, cid };
}
