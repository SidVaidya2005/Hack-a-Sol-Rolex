import "server-only";

import { rm, stat } from "node:fs/promises";
import path from "node:path";

import { encodeBundle, hashBundleBytes, parseBundle } from "@rado/shared";
import { PinataSDK } from "pinata";

import { MAX_BUNDLE_BYTES, MAX_SMALL_BUNDLE_BYTES } from "../pin-auth";
import { anchoredRecord } from "./chain";
import { cacheRoot, readFileIfPresent, withLock, writeFileAtomic } from "./file-store";
import { HttpError } from "./http";

const CID_PATTERN = /^(Qm[1-9A-HJ-NP-Za-km-z]{44}|b[a-z2-7]{58,100})$/;
const GATEWAY_HOST = /^[a-z0-9.-]+(:[0-9]+)?$/i;
const GATEWAY_TIMEOUT_MS = 8_000;
const recordsDirectory = path.join(cacheRoot, "records");
const ownersDirectory = path.join(cacheRoot, "record-owners");
const RECORD_ID_PATTERN = /^0x[0-9a-f]{64}$/;

function ownerFile(recordId: string): string {
  const id = recordId.toLowerCase();
  if (!RECORD_ID_PATTERN.test(id)) throw new HttpError(400, "This record ID is not valid.");
  return path.join(ownersDirectory, id.slice(2));
}

/** The first wallet to pin a record ID owns it, so a pinned bundle cannot be anchored by another. */
export function claimRecordOwner(recordId: string, wallet: string): Promise<void> {
  return withLock("record-owners", async () => {
    const file = ownerFile(recordId);
    const owner = (await readFileIfPresent(file))?.toString();
    if (owner === undefined) await writeFileAtomic(file, wallet.toLowerCase());
    else if (owner !== wallet.toLowerCase()) {
      throw new HttpError(403, "This record belongs to another wallet.");
    }
  });
}

export async function recordOwner(recordId: string): Promise<string | null> {
  return (await readFileIfPresent(ownerFile(recordId)))?.toString() ?? null;
}

export function assertCid(cid: string): void {
  if (!CID_PATTERN.test(cid)) throw new HttpError(400, "This record ID is not valid.");
}

function cacheFile(cid: string): string {
  assertCid(cid);
  return path.join(recordsDirectory, `${cid}.json`);
}

/** Rejects anything but the exact canonical bytes of an encrypted bundle. */
export function assertEncryptedBundle(bytes: Uint8Array): void {
  let canonical: Uint8Array;
  try {
    canonical = encodeBundle(parseBundle(bytes));
  } catch {
    throw new HttpError(400, "This is not a valid encrypted bundle.");
  }
  if (Buffer.compare(canonical, bytes) !== 0) {
    throw new HttpError(400, "This is not a valid encrypted bundle.");
  }
}

export async function pinBundle(bytes: Uint8Array): Promise<string> {
  const pinataJwt = process.env.PINATA_JWT;
  const pinataGateway = process.env.PINATA_GATEWAY;
  if (!pinataJwt || !pinataGateway) throw new HttpError(503, "Storage is not configured.");

  const pinata = new PinataSDK({ pinataJwt, pinataGateway });
  // A fixed name, so no record detail reaches Pinata's file metadata.
  const file = new File([Buffer.from(bytes)], "bundle.json", { type: "application/json" });
  let cid: string;
  try {
    ({ cid } = await pinata.upload.public.file(file));
  } catch {
    throw new HttpError(502, "The encrypted record could not be stored.");
  }
  assertCid(cid);
  await writeFileAtomic(cacheFile(cid), bytes);
  return cid;
}

/** Fetched directly because the on-chain hash covers exact bytes, which parsing would lose. */
async function fetchFromGateway(cid: string): Promise<Uint8Array | null> {
  const gateway = process.env.PINATA_GATEWAY;
  if (!gateway || !GATEWAY_HOST.test(gateway)) return null;
  try {
    const response = await fetch(`https://${gateway}/ipfs/${cid}`, {
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(GATEWAY_TIMEOUT_MS),
    });
    if (!response.ok || !response.body) return null;
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.length;
      if (total > MAX_BUNDLE_BYTES) {
        await reader.cancel();
        return null;
      }
      chunks.push(value);
    }
    return Buffer.concat(chunks);
  } catch {
    return null;
  }
}

/**
 * `not-current` covers a bundle pinned but not anchored yet, or replaced by a rotation.
 * It is never served, but only `tampered` bytes are safe to delete from the cache.
 */
async function checkAgainstChain(
  bytes: Uint8Array,
  cid: string,
): Promise<"match" | "not-current" | "tampered"> {
  let recordId;
  try {
    ({ recordId } = parseBundle(bytes));
  } catch {
    return "tampered";
  }
  const record = await anchoredRecord(recordId);
  if (record === null || record.cid !== cid) return "not-current";
  return record.bundleHash.toLowerCase() === hashBundleBytes(bytes).toLowerCase()
    ? "match"
    : "tampered";
}

/** Lets list screens skip a large file without hashing it. Its size is already public. */
export async function isCachedBundleLarge(cid: string): Promise<boolean> {
  try {
    return (await stat(cacheFile(cid))).size > MAX_SMALL_BUNDLE_BYTES;
  } catch {
    return false;
  }
}

/** Every read is checked against the chain, whether it came from the cache or Pinata. */
export async function loadVerifiedBundle(cid: string): Promise<Uint8Array> {
  const file = cacheFile(cid);
  const cached = await readFileIfPresent(file);
  if (cached) {
    const status = await checkAgainstChain(cached, cid);
    if (status === "match") return cached;
    if (status === "tampered") await rm(file, { force: true });
  }

  const remote = await fetchFromGateway(cid);
  if (remote && (await checkAgainstChain(remote, cid)) === "match") {
    await writeFileAtomic(file, remote);
    return remote;
  }
  if (cached || remote) throw new HttpError(409, "This record failed its integrity check.");
  throw new HttpError(404, "This record could not be found.");
}
