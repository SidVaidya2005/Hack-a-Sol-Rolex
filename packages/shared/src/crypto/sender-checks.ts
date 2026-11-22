import { COVERED_TREE_DEPTH } from "../constants.ts";
import {
  claimHashInputs,
  coveredLeafInputs,
  hospitalLeafInputs,
  policyCommitmentInputs,
  requestHashInputs,
} from "../hash-inputs.ts";
import type {
  ApprovedPolicyTerms,
  ClaimApprovalBody,
  ClaimRequestBody,
  EddsaPublicKey,
  InboxPlaintext,
  PolicyTerms,
} from "../types.ts";
import { eddsaVerify, merkleRootFromLeaves, merkleRootFromPath, poseidonHash } from "./zk.ts";

export type SenderCheckResult = { ok: true } | { ok: false; reason: string };

/** Chain data the caller reads before checking a message. */
export interface SenderCheckContext {
  /** The recipient's EdDSA key registered on-chain. */
  recipientEddsaKey: EddsaPublicKey;
  /** The envelope sender's registered EdDSA key, or null if unregistered. */
  senderEddsaKey: EddsaPublicKey | null;
  /** The current `hospitalRoot()` value. */
  hospitalRoot: bigint;
  isRegisteredPolicy(policyCommitment: bigint): boolean | Promise<boolean>;
  /** The hospital's own earlier request for this encounter, if it has one. */
  findClaimRequest(encounterId: bigint): ClaimRequestBody | null | Promise<ClaimRequestBody | null>;
}

const pass: SenderCheckResult = { ok: true };
const fail = (reason: string): SenderCheckResult => ({ ok: false, reason });

const sameKey = (a: EddsaPublicKey, b: EddsaPublicKey): boolean =>
  BigInt(a.Ax) === BigInt(b.Ax) && BigInt(a.Ay) === BigInt(b.Ay);

function policyCommitment(terms: ApprovedPolicyTerms): Promise<bigint> {
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

function claimFields(request: ClaimRequestBody) {
  return {
    encounterId: BigInt(request.encounterId),
    procedureCode: BigInt(request.procedureCode),
    claimAmount: BigInt(request.claimAmount),
    claimDay: BigInt(request.claimDay),
    payoutAddress: BigInt(request.payoutAddress),
  };
}

export async function checkPolicyTerms(
  terms: PolicyTerms,
  context: Pick<SenderCheckContext, "recipientEddsaKey" | "isRegisteredPolicy">,
): Promise<SenderCheckResult> {
  const commitment = await policyCommitment(terms);
  if (!(await context.isRegisteredPolicy(commitment))) {
    return fail("These policy terms do not match a registered policy.");
  }
  const named = { Ax: terms.patientAx, Ay: terms.patientAy };
  if (!sameKey(named, context.recipientEddsaKey)) {
    return fail("This policy was issued to a different patient.");
  }
  const salt = BigInt(terms.policySalt);
  const leaves = await Promise.all(
    terms.coveredProcedures.map((code) => poseidonHash(coveredLeafInputs(BigInt(code), salt))),
  );
  const root = await merkleRootFromLeaves(leaves, COVERED_TREE_DEPTH);
  if (root !== BigInt(terms.coveredRoot)) {
    return fail("The coverage list does not match this policy.");
  }
  return pass;
}

export async function checkClaimRequest(
  body: ClaimRequestBody,
  context: Pick<SenderCheckContext, "senderEddsaKey" | "hospitalRoot">,
): Promise<SenderCheckResult> {
  if (!context.senderEddsaKey || !sameKey(body.hospitalPublicKey, context.senderEddsaKey)) {
    return fail("This claim request did not come from the hospital it names.");
  }
  const requestHash = await poseidonHash(requestHashInputs(claimFields(body)));
  if (!(await eddsaVerify(requestHash, body.hospitalSignature, body.hospitalPublicKey))) {
    return fail("The hospital signature on this claim request is not valid.");
  }
  const leaf = await poseidonHash(
    hospitalLeafInputs(BigInt(body.hospitalPublicKey.Ax), BigInt(body.hospitalPublicKey.Ay)),
  );
  if ((await merkleRootFromPath(leaf, body.hospitalPath)) !== context.hospitalRoot) {
    return fail("This hospital is not currently approved.");
  }
  return pass;
}

export async function checkClaimApproval(
  body: ClaimApprovalBody,
  context: Pick<SenderCheckContext, "senderEddsaKey" | "isRegisteredPolicy" | "findClaimRequest">,
): Promise<SenderCheckResult> {
  const request = await context.findClaimRequest(BigInt(body.encounterId));
  if (!request || BigInt(request.encounterId) !== BigInt(body.encounterId)) {
    return fail("This approval does not match a claim you requested.");
  }
  const patientKey = { Ax: body.terms.patientAx, Ay: body.terms.patientAy };
  if (!context.senderEddsaKey || !sameKey(patientKey, context.senderEddsaKey)) {
    return fail("This approval did not come from the policy's patient.");
  }
  const commitment = await policyCommitment(body.terms);
  if (!(await context.isRegisteredPolicy(commitment))) {
    return fail("These policy terms do not match a registered policy.");
  }
  const claimHash = await poseidonHash(
    claimHashInputs({ policyCommitment: commitment, ...claimFields(request) }),
  );
  if (!(await eddsaVerify(claimHash, body.patientSignature, patientKey))) {
    return fail("The patient signature on this approval is not valid.");
  }
  const coveredLeaf = await poseidonHash(
    coveredLeafInputs(BigInt(request.procedureCode), BigInt(body.terms.policySalt)),
  );
  if (
    (await merkleRootFromPath(coveredLeaf, body.coveredPath)) !== BigInt(body.terms.coveredRoot)
  ) {
    return fail("This procedure is not covered by the policy.");
  }
  return pass;
}

/** Run this before showing or acting on any decrypted message (Invariant 22). */
export function checkInboxMessage(
  message: InboxPlaintext,
  context: SenderCheckContext,
): Promise<SenderCheckResult> {
  switch (message.type) {
    case "policy-terms":
      return checkPolicyTerms(message.body, context);
    case "claim-request":
      return checkClaimRequest(message.body, context);
    case "claim-approval":
      return checkClaimApproval(message.body, context);
  }
}
