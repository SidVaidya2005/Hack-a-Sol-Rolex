import {
  AMOUNT_BITS,
  BN254_FIELD_PRIME,
  COVERED_TREE_DEPTH,
  DAY_BITS,
  HOSPITAL_TREE_DEPTH,
} from "../constants.ts";
import type {
  ApprovedPolicyTerms,
  ClaimApprovalBody,
  ClaimDeclineBody,
  ClaimRequestBody,
  EddsaPublicKey,
  EddsaSignature,
  InboxPlaintext,
  MerklePath,
  PolicyTerms,
} from "../types.ts";
import { isAddress, parseDecimal } from "./bytes.ts";

const DAY_LIMIT = 1n << BigInt(DAY_BITS);
const AMOUNT_LIMIT = 1n << BigInt(AMOUNT_BITS);
const APPROVED_TERMS_KEYS = [
  "patientAx",
  "patientAy",
  "expiryDay",
  "perClaimLimit",
  "coveredRoot",
  "policySalt",
];

function invalid(): never {
  throw new Error("Invalid message format");
}

/** Extra fields are refused, so a coverage list cannot ride along in an approval (D-032). */
function exact(value: unknown, keys: string[]): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) invalid();
  const actual = Object.keys(value);
  if (actual.length !== keys.length || !keys.every((key) => actual.includes(key))) invalid();
  return value as Record<string, unknown>;
}

function assertField(value: unknown): void {
  parseDecimal(value, BN254_FIELD_PRIME);
}

function assertPublicKey(value: unknown): asserts value is EddsaPublicKey {
  const key = exact(value, ["Ax", "Ay"]);
  assertField(key.Ax);
  assertField(key.Ay);
}

function assertSignature(value: unknown): asserts value is EddsaSignature {
  const signature = exact(value, ["R8x", "R8y", "S"]);
  assertField(signature.R8x);
  assertField(signature.R8y);
  assertField(signature.S);
}

function assertPath(value: unknown, depth: number): asserts value is MerklePath {
  const path = exact(value, ["pathElements", "pathIndices"]);
  const { pathElements, pathIndices } = path;
  if (!Array.isArray(pathElements) || pathElements.length !== depth) invalid();
  if (!Array.isArray(pathIndices) || pathIndices.length !== depth) invalid();
  pathElements.forEach(assertField);
  if (!pathIndices.every((index) => index === 0 || index === 1)) invalid();
}

function assertApprovedTermFields(terms: Record<string, unknown>): void {
  assertField(terms.patientAx);
  assertField(terms.patientAy);
  parseDecimal(terms.expiryDay, DAY_LIMIT);
  parseDecimal(terms.perClaimLimit, AMOUNT_LIMIT);
  assertField(terms.coveredRoot);
  assertField(terms.policySalt);
}

function assertPolicyTerms(value: unknown): asserts value is PolicyTerms {
  const terms = exact(value, [...APPROVED_TERMS_KEYS, "coveredProcedures"]);
  assertApprovedTermFields(terms);
  const { coveredProcedures } = terms;
  if (!Array.isArray(coveredProcedures) || coveredProcedures.length > 2 ** COVERED_TREE_DEPTH) {
    invalid();
  }
  coveredProcedures.forEach(assertField);
}

function assertClaimRequest(value: unknown): asserts value is ClaimRequestBody {
  const body = exact(value, [
    "encounterId",
    "procedureCode",
    "claimAmount",
    "claimDay",
    "payoutAddress",
    "hospitalPublicKey",
    "hospitalPath",
    "hospitalSignature",
  ]);
  assertField(body.encounterId);
  assertField(body.procedureCode);
  parseDecimal(body.claimAmount, AMOUNT_LIMIT);
  parseDecimal(body.claimDay, DAY_LIMIT);
  if (!isAddress(body.payoutAddress)) invalid();
  assertPublicKey(body.hospitalPublicKey);
  assertPath(body.hospitalPath, HOSPITAL_TREE_DEPTH);
  assertSignature(body.hospitalSignature);
}

function assertClaimApproval(value: unknown): asserts value is ClaimApprovalBody {
  const body = exact(value, ["encounterId", "terms", "coveredPath", "patientSignature"]);
  assertField(body.encounterId);
  const terms: ApprovedPolicyTerms | unknown = body.terms;
  assertApprovedTermFields(exact(terms, APPROVED_TERMS_KEYS));
  assertPath(body.coveredPath, COVERED_TREE_DEPTH);
  assertSignature(body.patientSignature);
}

function assertClaimDecline(value: unknown): asserts value is ClaimDeclineBody {
  const body = exact(value, ["encounterId", "patientSignature"]);
  assertField(body.encounterId);
  assertSignature(body.patientSignature);
}

/** Validates decrypted or outgoing data. Errors never echo message contents. */
export function parseInboxPlaintext(value: unknown): InboxPlaintext {
  try {
    const message = exact(value, ["type", "body"]);
    if (message.type === "policy-terms") assertPolicyTerms(message.body);
    else if (message.type === "claim-request") assertClaimRequest(message.body);
    else if (message.type === "claim-approval") assertClaimApproval(message.body);
    else if (message.type === "claim-decline") assertClaimDecline(message.body);
    else invalid();
    return message as unknown as InboxPlaintext;
  } catch {
    throw new Error("Invalid message format");
  }
}
