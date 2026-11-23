import {
  addRecordReader,
  breakGlassReasonText,
  BreakGlassReasonError,
  buildPatientEntry,
  buildRecordSlice,
  bytesToBase64,
  canShareDocument,
  canShareProfile,
  decodeBreakGlassReason,
  decodeDocument,
  decodeNameCard,
  decodeProfile,
  decryptRecord,
  DOCUMENT_CATEGORIES,
  DocumentError,
  encodeBreakGlassReason,
  encodeBundle,
  encodeDocument,
  encodeNameCard,
  encodeProfile,
  encryptRecord,
  hashBundleBytes,
  isDocumentPayload,
  isNameCardPayload,
  isProfilePayload,
  parseBundle,
  PatientEntryError,
  ProfileError,
  recordAccessAbi,
  rotateRecordKey,
  SHARE_PROFILES,
  sliceProfileOf,
  unwrapRecordKey,
  utf8Decode,
  utf8Encode,
} from "@rado/shared";
import type {
  Address,
  BreakGlassReason,
  DocumentCategory,
  EncryptedBundle,
  Hex32,
  PatientEntryInput,
  PatientProfile,
  RadoDocument,
  RadoDocumentInfo,
  RecordReader,
  SliceProfile,
  UnlockedKeys,
  WrappedRecordKey,
} from "@rado/shared";
import {
  BaseError,
  bytesToHex,
  ContractFunctionRevertedError,
  getContract,
  hexToBytes,
  isHex,
  parseAbi,
  parseEventLogs,
  size,
  UserRejectedRequestError,
  zeroAddress,
} from "viem";
import type {
  Chain,
  JsonRpcAccount,
  LocalAccount,
  PublicClient,
  Transport,
  WalletClient,
} from "viem";

import { escrowReaderAddress, escrowReleaseTypedData } from "./escrow-auth.ts";
import { MAX_SMALL_BUNDLE_BYTES, pinTypedData } from "./pin-auth.ts";
import { providersFromWallets, type Provider } from "./providers.ts";

const abi = parseAbi(recordAccessAbi);
const PIN_AUTH_TTL_SECONDS = 180;
const ESCROW_AUTH_TTL_SECONDS = 180;
const SECONDS_PER_DAY = 86_400;
const MAX_CACHED_BUNDLES = 32;
const MAX_CACHED_BUNDLE_BYTES = 64 * 1024 * 1024;

export type RecordAccount = JsonRpcAccount | LocalAccount;
export type GrantStatus = "Active" | "Expired" | "Revoked";

export interface RecordGrant {
  reader: Address;
  expiresAt: bigint;
  status: GrantStatus;
}

export interface PatientRecord {
  recordId: Hex32;
  keyVersion: bigint;
  grants: RecordGrant[];
}

export interface SharedRecord {
  recordId: Hex32;
  patient: Address;
  expiresAt: bigint;
  status: GrantStatus;
}

export interface TimelineEntry {
  id: string;
  title: string;
  recordId: Hex32;
  actor: Address | null;
  timestamp: bigint;
  blockNumber: bigint;
  logIndex: number;
}

export interface RecordItem {
  id: string;
  kind: string;
  description: string;
}

/** Read from decrypted contents, because the chain must not label a record's type. */
export interface RecordInfo {
  sliceProfile: SliceProfile | null;
  document: RadoDocumentInfo | null;
  isProfile: boolean;
  /** A name-only record, hidden from the patient's record list. */
  isNameCard?: boolean;
  /** A readable label from the decrypted entry. It stays in browser memory. */
  title?: string;
}

export type OpenedRecord =
  | { kind: "record"; items: RecordItem[] }
  | { kind: "document"; document: RadoDocument }
  | { kind: "profile"; profile: PatientProfile };

/** Chain checks for profile sharing, supplied by the claim exchange. */
export interface ProfileAccessChecks {
  hospitalIsApproved: (wallet: Address) => Promise<boolean>;
  walletIsInsurer: (wallet: Address) => Promise<boolean>;
}

export interface RecordServiceConfig {
  publicClient: PublicClient;
  walletClient: WalletClient<Transport, Chain, RecordAccount>;
  recordAccess: Address;
  /** Empty in the browser, where routes share the page's origin. */
  baseUrl?: string;
  /** Set only by the E2E script, so a test run never uploads to Pinata. */
  storeBundle?: (bundle: EncryptedBundle) => Promise<{ bundleHash: Hex32; cid: string }>;
  /** Without these, records can go only to providers in the directory. */
  profileAccess?: ProfileAccessChecks;
}

export interface EmergencySummaryRecord {
  recordId: Hex32;
  patient: Address;
}

export interface EmergencySummaryItem {
  id: string;
  label: string;
  value: string;
}

/** Called just before each wallet popup, so the screen can say what the popup is for. */
export type WalletPromptHandler = (text: string) => void;

const UPLOAD_PROMPT = "Step 1 of 2: approve the encrypted upload in your wallet.";
const CHAIN_PROMPT = "Step 2 of 2: confirm the on-chain update in your wallet.";
const SINGLE_CHAIN_PROMPT = "Confirm the on-chain update in your wallet.";
const VIEW_PROMPT = "Confirm the on-chain view log in your wallet.";
const REGISTER_PROMPT = "Approve registering your public keys in your wallet.";
const BREAK_GLASS_PROMPT =
  "Step 1 of 2: confirm the permanent emergency access log in your wallet.";
const RELEASE_PROMPT = "Step 2 of 2: sign the request to release the emergency summary.";
const ESCROW_UNAVAILABLE = "Emergency access is not set up on the host.";

/** An error whose message is already safe and plain enough to show a user. */
export class RecordError extends Error {}

const REVERT_MESSAGES: Record<string, string> = {
  AccessNotActive: "This wallet does not have active access to this record.",
  ClaimBeforePolicyStart: "This claim is dated before the policy started.",
  ClaimDayInFuture: "This claim is dated in the future.",
  ClaimTooOld: "This claim is more than 30 days old.",
  InvalidExpiry: "Choose an expiry in the future.",
  InvalidPayoutAddress: "This claim has an invalid payout address.",
  InvalidProof: "The contract rejected this proof.",
  InvalidReason: "The emergency reason could not be used. Try again.",
  KeysNotRegistered: "That wallet has not joined Rado yet.",
  NotInsurer: "Only the insurer wallet can do this.",
  NotRecordPatient: "Only the patient can change access to this record.",
  NotResponder: "This wallet is not a registered emergency responder.",
  NotResponderAdmin: "Only the responder admin wallet can do this.",
  NullifierAlreadyUsed: "This claim was already submitted.",
  PolicyAlreadyRegistered: "This policy is already registered.",
  RecordAlreadyExists: "This record already exists. Try again.",
  StaleHospitalRoot: "The approved hospital list changed. Generate a new proof.",
  TotalCapExceeded: "This claim is above the policy's remaining total cap.",
  UnknownPolicy: "This policy is not registered.",
  UnknownRecord: "This record could not be found.",
  ZeroAmount: "The claim amount must be above zero.",
};

/** OpenZeppelin's `ERC20InsufficientBalance`, which is not part of the shared ABI. */
const POOL_EMPTY_SELECTOR = "0xe450d38c";

export function plainRecordError(error: unknown): string {
  if (error instanceof RecordError) return error.message;
  if ((error as { code?: unknown } | null)?.code === 4001) {
    return "You cancelled this in your wallet. Nothing was changed.";
  }
  if (error instanceof BaseError) {
    if (error.walk((cause) => cause instanceof UserRejectedRequestError)) {
      return "You cancelled this in your wallet. Nothing was changed.";
    }
    const reverted = error.walk((cause) => cause instanceof ContractFunctionRevertedError);
    if (reverted instanceof ContractFunctionRevertedError) {
      const name = reverted.data?.errorName;
      if (name && REVERT_MESSAGES[name]) return REVERT_MESSAGES[name];
      if (reverted.signature === POOL_EMPTY_SELECTOR) {
        return "The insurer pool does not have enough funds.";
      }
    }
  }
  return "This could not be completed. Try again.";
}

/** Keeps only the labels, so remembered record details never hold the file itself. */
function documentDetails({ name, mime, category, size }: RadoDocument): RadoDocumentInfo {
  return { name, mime, category, size };
}

function randomHex32(): Hex32 {
  return bytesToHex(crypto.getRandomValues(new Uint8Array(32)));
}

function sameAddress(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase();
}

function textOf(value: unknown): string | null {
  if (typeof value !== "object" || value === null) return null;
  const { text } = value as { text?: unknown };
  return typeof text === "string" ? text : null;
}

/** Reads decrypted FHIR-shaped bytes for display. They stay in browser memory. */
export function describeRecord(bytes: Uint8Array): RecordItem[] {
  let value: unknown;
  try {
    value = JSON.parse(utf8Decode(bytes));
  } catch {
    throw new RecordError("This record could not be read.");
  }
  const entries = (value as { resourceType?: unknown; entry?: unknown } | null)?.entry;
  if ((value as { resourceType?: unknown }).resourceType !== "Bundle" || !Array.isArray(entries)) {
    throw new RecordError("This record could not be read.");
  }
  return entries.map((entry: unknown, index) => {
    const resource = ((entry as { resource?: unknown } | null)?.resource ?? {}) as Record<
      string,
      unknown
    >;
    const kind = typeof resource.resourceType === "string" ? resource.resourceType : "Item";
    return {
      id: typeof resource.id === "string" ? resource.id : `item-${index}`,
      kind,
      description:
        kind === "Patient"
          ? "Patient details"
          : kind === "DocumentReference" && typeof resource.description === "string"
            ? resource.description
            : kind === "Observation" &&
                textOf(resource.code) &&
                typeof resource.valueString === "string"
              ? `${textOf(resource.code)}: ${resource.valueString}`
              : (textOf(resource.code) ??
                textOf(resource.medicationCodeableConcept) ??
                "Health record item"),
    };
  });
}

/** Shows only the emergency fields, even if a summary holds other resource types. */
export function describeEmergencySummary(bytes: Uint8Array): EmergencySummaryItem[] {
  if (isProfilePayload(bytes)) {
    let profile: PatientProfile;
    try {
      profile = decodeProfile(bytes);
    } catch {
      throw new RecordError("This emergency profile could not be read.");
    }
    return [
      { id: "name", label: "Patient", value: profile.fullName },
      { id: "birth", label: "Date of birth", value: profile.dateOfBirth },
      { id: "blood", label: "Blood group", value: profile.bloodGroup },
      { id: "allergies", label: "Allergies", value: profile.allergies || "None listed" },
      {
        id: "contact",
        label: "Emergency contact",
        value: profile.emergencyContact || "None listed",
      },
    ];
  }
  let value: unknown;
  try {
    value = JSON.parse(utf8Decode(bytes));
  } catch {
    throw new RecordError("This emergency summary could not be read.");
  }
  const entries = (value as { entry?: unknown } | null)?.entry;
  if (!Array.isArray(entries)) throw new RecordError("This emergency summary could not be read.");
  return entries.flatMap((entry: unknown, index): EmergencySummaryItem[] => {
    const resource = ((entry as { resource?: unknown } | null)?.resource ?? {}) as Record<
      string,
      unknown
    >;
    const id = typeof resource.id === "string" ? resource.id : `item-${index}`;
    const code = textOf(resource.code);
    if (resource.resourceType === "Patient" && Array.isArray(resource.name)) {
      const name = textOf(resource.name[0]);
      return name ? [{ id, label: "Patient", value: name }] : [];
    }
    if (resource.resourceType === "AllergyIntolerance" && code) {
      return [{ id, label: "Allergy", value: code }];
    }
    if (
      resource.resourceType === "Observation" &&
      code &&
      typeof resource.valueString === "string"
    ) {
      return [{ id, label: code, value: resource.valueString }];
    }
    return [];
  });
}

export function createRecordService({
  publicClient,
  walletClient,
  recordAccess,
  baseUrl = "",
  storeBundle,
  profileAccess,
}: RecordServiceConfig) {
  const contract = getContract({
    address: recordAccess,
    abi,
    client: { public: publicClient, wallet: walletClient },
  });
  // viem cannot infer simulate types for an account union. The real object is passed unchanged.
  const account = walletClient.account as JsonRpcAccount;
  const self = account.address;
  /** A confirmed event whose release did not finish, so a retry does not log a second one. */
  const pendingBreakGlass = new Map<Hex32, { transactionHash: Hex32; logIndex: number }>();
  const recordInfoCache = new Map<string, RecordInfo>();
  const breakGlassReasonCache = new Map<string, string>();
  /** Each anchored record's name card for this wallet, or null. Kept in memory only. */
  const nameCards = new Map<string, { patient: Address; name: string } | null>();
  /** Holds ciphertext only, so repeated screen loads do not download and hash it again. */
  const verifiedBundles = new Map<string, Promise<EncryptedBundle>>();
  const cachedBundleSizes = new Map<string, number>();
  const oversizedBundles = new Set<string>();

  /** Drops the oldest finished bundles, so several 5 MB files cannot exhaust browser memory. */
  function trimBundleCache(): void {
    let total = [...cachedBundleSizes.values()].reduce((sum, size) => sum + size, 0);
    for (const key of [...verifiedBundles.keys()]) {
      const size = cachedBundleSizes.get(key);
      const overCount = verifiedBundles.size > MAX_CACHED_BUNDLES;
      if (!overCount && total <= MAX_CACHED_BUNDLE_BYTES) return;
      if (size === undefined) continue;
      verifiedBundles.delete(key);
      cachedBundleSizes.delete(key);
      total -= size;
    }
  }

  function rememberBundle(key: string, pending: Promise<EncryptedBundle>): void {
    verifiedBundles.set(key, pending);
    pending.then(
      (bundle) => {
        if (verifiedBundles.get(key) !== pending) return;
        cachedBundleSizes.set(key, bundle.ciphertext.length);
        trimBundleCache();
      },
      () => verifiedBundles.delete(key),
    );
  }

  async function confirmed(hash: Hex32): Promise<void> {
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    if (receipt.status !== "success") {
      throw new RecordError("The transaction failed. Nothing was changed.");
    }
  }

  /**
   * Fails closed: the later of chain and laptop time decides whether a grant has ended,
   * because a local chain's latest block can be older than the real time.
   */
  async function currentTime(): Promise<bigint> {
    const block = await publicClient.getBlock();
    const local = BigInt(Math.floor(Date.now() / 1000));
    return block.timestamp > local ? block.timestamp : local;
  }

  function statusOf(expiresAt: bigint, now: bigint): GrantStatus {
    if (expiresAt === 0n) return "Revoked";
    return expiresAt > now ? "Active" : "Expired";
  }

  async function readerKey(address: Address): Promise<RecordReader> {
    const [, , x25519PublicKey, registered] = await contract.read.keysOf([address]);
    if (!registered) throw new RecordError("That wallet has not joined Rado yet.");
    return { address, x25519PublicKey: hexToBytes(x25519PublicKey) };
  }

  /** Re-checks the server's bytes against the chain instead of trusting the route. */
  async function loadBundle(recordId: Hex32) {
    const [patient, bundleHash, cid, keyVersion] = await contract.read.recordOf([recordId]);
    if (patient === zeroAddress) throw new RecordError("This record could not be found.");
    // Keyed by the current on-chain hash, so a grant or rotation always fetches the new bundle.
    const cacheKey = `${recordId}:${bundleHash}`.toLowerCase();
    let pending = verifiedBundles.get(cacheKey);
    if (!pending) {
      pending = fetchVerifiedBundle(recordId, bundleHash, cid);
      rememberBundle(cacheKey, pending);
    }
    return { patient, bundle: await pending, bundleHash, cid, keyVersion };
  }

  async function fetchVerifiedBundle(
    recordId: Hex32,
    bundleHash: Hex32,
    cid: string,
  ): Promise<EncryptedBundle> {
    const response = await fetch(`${baseUrl}/api/records/${cid}`, { cache: "no-store" });
    if (!response.ok) throw new RecordError("The encrypted record could not be loaded.");
    return verifiedBundleFrom(new Uint8Array(await response.arrayBuffer()), recordId, bundleHash);
  }

  function verifiedBundleFrom(
    bytes: Uint8Array,
    recordId: Hex32,
    bundleHash: Hex32,
  ): EncryptedBundle {
    if (hashBundleBytes(bytes).toLowerCase() !== bundleHash.toLowerCase()) {
      throw new RecordError("This record failed its integrity check.");
    }
    let bundle: EncryptedBundle;
    try {
      bundle = parseBundle(bytes);
    } catch {
      throw new RecordError("This record failed its integrity check.");
    }
    if (bundle.recordId.toLowerCase() !== recordId.toLowerCase()) {
      throw new RecordError("This record failed its integrity check.");
    }
    return bundle;
  }

  /**
   * Stops reading once a bundle is too large to be a name card or emergency profile.
   * Returns null for those, and still checks a small bundle against the chain.
   */
  async function loadSmallBundle(
    recordId: Hex32,
  ): Promise<{ patient: Address; bundle: EncryptedBundle } | null> {
    const [patient, bundleHash, cid] = await contract.read.recordOf([recordId]);
    if (patient === zeroAddress) throw new RecordError("This record could not be found.");
    const cacheKey = `${recordId}:${bundleHash}`.toLowerCase();
    if (oversizedBundles.has(cacheKey)) return null;
    const cached = verifiedBundles.get(cacheKey);
    if (cached) return { patient, bundle: await cached };
    const response = await fetch(`${baseUrl}/api/records/${cid}?small=1`, { cache: "no-store" });
    if (response.status === 413) {
      oversizedBundles.add(cacheKey);
      return null;
    }
    if (!response.ok || !response.body) {
      throw new RecordError("The encrypted record could not be loaded.");
    }
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.length;
      if (total > MAX_SMALL_BUNDLE_BYTES) {
        await reader.cancel();
        oversizedBundles.add(cacheKey);
        return null;
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.length;
    }
    const bundle = verifiedBundleFrom(bytes, recordId, bundleHash);
    rememberBundle(cacheKey, Promise.resolve(bundle));
    return { patient, bundle };
  }

  /** The escrow reader label is recomputed here instead of trusting the server's. */
  async function escrowReader(): Promise<RecordReader> {
    const response = await fetch(`${baseUrl}/api/escrow/release`, { cache: "no-store" });
    const body = (await response.json().catch(() => null)) as { publicKey?: unknown } | null;
    const publicKey = body?.publicKey;
    if (!response.ok || typeof publicKey !== "string" || !isHex(publicKey)) {
      throw new RecordError(ESCROW_UNAVAILABLE);
    }
    if (size(publicKey) !== 32) throw new RecordError(ESCROW_UNAVAILABLE);
    const x25519PublicKey = hexToBytes(publicKey);
    return { address: escrowReaderAddress(x25519PublicKey), x25519PublicKey };
  }

  async function anchorNewRecord(
    plaintext: Uint8Array,
    readers: RecordReader[],
    onPrompt?: WalletPromptHandler,
  ): Promise<Hex32> {
    const recordId = randomHex32();
    const { bundle } = await encryptRecord({ recordId, plaintext, readers });
    onPrompt?.(UPLOAD_PROMPT);
    const { bundleHash, cid } = await pin(bundle);
    const { request } = await contract.simulate.anchorRecord([recordId, bundleHash, cid], {
      account,
    });
    onPrompt?.(CHAIN_PROMPT);
    await confirmed(await walletClient.writeContract(request));
    return recordId;
  }

  /** Newest first. A bundle that cannot be loaded is skipped, not treated as a summary. */
  async function summaryRecords(patient?: Address): Promise<EmergencySummaryRecord[]> {
    const escrow = await escrowReader();
    const anchors = await contract.getEvents.RecordAnchored(patient ? { patient } : {}, {
      fromBlock: 0n,
    });
    const found = await Promise.all(
      anchors.map(async ({ args }): Promise<EmergencySummaryRecord | null> => {
        if (!args.recordId || !args.patient) return null;
        try {
          const loaded = await loadSmallBundle(args.recordId);
          if (!loaded) return null;
          return loaded.bundle.wrappedKeys.some((entry) =>
            sameAddress(entry.reader, escrow.address),
          )
            ? { recordId: args.recordId, patient: args.patient }
            : null;
        } catch {
          return null;
        }
      }),
    );
    return found.filter((item) => item !== null).reverse();
  }

  async function pin(bundle: EncryptedBundle): Promise<{ bundleHash: Hex32; cid: string }> {
    if (storeBundle) return storeBundle(bundle);
    const bytes = encodeBundle(bundle);
    const bundleHash = hashBundleBytes(bytes);
    const nonce = randomHex32();
    const expiresAt = Math.floor(Date.now() / 1000) + PIN_AUTH_TTL_SECONDS;
    const signature = await walletClient.signTypedData({
      account,
      ...pinTypedData({ wallet: self, bundleHash, nonce, expiresAt: BigInt(expiresAt) }),
    });
    const response = await fetch(`${baseUrl}/api/pin`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        bundle: bytesToBase64(bytes),
        auth: { wallet: self, nonce, expiresAt, signature },
      }),
    });
    const body = (await response.json().catch(() => null)) as { cid?: unknown } | null;
    if (!response.ok || typeof body?.cid !== "string") {
      throw new RecordError("The encrypted record could not be stored. Nothing was changed.");
    }
    return { bundleHash, cid: body.cid };
  }

  async function ownRecordKey(bundle: EncryptedBundle, keys: UnlockedKeys): Promise<Uint8Array> {
    const wrapped = bundle.wrappedKeys.find((entry) => sameAddress(entry.reader, self));
    if (!wrapped) throw new RecordError("You do not have access to this record.");
    return unwrapRecordKey(wrapped, bundle.recordId, keys.x25519SecretKey);
  }

  async function loadOwnRecord(recordId: Hex32) {
    const loaded = await loadBundle(recordId);
    if (!sameAddress(loaded.patient, self)) {
      throw new RecordError("Only the patient can change access to this record.");
    }
    return loaded;
  }

  /** A new reader changes the bundle. A returning reader who still has a key does not. */
  async function grantReader(
    keys: UnlockedKeys,
    recordId: Hex32,
    reader: Address,
    days: number,
    onPrompt?: WalletPromptHandler,
  ): Promise<bigint> {
    if (sameAddress(reader, self)) throw new RecordError("You already have this record.");
    const loaded = await loadOwnRecord(recordId);
    const readerWithKey = await readerKey(reader);
    let { bundleHash, cid }: { bundleHash: Hex32; cid: string } = loaded;
    const needsUpload = !loaded.bundle.wrappedKeys.some((entry) =>
      sameAddress(entry.reader, reader),
    );
    if (needsUpload) {
      const recordKey = await ownRecordKey(loaded.bundle, keys);
      const next = await addRecordReader(loaded.bundle, recordKey, readerWithKey);
      onPrompt?.(UPLOAD_PROMPT);
      ({ bundleHash, cid } = await pin(next));
    }
    const expiresAt = (await currentTime()) + BigInt(days * SECONDS_PER_DAY);
    const { request } = await contract.simulate.grantAccess(
      [recordId, reader, expiresAt, bundleHash, cid],
      { account },
    );
    onPrompt?.(needsUpload ? CHAIN_PROMPT : SINGLE_CHAIN_PROMPT);
    await confirmed(await walletClient.writeContract(request));
    return expiresAt;
  }

  /** Off-chain directory only. A failure offers no listed provider, so sharing fails closed. */
  async function listProviders(): Promise<Provider[]> {
    try {
      const response = await fetch(`${baseUrl}/api/providers`, { cache: "no-store" });
      if (!response.ok) return [];
      const body = (await response.json()) as { providers?: unknown };
      if (!Array.isArray(body.providers)) return [];
      const wallets = Object.fromEntries(
        (body.providers as { kind?: unknown; wallet?: unknown }[]).map((item) => [
          String(item?.kind),
          item?.wallet,
        ]),
      );
      return providersFromWallets(wallets);
    } catch {
      return [];
    }
  }

  /** A record's contents survive key rotation, so its details are safe to remember in memory. */
  async function ownRecordInfo(keys: UnlockedKeys, recordId: Hex32): Promise<RecordInfo> {
    const cached = recordInfoCache.get(recordId);
    if (cached) return cached;
    const { bundle } = await loadOwnRecord(recordId);
    let info: RecordInfo;
    try {
      const plaintext = await decryptRecord(bundle, self, keys.x25519SecretKey);
      if (isNameCardPayload(plaintext)) {
        decodeNameCard(plaintext);
        info = { sliceProfile: null, document: null, isProfile: false, isNameCard: true };
      } else if (isProfilePayload(plaintext)) {
        decodeProfile(plaintext);
        info = { sliceProfile: null, document: null, isProfile: true };
      } else if (isDocumentPayload(plaintext)) {
        const document = documentDetails(decodeDocument(plaintext));
        info = { sliceProfile: null, document, isProfile: false };
      } else {
        info = {
          sliceProfile: sliceProfileOf(JSON.parse(utf8Decode(plaintext))),
          document: null,
          isProfile: false,
          title: describeRecord(plaintext).find(({ kind }) => kind !== "Patient")?.description,
        };
      }
    } catch {
      throw new RecordError("This record could not be read.");
    }
    recordInfoCache.set(recordId, info);
    return info;
  }

  async function openRecord(
    keys: UnlockedKeys,
    recordId: Hex32,
    onPrompt?: WalletPromptHandler,
  ): Promise<OpenedRecord> {
    const [patient] = await contract.read.recordOf([recordId]);
    if (patient === zeroAddress) throw new RecordError("This record could not be found.");
    if (!sameAddress(patient, self)) {
      const { request } = await contract.simulate.logView([recordId], { account });
      onPrompt?.(VIEW_PROMPT);
      await confirmed(await walletClient.writeContract(request));
    }
    const { bundle } = await loadBundle(recordId);
    let plaintext: Uint8Array;
    try {
      plaintext = await decryptRecord(bundle, self, keys.x25519SecretKey);
    } catch {
      throw new RecordError("You do not have access to this version of the record.");
    }
    if (isProfilePayload(plaintext)) {
      let profile: PatientProfile;
      try {
        profile = decodeProfile(plaintext);
      } catch {
        throw new RecordError("This profile could not be read.");
      }
      return { kind: "profile", profile };
    }
    if (isDocumentPayload(plaintext)) {
      try {
        return { kind: "document", document: decodeDocument(plaintext) };
      } catch {
        throw new RecordError("This document could not be read.");
      }
    }
    return { kind: "record", items: describeRecord(plaintext) };
  }

  /**
   * A listed provider or an insurer-approved hospital, and never the insurer itself.
   * Fails closed: a failed chain check means this wallet is not offered anything.
   */
  async function providerOf(wallet: Address, providers: Provider[]): Promise<Provider | null> {
    if (sameAddress(wallet, self)) return null;
    try {
      if (await profileAccess?.walletIsInsurer(wallet)) return null;
      const listed = providers.find((item) => sameAddress(item.wallet, wallet));
      if (listed) return listed;
      return (await profileAccess?.hospitalIsApproved(wallet))
        ? { wallet, name: "Approved hospital", kind: "hospital" }
        : null;
    } catch {
      return null;
    }
  }

  async function canReadProfile(wallet: Address, providers: Provider[]): Promise<boolean> {
    return canShareProfile((await providerOf(wallet, providers))?.kind);
  }

  async function findProfile(
    keys: UnlockedKeys,
  ): Promise<{ recordId: Hex32; profile: PatientProfile } | null> {
    const anchors = await contract.getEvents.RecordAnchored({ patient: self }, { fromBlock: 0n });
    for (const { args } of anchors) {
      if (!args.recordId) continue;
      const info = await ownRecordInfo(keys, args.recordId).catch(() => null);
      if (!info?.isProfile) continue;
      const opened = await openRecord(keys, args.recordId);
      if (opened.kind === "profile") return { recordId: args.recordId, profile: opened.profile };
    }
    return null;
  }

  /** Hospitals, doctors, and responders. The insurer, labs, and pharmacies are never included. */
  async function nameCardReaders(): Promise<Address[]> {
    const logs = await contract.getEvents.KeysRegistered({}, { fromBlock: 0n });
    const wallets = [
      ...new Map(
        logs.flatMap(({ args: { wallet } }) =>
          wallet && !sameAddress(wallet, self) ? [[wallet.toLowerCase(), wallet] as const] : [],
        ),
      ).values(),
    ];
    const providers = await listProviders();
    const allowed = await Promise.all(
      wallets.map(async (wallet) => {
        if (await canReadProfile(wallet, providers)) return wallet;
        try {
          if (await profileAccess?.walletIsInsurer(wallet)) return null;
          return (await contract.read.isResponder([wallet])) ? wallet : null;
        } catch {
          return null;
        }
      }),
    );
    return allowed.filter((wallet) => wallet !== null);
  }

  /** The newest card this patient published, so a later card replaces an older one. */
  async function latestOwnNameCard(keys: UnlockedKeys): Promise<EncryptedBundle | null> {
    const anchors = await contract.getEvents.RecordAnchored({ patient: self }, { fromBlock: 0n });
    for (const { args } of [...anchors].reverse()) {
      if (!args.recordId) continue;
      const info = await ownRecordInfo(keys, args.recordId).catch(() => null);
      if (info?.isNameCard) return (await loadBundle(args.recordId)).bundle;
    }
    return null;
  }

  async function publishNameCard(
    keys: UnlockedKeys,
    fullName: string,
    onPrompt?: WalletPromptHandler,
  ): Promise<void> {
    const readers = await Promise.all((await nameCardReaders()).map(readerKey));
    const recordId = await anchorNewRecord(
      encodeNameCard(fullName),
      [{ address: self, x25519PublicKey: keys.x25519PublicKey }, ...readers],
      onPrompt,
    );
    recordInfoCache.set(recordId, {
      sliceProfile: null,
      document: null,
      isProfile: false,
      isNameCard: true,
    });
  }

  /**
   * Opens only records wrapped to this wallet with no grant. A granted medical record always
   * has an expiry, so it is never decrypted here and keeps its logged-view rule.
   */
  async function readNameCard(
    keys: UnlockedKeys,
    recordId: Hex32,
    patient: Address,
  ): Promise<{ patient: Address; name: string } | null> {
    if (sameAddress(patient, self)) return null;
    const loaded = await loadSmallBundle(recordId);
    if (!loaded) return null;
    const { bundle } = loaded;
    if (!bundle.wrappedKeys.some((entry) => sameAddress(entry.reader, self))) return null;
    if ((await contract.read.accessExpiry([recordId, self])) !== 0n) return null;
    try {
      const plaintext = await decryptRecord(bundle, self, keys.x25519SecretKey);
      return isNameCardPayload(plaintext) ? { patient, name: decodeNameCard(plaintext) } : null;
    } catch {
      return null;
    }
  }

  return {
    self,
    loadBundle,

    /** A new wallet has no gas on the local chain, so the host tops it up once. */
    async ensureFunded(): Promise<void> {
      if ((await publicClient.getBalance({ address: self })) > 0n) return;
      const response = await fetch(`${baseUrl}/api/faucet`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ wallet: self }),
      }).catch(() => null);
      if (!response?.ok) {
        throw new RecordError("Could not set up this new wallet on the Rado network.");
      }
    },

    async ensureRegistered(keys: UnlockedKeys, onPrompt?: WalletPromptHandler): Promise<void> {
      const [Ax, Ay, x25519PublicKey, registered] = await contract.read.keysOf([self]);
      const current =
        registered &&
        Ax.toString() === keys.eddsaPublicKey.Ax &&
        Ay.toString() === keys.eddsaPublicKey.Ay &&
        x25519PublicKey.toLowerCase() === bytesToHex(keys.x25519PublicKey).toLowerCase();
      if (current) return;
      const { request } = await contract.simulate.registerKeys(
        [
          BigInt(keys.eddsaPublicKey.Ax),
          BigInt(keys.eddsaPublicKey.Ay),
          bytesToHex(keys.x25519PublicKey),
        ],
        { account },
      );
      onPrompt?.(REGISTER_PROMPT);
      await confirmed(await walletClient.writeContract(request));
    },

    /** Encrypts in the browser, then pins, then anchors. The patient is always a reader. */
    async addRecord(
      keys: UnlockedKeys,
      plaintext: Uint8Array,
      onPrompt?: WalletPromptHandler,
    ): Promise<Hex32> {
      return anchorNewRecord(
        plaintext,
        [{ address: self, x25519PublicKey: keys.x25519PublicKey }],
        onPrompt,
      );
    },

    /** Wraps a standalone summary to escrow. New patients use their profile instead (D-067). */
    async addEmergencySummary(
      keys: UnlockedKeys,
      plaintext: Uint8Array,
      onPrompt?: WalletPromptHandler,
    ): Promise<Hex32> {
      const escrow = await escrowReader();
      return anchorNewRecord(
        plaintext,
        [{ address: self, x25519PublicKey: keys.x25519PublicKey }, escrow],
        onPrompt,
      );
    },

    async emergencySummaryIds(): Promise<Set<string>> {
      const records = await summaryRecords(self);
      return new Set(records.map(({ recordId }) => recordId));
    },

    /** One entry per patient, using that patient's newest summary. */
    async listEmergencyPatients(): Promise<EmergencySummaryRecord[]> {
      const latest = new Map<string, EmergencySummaryRecord>();
      for (const record of await summaryRecords()) {
        const key = record.patient.toLowerCase();
        if (!latest.has(key)) latest.set(key, record);
      }
      return [...latest.values()];
    },

    isResponder(): Promise<boolean> {
      return contract.read.isResponder([self]);
    },

    /** Logs the access on-chain first, then asks escrow for this responder's copy of the key. */
    async openEmergencySummary(
      keys: UnlockedKeys,
      { patient, recordId }: EmergencySummaryRecord,
      reason: BreakGlassReason,
      onPrompt?: WalletPromptHandler,
    ): Promise<EmergencySummaryItem[]> {
      let event = pendingBreakGlass.get(recordId);
      const totalSteps = event ? 1 : 4;
      let step = 0;
      const stepped: WalletPromptHandler = (text) => {
        step += 1;
        onPrompt?.(`Step ${step} of ${totalSteps}: ${text.replace(/^Step \d of \d: /, "")}`);
      };
      if (!event) {
        if (!(await contract.read.isResponder([self]))) {
          throw new RecordError(REVERT_MESSAGES.NotResponder);
        }
        let reasonPayload: Uint8Array;
        try {
          reasonPayload = encodeBreakGlassReason(reason);
        } catch (error) {
          if (error instanceof BreakGlassReasonError) throw new RecordError(error.message);
          throw new RecordError("Choose a reason for emergency access.");
        }
        // Readable only by this responder and the patient. The chain stores just its record ID.
        const reasonRecordId = await anchorNewRecord(
          reasonPayload,
          [{ address: self, x25519PublicKey: keys.x25519PublicKey }, await readerKey(patient)],
          stepped,
        );
        const { request } = await contract.simulate.invokeBreakGlass(
          [patient, recordId, reasonRecordId],
          { account },
        );
        stepped(BREAK_GLASS_PROMPT);
        const transactionHash = await walletClient.writeContract(request);
        const receipt = await publicClient.waitForTransactionReceipt({ hash: transactionHash });
        const [log] = parseEventLogs({ abi, logs: receipt.logs, eventName: "BreakGlassInvoked" });
        if (receipt.status !== "success" || !log) {
          throw new RecordError("The transaction failed. Nothing was changed.");
        }
        event = { transactionHash, logIndex: log.logIndex };
        pendingBreakGlass.set(recordId, event);
      }

      const expiresAt = Math.floor(Date.now() / 1000) + ESCROW_AUTH_TTL_SECONDS;
      stepped(RELEASE_PROMPT);
      const signature = await walletClient.signTypedData({
        account,
        ...escrowReleaseTypedData({
          wallet: self,
          recordId,
          ...event,
          expiresAt: BigInt(expiresAt),
        }),
      });
      const response = await fetch(`${baseUrl}/api/escrow/release`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ wallet: self, recordId, ...event, expiresAt, signature }),
      });
      const body = (await response.json().catch(() => null)) as {
        wrappedKey?: unknown;
        error?: unknown;
      } | null;
      if (!response.ok) {
        // These refusals are final for this event. Other failures can retry it.
        if (response.status === 403 || response.status === 409) {
          pendingBreakGlass.delete(recordId);
        }
        throw new RecordError(
          typeof body?.error === "string" ? body.error : "The emergency summary was not released.",
        );
      }
      pendingBreakGlass.delete(recordId);

      const { bundle } = await loadBundle(recordId);
      try {
        const released = parseBundle(
          encodeBundle({ ...bundle, wrappedKeys: [body?.wrappedKey as WrappedRecordKey] }),
        );
        return describeEmergencySummary(await decryptRecord(released, self, keys.x25519SecretKey));
      } catch (error) {
        if (error instanceof RecordError) throw error;
        throw new RecordError("This emergency summary could not be opened.");
      }
    },

    /** A document can go only to its category's provider types, checked before any popup. */
    async grant(
      keys: UnlockedKeys,
      recordId: Hex32,
      reader: Address,
      days: number,
      onPrompt?: WalletPromptHandler,
    ): Promise<bigint> {
      const { document, isProfile, isNameCard, sliceProfile } = await ownRecordInfo(keys, recordId);
      if (isNameCard) throw new RecordError("This item cannot be shared.");
      const kind = (await providerOf(reader, await listProviders()))?.kind;
      if (isProfile) {
        if (!canShareProfile(kind)) {
          throw new RecordError(
            "Your profile can be shared only with an approved hospital or doctor.",
          );
        }
      } else if (document) {
        if (!canShareDocument(document.category, kind)) {
          throw new RecordError(
            `A ${DOCUMENT_CATEGORIES[document.category].label.toLowerCase()} cannot be shared with this wallet.`,
          );
        }
      } else if (sliceProfile) {
        if (kind !== sliceProfile) {
          throw new RecordError(
            `This copy can be shared only with a ${SHARE_PROFILES[sliceProfile].label.toLowerCase()}.`,
          );
        }
      } else if (kind !== "hospital" && kind !== "doctor") {
        throw new RecordError(
          "A full record can be shared only with an approved hospital or doctor.",
        );
      }
      return grantReader(keys, recordId, reader, days, onPrompt);
    },

    listProviders,

    findProfile,

    /** Lowercased wallet to name, from the newest name card each patient sent this wallet. */
    async patientNames(keys: UnlockedKeys): Promise<Map<string, string>> {
      const anchors = await contract.getEvents.RecordAnchored({}, { fromBlock: 0n });
      await Promise.all(
        anchors.map(async ({ args: { recordId, patient } }) => {
          if (!recordId || !patient || nameCards.has(recordId)) return;
          // A failed load is not remembered, so it is tried again on the next refresh.
          const card = await readNameCard(keys, recordId, patient).catch(() => undefined);
          if (card !== undefined) nameCards.set(recordId, card);
        }),
      );
      const names = new Map<string, string>();
      for (const { args } of anchors) {
        const card = args.recordId ? nameCards.get(args.recordId) : null;
        if (card) names.set(card.patient.toLowerCase(), card.name);
      }
      return names;
    },

    /** How many eligible wallets cannot read this patient's name yet. */
    async nameCardGap(keys: UnlockedKeys): Promise<number> {
      const [readers, card] = await Promise.all([nameCardReaders(), latestOwnNameCard(keys)]);
      return readers.filter(
        (reader) => !card?.wrappedKeys.some((entry) => sameAddress(entry.reader, reader)),
      ).length;
    },

    /** Sends a new name card to every eligible wallet. */
    async shareName(keys: UnlockedKeys, onPrompt?: WalletPromptHandler): Promise<void> {
      const found = await findProfile(keys);
      if (!found) throw new RecordError("Save your profile first.");
      await publishNameCard(keys, found.profile.fullName, onPrompt);
    },

    /** The registered wallets a patient may share with. The insurer is never included. */
    async shareableProviders(wallets: Address[]): Promise<Provider[]> {
      const listed = await listProviders();
      const found = await Promise.all(wallets.map((wallet) => providerOf(wallet, listed)));
      return found.filter((provider) => provider !== null);
    },

    /** One encrypted profile per wallet. Only the patient holds a key until they share it. */
    async addProfile(
      keys: UnlockedKeys,
      input: PatientProfile,
      onPrompt?: WalletPromptHandler,
    ): Promise<Hex32> {
      let payload: Uint8Array;
      try {
        payload = encodeProfile(input);
      } catch (error) {
        if (error instanceof ProfileError) throw new RecordError(error.message);
        throw new RecordError("This profile could not be saved.");
      }
      if (await findProfile(keys)) throw new RecordError("You already have a profile.");
      // Wrapped to escrow, so the responder can reach it only through a logged break-glass.
      const escrow = await escrowReader();
      let step = 0;
      const stepped: WalletPromptHandler = (text) => {
        step += 1;
        onPrompt?.(`Step ${step} of 4: ${text.replace(/^Step \d of \d: /, "")}`);
      };
      const recordId = await anchorNewRecord(
        payload,
        [{ address: self, x25519PublicKey: keys.x25519PublicKey }, escrow],
        stepped,
      );
      recordInfoCache.set(recordId, { sliceProfile: null, document: null, isProfile: true });
      try {
        await publishNameCard(keys, decodeProfile(payload).fullName, stepped);
      } catch {
        throw new RecordError(
          "Your profile was saved, but your name was not shared. Use Share my name to finish.",
        );
      }
      return recordId;
    },

    /**
     * Copies only this provider's fields into a new record with its own key, then grants it.
     * The source record and its key are never shared.
     */
    async shareSlice(
      keys: UnlockedKeys,
      sourceId: Hex32,
      reader: Address,
      profile: SliceProfile,
      days: number,
      onPrompt?: WalletPromptHandler,
    ): Promise<{ recordId: Hex32; expiresAt: bigint }> {
      if (sameAddress(reader, self)) throw new RecordError("You already have this record.");
      await readerKey(reader);
      if ((await providerOf(reader, await listProviders()))?.kind !== profile) {
        throw new RecordError(
          `This copy can be shared only with a ${SHARE_PROFILES[profile].label.toLowerCase()}.`,
        );
      }
      const loaded = await loadOwnRecord(sourceId);
      let source: unknown;
      try {
        const plaintext = await decryptRecord(loaded.bundle, self, keys.x25519SecretKey);
        if (isProfilePayload(plaintext)) {
          throw new RecordError("Your profile can be shared only with a hospital or doctor.");
        }
        if (isDocumentPayload(plaintext)) {
          throw new RecordError("A document is shared whole and cannot be split into a copy.");
        }
        source = JSON.parse(utf8Decode(plaintext));
      } catch (error) {
        if (error instanceof RecordError) throw error;
        throw new RecordError("This record could not be read.");
      }
      if (sliceProfileOf(source)) throw new RecordError("This record is already a limited copy.");
      let slice: ReturnType<typeof buildRecordSlice>;
      try {
        slice = buildRecordSlice(source, profile);
      } catch {
        throw new RecordError("This record could not be read.");
      }
      if (!slice) {
        throw new RecordError(
          `This record has nothing to share with a ${SHARE_PROFILES[profile].label.toLowerCase()}.`,
        );
      }

      let step = 0;
      const stepped: WalletPromptHandler = (text) => {
        step += 1;
        onPrompt?.(`Step ${step} of 4: ${text.replace(/^Step \d of \d: /, "")}`);
      };
      const recordId = await anchorNewRecord(
        utf8Encode(JSON.stringify(slice)),
        [{ address: self, x25519PublicKey: keys.x25519PublicKey }],
        stepped,
      );
      recordInfoCache.set(recordId, { sliceProfile: profile, document: null, isProfile: false });
      try {
        const expiresAt = await grantReader(keys, recordId, reader, days, stepped);
        return { recordId, expiresAt };
      } catch {
        throw new RecordError(
          "The limited copy was created but not shared. Use Grant access on it to finish.",
        );
      }
    },

    /** Saves a typed entry as FHIR, so limited lab and pharmacy copies keep working. */
    async addPatientEntry(
      keys: UnlockedKeys,
      input: PatientEntryInput,
      onPrompt?: WalletPromptHandler,
    ): Promise<Hex32> {
      const found = await findProfile(keys);
      if (!found) throw new RecordError("Save your profile first.");
      let entry: ReturnType<typeof buildPatientEntry>;
      try {
        entry = buildPatientEntry(input, found.profile);
      } catch (error) {
        if (error instanceof PatientEntryError) throw new RecordError(error.message);
        throw new RecordError("This record could not be saved.");
      }
      return anchorNewRecord(
        utf8Encode(JSON.stringify(entry)),
        [{ address: self, x25519PublicKey: keys.x25519PublicKey }],
        onPrompt,
      );
    },

    /** Timeline entry ID to the responder's reason, readable only by this patient. */
    async breakGlassReasons(keys: UnlockedKeys): Promise<Map<string, string>> {
      const logs = await contract.getEvents.BreakGlassInvoked({ patient: self }, { fromBlock: 0n });
      await Promise.all(
        logs.map(async (log) => {
          const id = `${log.transactionHash}-${log.logIndex}`;
          const { reasonRecordId, responder } = log.args;
          if (breakGlassReasonCache.has(id) || !reasonRecordId || !responder) return;
          try {
            const { patient: owner, bundle } = await loadBundle(reasonRecordId);
            if (!sameAddress(owner, responder)) return;
            const plaintext = await decryptRecord(bundle, self, keys.x25519SecretKey);
            breakGlassReasonCache.set(id, breakGlassReasonText(decodeBreakGlassReason(plaintext)));
          } catch {
            // Left out, so the timeline says the reason is unavailable and tries again.
          }
        }),
      );
      return new Map(breakGlassReasonCache);
    },

    /** Encrypts the file, its name, type, and category together, then pins and anchors them. */
    async addDocument(
      keys: UnlockedKeys,
      input: { name: string; category: DocumentCategory; bytes: Uint8Array },
      onPrompt?: WalletPromptHandler,
    ): Promise<Hex32> {
      let payload: Uint8Array;
      try {
        payload = encodeDocument(input);
      } catch (error) {
        if (error instanceof DocumentError) throw new RecordError(error.message);
        throw new RecordError("This file could not be read.");
      }
      const details = documentDetails(decodeDocument(payload));
      const recordId = await anchorNewRecord(
        payload,
        [{ address: self, x25519PublicKey: keys.x25519PublicKey }],
        onPrompt,
      );
      recordInfoCache.set(recordId, { sliceProfile: null, document: details, isProfile: false });
      return recordId;
    },

    /** Decrypts only this patient's own records. A record that fails is left out and retried. */
    async recordInfos(keys: UnlockedKeys, recordIds: Hex32[]): Promise<Map<string, RecordInfo>> {
      await Promise.all(
        recordIds.map((recordId) => ownRecordInfo(keys, recordId).catch(() => null)),
      );
      return new Map(recordInfoCache);
    },

    async sliceProfiles(
      keys: UnlockedKeys,
      recordIds: Hex32[],
    ): Promise<Map<string, SliceProfile | null>> {
      await Promise.all(
        recordIds.map((recordId) => ownRecordInfo(keys, recordId).catch(() => null)),
      );
      return new Map(
        [...recordInfoCache].map(([recordId, info]) => [recordId, info.sliceProfile] as const),
      );
    },

    /** New key, re-encrypt, re-wrap for active readers, pin, then one transaction (D-031). */
    async revoke(
      keys: UnlockedKeys,
      recordId: Hex32,
      reader: Address,
      onPrompt?: WalletPromptHandler,
    ): Promise<void> {
      const loaded = await loadOwnRecord(recordId);
      if ((await contract.read.accessExpiry([recordId, reader])) === 0n) {
        throw new RecordError("This wallet does not have access to revoke.");
      }
      const now = await currentTime();
      const remaining: RecordReader[] = [];
      for (const { reader: address } of loaded.bundle.wrappedKeys) {
        if (sameAddress(address, reader)) continue;
        if (sameAddress(address, self)) {
          remaining.push({ address, x25519PublicKey: keys.x25519PublicKey });
          continue;
        }
        const expiry = await contract.read.accessExpiry([recordId, address]);
        // A reader whose grant has ended gets no copy of the new key.
        if (expiry > now) {
          remaining.push(await readerKey(address));
        } else if (expiry === 0n) {
          // Only escrow is in a bundle without ever having a grant. Keep its emergency copy.
          const escrow = await escrowReader();
          if (sameAddress(address, escrow.address)) remaining.push(escrow);
        }
      }
      const recordKey = await ownRecordKey(loaded.bundle, keys);
      const { bundle } = await rotateRecordKey({
        bundle: loaded.bundle,
        recordKey,
        remainingReaders: remaining,
      });
      onPrompt?.(UPLOAD_PROMPT);
      const { bundleHash, cid } = await pin(bundle);
      const { request } = await contract.simulate.revokeAndRotate(
        [recordId, reader, bundleHash, cid],
        { account },
      );
      onPrompt?.(CHAIN_PROMPT);
      await confirmed(await walletClient.writeContract(request));
    },

    /** A reader's view is logged on-chain and confirmed before anything is decrypted. */
    openRecord,

    async open(
      keys: UnlockedKeys,
      recordId: Hex32,
      onPrompt?: WalletPromptHandler,
    ): Promise<RecordItem[]> {
      const opened = await openRecord(keys, recordId, onPrompt);
      if (opened.kind === "document") {
        throw new RecordError("This document must be opened in the document viewer.");
      }
      if (opened.kind === "profile") {
        throw new RecordError("This profile must be opened in the profile view.");
      }
      return opened.items;
    },

    async listRegisteredWallets(): Promise<Address[]> {
      const logs = await contract.getEvents.KeysRegistered({}, { fromBlock: 0n });
      const wallets = new Map<string, Address>();
      for (const log of logs) {
        const wallet = log.args.wallet;
        if (wallet && !sameAddress(wallet, self)) wallets.set(wallet.toLowerCase(), wallet);
      }
      return [...wallets.values()];
    },

    async listPatientRecords(): Promise<PatientRecord[]> {
      const now = await currentTime();
      const anchors = await contract.getEvents.RecordAnchored({ patient: self }, { fromBlock: 0n });
      const records = await Promise.all(
        anchors.flatMap(({ args: { recordId } }) => {
          if (!recordId) return [];
          return [
            (async (): Promise<PatientRecord> => {
              const [, , , keyVersion] = await contract.read.recordOf([recordId]);
              const logs = await contract.getEvents.AccessGranted(
                { recordId, patient: self },
                { fromBlock: 0n },
              );
              const readers = new Map<string, Address>();
              for (const { args } of logs) {
                if (args.reader) readers.set(args.reader.toLowerCase(), args.reader);
              }
              const grants = await Promise.all(
                [...readers.values()].map(async (reader) => {
                  const expiresAt = await contract.read.accessExpiry([recordId, reader]);
                  return { reader, expiresAt, status: statusOf(expiresAt, now) };
                }),
              );
              return { recordId, keyVersion, grants };
            })(),
          ];
        }),
      );
      return records.reverse();
    },

    async listSharedRecords(): Promise<SharedRecord[]> {
      const now = await currentTime();
      const logs = await contract.getEvents.AccessGranted({ reader: self }, { fromBlock: 0n });
      const shared = new Map<string, { recordId: Hex32; patient: Address }>();
      for (const { args } of logs) {
        if (args.recordId && args.patient) {
          shared.set(args.recordId, { recordId: args.recordId, patient: args.patient });
        }
      }
      const records = await Promise.all(
        [...shared.values()].map(async ({ recordId, patient }) => {
          const expiresAt = await contract.read.accessExpiry([recordId, self]);
          return { recordId, patient, expiresAt, status: statusOf(expiresAt, now) };
        }),
      );
      return records.reverse();
    },

    /** Built only from chain events, so it holds no record titles or resource types. */
    async timeline(patient: Address = self): Promise<TimelineEntry[]> {
      const options = { fromBlock: 0n } as const;
      const [anchored, granted, revoked, rotated, viewed, emergency] = await Promise.all([
        contract.getEvents.RecordAnchored({ patient }, options),
        contract.getEvents.AccessGranted({ patient }, options),
        contract.getEvents.AccessRevoked({ patient }, options),
        contract.getEvents.RecordKeyRotated({ patient }, options),
        contract.getEvents.RecordViewed({ patient }, options),
        contract.getEvents.BreakGlassInvoked({ patient }, options),
      ]);
      const pending = [
        ...anchored.map((log) => ({ log, title: "Record added", actor: log.args.patient })),
        ...granted.map((log) => ({ log, title: "Access granted", actor: log.args.reader })),
        ...revoked.map((log) => ({ log, title: "Access revoked", actor: log.args.reader })),
        ...rotated.map((log) => ({ log, title: "Record key rotated", actor: log.args.patient })),
        ...viewed.map((log) => ({ log, title: "Record viewed", actor: log.args.reader })),
        ...emergency.map((log) => ({
          log,
          title: "Emergency access used",
          actor: log.args.responder,
        })),
      ];
      const blockNumbers = [...new Set(pending.map(({ log }) => log.blockNumber))];
      const times = new Map(
        await Promise.all(
          blockNumbers.map(
            async (blockNumber) =>
              [blockNumber, (await publicClient.getBlock({ blockNumber })).timestamp] as const,
          ),
        ),
      );
      return pending
        .map(({ log, title, actor }) => ({
          id: `${log.transactionHash}-${log.logIndex}`,
          title,
          recordId: log.args.recordId as Hex32,
          actor: actor ?? null,
          timestamp: times.get(log.blockNumber) ?? 0n,
          blockNumber: log.blockNumber,
          logIndex: log.logIndex,
        }))
        .sort((a, b) =>
          a.blockNumber === b.blockNumber
            ? b.logIndex - a.logIndex
            : a.blockNumber > b.blockNumber
              ? -1
              : 1,
        );
    },
  };
}

export type RecordService = ReturnType<typeof createRecordService>;
