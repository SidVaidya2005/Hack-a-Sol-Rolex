import {
  addRecordReader,
  bytesToBase64,
  decryptRecord,
  encodeBundle,
  encryptRecord,
  hashBundleBytes,
  parseBundle,
  recordAccessAbi,
  rotateRecordKey,
  unwrapRecordKey,
  utf8Decode,
} from "@rado/shared";
import type { Address, EncryptedBundle, Hex32, RecordReader, UnlockedKeys } from "@rado/shared";
import {
  BaseError,
  bytesToHex,
  ContractFunctionRevertedError,
  getContract,
  hexToBytes,
  parseAbi,
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

import { pinTypedData } from "./pin-auth.ts";

const abi = parseAbi(recordAccessAbi);
const PIN_AUTH_TTL_SECONDS = 180;
const SECONDS_PER_DAY = 86_400;

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

export interface RecordServiceConfig {
  publicClient: PublicClient;
  walletClient: WalletClient<Transport, Chain, RecordAccount>;
  recordAccess: Address;
  /** Empty in the browser, where routes share the page's origin. */
  baseUrl?: string;
}

/** Called just before each wallet popup, so the screen can say what the popup is for. */
export type WalletPromptHandler = (text: string) => void;

const UPLOAD_PROMPT = "Step 1 of 2: approve the encrypted upload in your wallet.";
const CHAIN_PROMPT = "Step 2 of 2: confirm the on-chain update in your wallet.";
const SINGLE_CHAIN_PROMPT = "Confirm the on-chain update in your wallet.";
const VIEW_PROMPT = "Confirm the on-chain view log in your wallet.";
const REGISTER_PROMPT = "Approve registering your public keys in your wallet.";

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
  KeysNotRegistered: "That wallet has not unlocked Rado yet.",
  NotInsurer: "Only the insurer wallet can do this.",
  NotRecordPatient: "Only the patient can change access to this record.",
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
          ? "Patient profile"
          : (textOf(resource.code) ??
            textOf(resource.medicationCodeableConcept) ??
            "Health record item"),
    };
  });
}

export function createRecordService({
  publicClient,
  walletClient,
  recordAccess,
  baseUrl = "",
}: RecordServiceConfig) {
  const contract = getContract({
    address: recordAccess,
    abi,
    client: { public: publicClient, wallet: walletClient },
  });
  // viem cannot infer simulate types for an account union. The real object is passed unchanged.
  const account = walletClient.account as JsonRpcAccount;
  const self = account.address;

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
    if (!registered) throw new RecordError("That wallet has not unlocked Rado yet.");
    return { address, x25519PublicKey: hexToBytes(x25519PublicKey) };
  }

  /** Re-checks the server's bytes against the chain instead of trusting the route. */
  async function loadBundle(recordId: Hex32) {
    const [patient, bundleHash, cid, keyVersion] = await contract.read.recordOf([recordId]);
    if (patient === zeroAddress) throw new RecordError("This record could not be found.");
    const response = await fetch(`${baseUrl}/api/records/${cid}`, { cache: "no-store" });
    if (!response.ok) throw new RecordError("The encrypted record could not be loaded.");
    const bytes = new Uint8Array(await response.arrayBuffer());
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
    return { patient, bundle, bundleHash, cid, keyVersion };
  }

  async function pin(bundle: EncryptedBundle): Promise<{ bundleHash: Hex32; cid: string }> {
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

  return {
    self,
    loadBundle,

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
      const recordId = randomHex32();
      const { bundle } = await encryptRecord({
        recordId,
        plaintext,
        readers: [{ address: self, x25519PublicKey: keys.x25519PublicKey }],
      });
      onPrompt?.(UPLOAD_PROMPT);
      const { bundleHash, cid } = await pin(bundle);
      const { request } = await contract.simulate.anchorRecord([recordId, bundleHash, cid], {
        account,
      });
      onPrompt?.(CHAIN_PROMPT);
      await confirmed(await walletClient.writeContract(request));
      return recordId;
    },

    /** A new reader changes the bundle. A returning reader who still has a key does not. */
    async grant(
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
        // A reader whose grant has ended gets no copy of the new key.
        if ((await contract.read.accessExpiry([recordId, address])) > now) {
          remaining.push(await readerKey(address));
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
    async open(
      keys: UnlockedKeys,
      recordId: Hex32,
      onPrompt?: WalletPromptHandler,
    ): Promise<RecordItem[]> {
      const [patient] = await contract.read.recordOf([recordId]);
      if (patient === zeroAddress) throw new RecordError("This record could not be found.");
      if (!sameAddress(patient, self)) {
        const { request } = await contract.simulate.logView([recordId], { account });
        onPrompt?.(VIEW_PROMPT);
        await confirmed(await walletClient.writeContract(request));
      }
      const { bundle } = await loadBundle(recordId);
      try {
        return describeRecord(await decryptRecord(bundle, self, keys.x25519SecretKey));
      } catch (error) {
        if (error instanceof RecordError) throw error;
        throw new RecordError("You do not have access to this version of the record.");
      }
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
        ...granted.map((log) => ({ log, title: "Doctor access granted", actor: log.args.reader })),
        ...revoked.map((log) => ({ log, title: "Doctor access revoked", actor: log.args.reader })),
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
