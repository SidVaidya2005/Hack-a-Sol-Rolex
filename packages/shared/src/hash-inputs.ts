import { CLAIM_DOMAIN, REQUEST_DOMAIN } from "./constants.ts";

/** Each function returns Poseidon inputs in their required order. */

export function merkleNodeInputs(left: bigint, right: bigint): bigint[] {
  return [left, right];
}

export function hospitalLeafInputs(hospitalAx: bigint, hospitalAy: bigint): bigint[] {
  return [hospitalAx, hospitalAy];
}

export function coveredLeafInputs(procedureCode: bigint, policySalt: bigint): bigint[] {
  return [procedureCode, policySalt];
}

export function policyCommitmentInputs(terms: {
  patientAx: bigint;
  patientAy: bigint;
  expiryDay: bigint;
  perClaimLimit: bigint;
  coveredRoot: bigint;
  policySalt: bigint;
}): bigint[] {
  return [
    terms.patientAx,
    terms.patientAy,
    terms.expiryDay,
    terms.perClaimLimit,
    terms.coveredRoot,
    terms.policySalt,
  ];
}

export function nullifierInputs(encounterId: bigint, policySalt: bigint): bigint[] {
  return [encounterId, policySalt];
}

export function claimHashInputs(claim: {
  policyCommitment: bigint;
  encounterId: bigint;
  procedureCode: bigint;
  claimAmount: bigint;
  claimDay: bigint;
  payoutAddress: bigint;
}): bigint[] {
  return [
    CLAIM_DOMAIN,
    claim.policyCommitment,
    claim.encounterId,
    claim.procedureCode,
    claim.claimAmount,
    claim.claimDay,
    claim.payoutAddress,
  ];
}

export function requestHashInputs(request: {
  encounterId: bigint;
  procedureCode: bigint;
  claimAmount: bigint;
  claimDay: bigint;
  payoutAddress: bigint;
}): bigint[] {
  return [
    REQUEST_DOMAIN,
    request.encounterId,
    request.procedureCode,
    request.claimAmount,
    request.claimDay,
    request.payoutAddress,
  ];
}
