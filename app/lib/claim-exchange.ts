import {
  BN254_FIELD_PRIME,
  checkInboxMessage,
  claimHashInputs,
  claimSettlementAbi,
  COVERED_TREE_DEPTH,
  coveredLeafInputs,
  declineHashInputs,
  decryptInboxMessage,
  eddsaSign,
  EMPTY_LEAF,
  encryptInboxMessage,
  HOSPITAL_TREE_DEPTH,
  hospitalLeafInputs,
  inboxCiphertextHash,
  merkleNodeInputs,
  nullifierInputs,
  parseInboxEnvelope,
  policyCommitmentInputs,
  poseidonHash,
  recordAccessAbi,
  requestHashInputs,
  SAMPLE_POLICY,
  SAMPLE_PROCEDURES,
  SECONDS_PER_DAY,
  signInboxRequest,
} from "@rado/shared";
import type {
  Address,
  ApprovedPolicyTerms,
  ClaimApprovalBody,
  ClaimCircuitInput,
  ClaimRequestBody,
  EddsaPublicKey,
  Hex32,
  InboxEnvelope,
  InboxPlaintext,
  MerklePath,
  PolicyTerms,
  UnlockedKeys,
} from "@rado/shared";
import {
  bytesToHex,
  concat,
  hexToBigInt,
  hexToBytes,
  keccak256,
  parseAbi,
  stringToHex,
} from "viem";
import type { Chain, JsonRpcAccount, PublicClient, Transport, WalletClient } from "viem";

import { RecordError, type RecordAccount } from "./record-service.ts";

const settlementAbi = parseAbi(claimSettlementAbi);
const accessAbi = parseAbi(recordAccessAbi);
const POLICY_SALT_TAG = "rado/policy-salt/v1";
const SEND_ATTEMPTS = 3;

export interface ClaimExchangeConfig {
  publicClient: PublicClient;
  walletClient: WalletClient<Transport, Chain, RecordAccount>;
  recordAccess: Address;
  claimSettlement: Address;
  keys: UnlockedKeys;
  /** Empty in the browser, where routes share the page's origin. */
  baseUrl?: string;
}

/** Every message here has already passed its sender check (Invariant 22). */
export type ExchangeEvent =
  | { kind: "terms"; messageId: string; from: Address; terms: PolicyTerms; commitment: bigint }
  | { kind: "request"; messageId: string; hospital: Address; body: ClaimRequestBody }
  | { kind: "approval"; messageId: string; patient: Address; body: ClaimApprovalBody }
  | { kind: "decline"; messageId: string; patient: Address; encounterId: string }
  | { kind: "rejected"; messageId: string; reason: string };

function sameAddress(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase();
}

function randomField(): bigint {
  return hexToBigInt(bytesToHex(crypto.getRandomValues(new Uint8Array(32)))) % BN254_FIELD_PRIME;
}

/** Builds a tree with the same node and empty-leaf rules as the circuit. */
async function merkleTree(leaves: bigint[], depth: number) {
  if (leaves.length > 2 ** depth) throw new RecordError("This list is full.");
  const levels: bigint[][] = [[...leaves]];
  const empties: bigint[] = [EMPTY_LEAF];
  for (let height = 0; height < depth; height += 1) {
    const current = levels[height] as bigint[];
    const empty = empties[height] as bigint;
    const next: bigint[] = [];
    for (let index = 0; index < current.length; index += 2) {
      next.push(
        await poseidonHash(merkleNodeInputs(current[index] as bigint, current[index + 1] ?? empty)),
      );
    }
    levels.push(next);
    empties.push(await poseidonHash(merkleNodeInputs(empty, empty)));
  }
  return {
    root: levels[depth]?.[0] ?? (empties[depth] as bigint),
    path(leafIndex: number): MerklePath {
      const pathElements: string[] = [];
      const pathIndices: (0 | 1)[] = [];
      let index = leafIndex;
      for (let height = 0; height < depth; height += 1) {
        const bit = (index % 2) as 0 | 1;
        const sibling = levels[height]?.[bit === 0 ? index + 1 : index - 1];
        pathElements.push((sibling ?? (empties[height] as bigint)).toString());
        pathIndices.push(bit);
        index = Math.floor(index / 2);
      }
      return { pathElements, pathIndices };
    },
  };
}

function coveredLeaves(terms: { coveredProcedures: string[]; policySalt: string }) {
  const salt = BigInt(terms.policySalt);
  return Promise.all(
    terms.coveredProcedures.map((code) => poseidonHash(coveredLeafInputs(BigInt(code), salt))),
  );
}

export function policyCommitmentOf(terms: ApprovedPolicyTerms): Promise<bigint> {
  return poseidonHash(
    policyCommitmentInputs({
      patientAx: BigInt(terms.patientAx),
      patientAy: BigInt(terms.patientAy),
      expiryDay: BigInt(terms.expiryDay),
      perClaimLimit: BigInt(terms.perClaimLimit),
      coveredRoot: BigInt(terms.coveredRoot),
      policySalt: BigInt(terms.policySalt),
    }),
  );
}

/**
 * Rebuilds a patient's private terms from the insurer's unlocked key, so a resend works
 * after a refresh with nothing stored (D-049). Each patient has one demo policy.
 */
export async function derivePolicyTerms(
  insurerSeed: Uint8Array,
  patient: Address,
  patientKey: EddsaPublicKey,
): Promise<PolicyTerms> {
  const digest = keccak256(
    concat([stringToHex(POLICY_SALT_TAG), bytesToHex(insurerSeed), patient.toLowerCase() as Hex32]),
  );
  const policySalt = (hexToBigInt(digest) % BN254_FIELD_PRIME).toString();
  const coveredProcedures = SAMPLE_PROCEDURES.map(({ code }) => code.toString());
  const tree = await merkleTree(
    await coveredLeaves({ coveredProcedures, policySalt }),
    COVERED_TREE_DEPTH,
  );
  return {
    patientAx: patientKey.Ax,
    patientAy: patientKey.Ay,
    expiryDay: SAMPLE_POLICY.expiryDay.toString(),
    perClaimLimit: SAMPLE_POLICY.perClaimLimit.toString(),
    coveredRoot: tree.root.toString(),
    policySalt,
    coveredProcedures,
  };
}

/** The patient's own check, because only the patient holds the full terms (D-045). */
export function claimProblem(body: ClaimRequestBody, terms: PolicyTerms): string | null {
  if (!terms.coveredProcedures.some((code) => BigInt(code) === BigInt(body.procedureCode))) {
    return "This procedure is not covered by your policy.";
  }
  if (BigInt(body.claimAmount) > BigInt(terms.perClaimLimit)) {
    return "This amount is above your per-claim limit.";
  }
  if (BigInt(body.claimDay) >= BigInt(terms.expiryDay)) {
    return "Your policy has expired for this claim day.";
  }
  return null;
}

export function createClaimExchange({
  publicClient,
  walletClient,
  recordAccess,
  claimSettlement,
  keys,
  baseUrl = "",
}: ClaimExchangeConfig) {
  // viem cannot infer simulate types for an account union. The real object is passed unchanged.
  const account = walletClient.account as JsonRpcAccount;
  const self = account.address;
  /** The hospital's own requests. Held in browser memory only (Invariant 6). */
  const requests = new Map<
    string,
    { body: ClaimRequestBody; patient: Address; declined?: boolean }
  >();
  const handled = new Set<string>();
  const unreadable = new Set<string>();
  let polling = false;

  async function confirmed(hash: Hex32): Promise<void> {
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    if (receipt.status !== "success") {
      throw new RecordError("The transaction failed. Nothing was changed.");
    }
  }

  async function registeredKey(wallet: Address) {
    const [Ax, Ay, x25519PublicKey, registered] = await publicClient.readContract({
      address: recordAccess,
      abi: accessAbi,
      functionName: "keysOf",
      args: [wallet],
    });
    if (!registered) return null;
    return { eddsa: { Ax: Ax.toString(), Ay: Ay.toString() }, x25519PublicKey };
  }

  const hospitalRoot = () =>
    publicClient.readContract({
      address: claimSettlement,
      abi: settlementAbi,
      functionName: "hospitalRoot",
    });

  async function isRegisteredPolicy(commitment: bigint): Promise<boolean> {
    const [, , , registered] = await publicClient.readContract({
      address: claimSettlement,
      abi: settlementAbi,
      functionName: "policyOf",
      args: [commitment],
    });
    return registered;
  }

  /** Rebuilds the approved list from the latest on-chain event (D-027). */
  async function approvedLeaves(): Promise<bigint[]> {
    const logs = await publicClient.getContractEvents({
      address: claimSettlement,
      abi: settlementAbi,
      eventName: "HospitalRootUpdated",
      fromBlock: 0n,
    });
    const latest = logs.at(-1);
    if (!latest) return [];
    const leaves = [...(latest.args.leaves ?? [])];
    const { root } = await merkleTree(leaves, HOSPITAL_TREE_DEPTH);
    if (root !== (await hospitalRoot())) {
      throw new RecordError("The approved hospital list does not match the chain.");
    }
    return leaves;
  }

  async function leafOf(key: EddsaPublicKey): Promise<bigint> {
    return poseidonHash(hospitalLeafInputs(BigInt(key.Ax), BigInt(key.Ay)));
  }

  /** Retries reuse the same message ID, so the server cannot store a duplicate. */
  async function deliver(envelope: InboxEnvelope): Promise<void> {
    for (let attempt = 0; attempt < SEND_ATTEMPTS; attempt += 1) {
      const auth = await signInboxRequest({
        action: "send",
        wallet: self,
        eddsaSeed: keys.eddsaSeed,
        ciphertextHash: inboxCiphertextHash(envelope.ciphertext),
      });
      let status = 0;
      try {
        const response = await fetch(`${baseUrl}/api/inbox`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ envelope, auth }),
        });
        status = response.status;
        if (response.ok) return;
      } catch {
        status = 0;
      }
      if (status === 429) throw new RecordError("That inbox is full. Try again later.");
      if (status >= 400 && status < 500) {
        throw new RecordError("The encrypted message was refused.");
      }
    }
    throw new RecordError("The encrypted message could not be delivered. Try again.");
  }

  async function send(recipient: Address, plaintext: InboxPlaintext): Promise<void> {
    const key = await registeredKey(recipient);
    if (!key) throw new RecordError("That wallet has not unlocked Rado yet.");
    const envelope = await encryptInboxMessage({
      sender: self,
      recipient,
      recipientX25519PublicKey: hexToBytes(key.x25519PublicKey),
      plaintext,
    });
    await deliver(envelope);
  }

  async function authedPost(path: string, action: "list" | "ack", extra = {}) {
    const auth = await signInboxRequest({ action, wallet: self, eddsaSeed: keys.eddsaSeed });
    return fetch(`${baseUrl}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ auth, ...extra }),
      cache: "no-store",
    });
  }

  async function checkEnvelope(envelope: InboxEnvelope): Promise<ExchangeEvent> {
    const { messageId, sender } = envelope;
    const message = await decryptInboxMessage(envelope, keys.x25519SecretKey);
    const senderKey = await registeredKey(sender);
    const result = await checkInboxMessage(message, {
      recipientEddsaKey: keys.eddsaPublicKey,
      senderEddsaKey: senderKey?.eddsa ?? null,
      hospitalRoot: await hospitalRoot(),
      isRegisteredPolicy,
      findClaimRequest: (encounterId) => requests.get(encounterId.toString())?.body ?? null,
    });
    if (!result.ok) return { kind: "rejected", messageId, reason: result.reason };
    switch (message.type) {
      case "policy-terms":
        return {
          kind: "terms",
          messageId,
          from: sender,
          terms: message.body,
          commitment: await policyCommitmentOf(message.body),
        };
      case "claim-request":
        if (!sameAddress(message.body.payoutAddress, sender)) {
          return {
            kind: "rejected",
            messageId,
            reason: "This claim request pays a different wallet from the hospital that sent it.",
          };
        }
        return { kind: "request", messageId, hospital: sender, body: message.body };
      case "claim-approval": {
        const pending = requests.get(BigInt(message.body.encounterId).toString());
        if (!pending || !sameAddress(pending.patient, sender)) {
          return {
            kind: "rejected",
            messageId,
            reason: "This approval did not come from the patient you asked.",
          };
        }
        if (pending.declined) {
          return {
            kind: "rejected",
            messageId,
            reason: "The patient already declined this claim.",
          };
        }
        return { kind: "approval", messageId, patient: sender, body: message.body };
      }
      case "claim-decline": {
        const encounterId = BigInt(message.body.encounterId).toString();
        const pending = requests.get(encounterId);
        if (!pending || !sameAddress(pending.patient, sender)) {
          return {
            kind: "rejected",
            messageId,
            reason: "This decline did not come from the patient you asked.",
          };
        }
        pending.declined = true;
        return { kind: "decline", messageId, patient: sender, encounterId };
      }
    }
  }

  return {
    self,

    async hospitalIsApproved(wallet: Address): Promise<boolean> {
      const key = await registeredKey(wallet);
      if (!key) return false;
      return (await approvedLeaves()).includes(await leafOf(key.eddsa));
    },

    /** Insurer only. Emits the full approved list so hospitals can rebuild their path. */
    async approveHospital(wallet: Address): Promise<boolean> {
      const key = await registeredKey(wallet);
      if (!key) throw new RecordError("That wallet has not unlocked Rado yet.");
      const leaf = await leafOf(key.eddsa);
      const leaves = await approvedLeaves();
      if (leaves.includes(leaf)) return false;
      const next = [...leaves, leaf];
      const { root } = await merkleTree(next, HOSPITAL_TREE_DEPTH);
      const { request } = await publicClient.simulateContract({
        address: claimSettlement,
        abi: settlementAbi,
        functionName: "updateHospitalRoot",
        args: [root, next],
        account,
      });
      await confirmed(await walletClient.writeContract(request));
      return true;
    },

    /** Insurer only. Registers once, then every call delivers the same terms again. */
    async issuePolicy(patient: Address): Promise<{ newlyRegistered: boolean }> {
      const key = await registeredKey(patient);
      if (!key) throw new RecordError("That wallet has not unlocked Rado yet.");
      const terms = await derivePolicyTerms(keys.eddsaSeed, patient, key.eddsa);
      const commitment = await policyCommitmentOf(terms);
      const newlyRegistered = !(await isRegisteredPolicy(commitment));
      if (newlyRegistered) {
        const { request } = await publicClient.simulateContract({
          address: claimSettlement,
          abi: settlementAbi,
          functionName: "registerPolicy",
          args: [commitment, SAMPLE_POLICY.totalCap],
          account,
        });
        await confirmed(await walletClient.writeContract(request));
      }
      await send(patient, { type: "policy-terms", body: terms });
      return { newlyRegistered };
    },

    /** Hospital. Takes the claim day from the latest block (D-033). */
    async requestClaim(input: {
      patient: Address;
      procedureCode: bigint;
      claimAmount: bigint;
    }): Promise<ClaimRequestBody> {
      const leaf = await leafOf(keys.eddsaPublicKey);
      const leaves = await approvedLeaves();
      const index = leaves.indexOf(leaf);
      if (index < 0) throw new RecordError("The insurer has not approved this hospital yet.");
      const { path } = await merkleTree(leaves, HOSPITAL_TREE_DEPTH).then((tree) => ({
        path: tree.path(index),
      }));
      const block = await publicClient.getBlock();
      const claimDay = block.timestamp / BigInt(SECONDS_PER_DAY);
      const encounterId = randomField();
      const fields = {
        encounterId,
        procedureCode: input.procedureCode,
        claimAmount: input.claimAmount,
        claimDay,
        payoutAddress: BigInt(self),
      };
      const hospitalSignature = await eddsaSign(
        keys.eddsaSeed,
        await poseidonHash(requestHashInputs(fields)),
      );
      const body: ClaimRequestBody = {
        encounterId: encounterId.toString(),
        procedureCode: input.procedureCode.toString(),
        claimAmount: input.claimAmount.toString(),
        claimDay: claimDay.toString(),
        payoutAddress: self.toLowerCase() as Address,
        hospitalPublicKey: keys.eddsaPublicKey,
        hospitalPath: path,
        hospitalSignature,
      };
      requests.set(body.encounterId, { body, patient: input.patient });
      await send(input.patient, { type: "claim-request", body });
      return body;
    },

    async resendRequest(encounterId: string): Promise<void> {
      const pending = requests.get(encounterId);
      if (!pending) throw new RecordError("This claim request is no longer available.");
      if (pending.declined) throw new RecordError("The patient already declined this claim.");
      await send(pending.patient, { type: "claim-request", body: pending.body });
    },

    /** Patient. Sends one covered-procedure path, never the coverage list (D-032). */
    async approveClaim(
      body: ClaimRequestBody,
      hospital: Address,
      terms: PolicyTerms,
    ): Promise<void> {
      const problem = claimProblem(body, terms);
      if (problem) throw new RecordError(problem);
      if (BigInt(terms.patientAx) !== BigInt(keys.eddsaPublicKey.Ax)) {
        throw new RecordError("This policy was issued to a different patient.");
      }
      const commitment = await policyCommitmentOf(terms);
      const claimHash = await poseidonHash(
        claimHashInputs({
          policyCommitment: commitment,
          encounterId: BigInt(body.encounterId),
          procedureCode: BigInt(body.procedureCode),
          claimAmount: BigInt(body.claimAmount),
          claimDay: BigInt(body.claimDay),
          payoutAddress: BigInt(body.payoutAddress),
        }),
      );
      const index = terms.coveredProcedures.findIndex(
        (code) => BigInt(code) === BigInt(body.procedureCode),
      );
      const tree = await merkleTree(await coveredLeaves(terms), COVERED_TREE_DEPTH);
      const approved: ApprovedPolicyTerms = {
        patientAx: terms.patientAx,
        patientAy: terms.patientAy,
        expiryDay: terms.expiryDay,
        perClaimLimit: terms.perClaimLimit,
        coveredRoot: terms.coveredRoot,
        policySalt: terms.policySalt,
      };
      await send(hospital, {
        type: "claim-approval",
        body: {
          encounterId: body.encounterId,
          terms: approved,
          coveredPath: tree.path(index),
          patientSignature: await eddsaSign(keys.eddsaSeed, claimHash),
        },
      });
    },

    /** Patient. Tells the hospital, with a signature, that this claim was refused (D-052). */
    async declineClaim(body: ClaimRequestBody, hospital: Address): Promise<void> {
      const declineHash = await poseidonHash(declineHashInputs(BigInt(body.encounterId)));
      await send(hospital, {
        type: "claim-decline",
        body: {
          encounterId: body.encounterId,
          patientSignature: await eddsaSign(keys.eddsaSeed, declineHash),
        },
      });
    },

    /** Hospital. Signs the final claim and builds the witness, which stays in this browser. */
    async buildCircuitInput(approval: ClaimApprovalBody): Promise<ClaimCircuitInput> {
      const pending = requests.get(BigInt(approval.encounterId).toString());
      if (!pending) throw new RecordError("This approval does not match a claim you requested.");
      if (pending.declined) throw new RecordError("The patient already declined this claim.");
      const { body } = pending;
      const { terms } = approval;
      const leaves = await approvedLeaves();
      const leaf = await leafOf(body.hospitalPublicKey);
      const index = leaves.indexOf(leaf);
      if (index < 0) throw new RecordError("The insurer no longer approves this hospital.");
      const tree = await merkleTree(leaves, HOSPITAL_TREE_DEPTH);
      const commitment = await policyCommitmentOf(terms);
      const claimHash = await poseidonHash(
        claimHashInputs({
          policyCommitment: commitment,
          encounterId: BigInt(body.encounterId),
          procedureCode: BigInt(body.procedureCode),
          claimAmount: BigInt(body.claimAmount),
          claimDay: BigInt(body.claimDay),
          payoutAddress: BigInt(body.payoutAddress),
        }),
      );
      const hospitalSignature = await eddsaSign(keys.eddsaSeed, claimHash);
      const nullifier = await poseidonHash(
        nullifierInputs(BigInt(body.encounterId), BigInt(terms.policySalt)),
      );
      // The approved list may have changed since the request, so use its current path.
      const hospitalPath = tree.path(index);
      return {
        claimAmount: body.claimAmount,
        policyCommitment: commitment.toString(),
        nullifier: nullifier.toString(),
        hospitalRoot: tree.root.toString(),
        claimDay: body.claimDay,
        payoutAddress: BigInt(body.payoutAddress).toString(),
        procedureCode: body.procedureCode,
        encounterId: body.encounterId,
        policySalt: terms.policySalt,
        expiryDay: terms.expiryDay,
        perClaimLimit: terms.perClaimLimit,
        coveredRoot: terms.coveredRoot,
        coveredPathElements: approval.coveredPath.pathElements,
        coveredPathIndices: approval.coveredPath.pathIndices,
        patientAx: terms.patientAx,
        patientAy: terms.patientAy,
        patientS: approval.patientSignature.S,
        patientR8x: approval.patientSignature.R8x,
        patientR8y: approval.patientSignature.R8y,
        hospitalAx: body.hospitalPublicKey.Ax,
        hospitalAy: body.hospitalPublicKey.Ay,
        hospitalS: hospitalSignature.S,
        hospitalR8x: hospitalSignature.R8x,
        hospitalR8y: hospitalSignature.R8y,
        hospitalPathElements: hospitalPath.pathElements,
        hospitalPathIndices: hospitalPath.pathIndices,
      };
    },

    /**
     * Decrypts, runs each sender check, then acknowledges. A message that cannot be decrypted
     * is left for retention to remove, and a failed chain read is retried on the next poll.
     */
    async poll(): Promise<ExchangeEvent[]> {
      if (polling) return [];
      polling = true;
      try {
        const response = await authedPost("/api/inbox/list", "list");
        if (!response.ok) throw new RecordError("Could not check your private messages.");
        const { messages } = (await response.json()) as { messages?: unknown[] };
        const events: ExchangeEvent[] = [];
        const acknowledged: string[] = [];
        for (const raw of messages ?? []) {
          let envelope: InboxEnvelope;
          try {
            envelope = parseInboxEnvelope(raw);
          } catch {
            continue;
          }
          if (unreadable.has(envelope.messageId)) continue;
          if (handled.has(envelope.messageId)) {
            acknowledged.push(envelope.messageId);
            continue;
          }
          try {
            const event = await checkEnvelope(envelope);
            handled.add(envelope.messageId);
            acknowledged.push(envelope.messageId);
            events.push(event);
          } catch (error) {
            if (error instanceof Error && /decrypt|format/i.test(error.message)) {
              unreadable.add(envelope.messageId);
              events.push({
                kind: "rejected",
                messageId: envelope.messageId,
                reason: "A private message could not be read.",
              });
            }
          }
        }
        if (acknowledged.length) {
          await authedPost("/api/inbox/ack", "ack", { messageIds: acknowledged }).catch(
            () => undefined,
          );
        }
        return events;
      } finally {
        polling = false;
      }
    },
  };
}

export type ClaimExchange = ReturnType<typeof createClaimExchange>;
