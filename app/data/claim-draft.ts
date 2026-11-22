import {
  SAMPLE_CLAIM,
  SAMPLE_POLICY,
  SAMPLE_PROCEDURES,
  SAMPLE_UNCOVERED_PROCEDURE,
} from "@rado/shared";

/*
 * Private claim details for the Patient and Hospital screens only.
 * Insurer and Public Chain screens must never import this module.
 */

export type ClaimDraft = { procedureCode: string; amountText: string };

export const INITIAL_CLAIM_DRAFT: ClaimDraft = {
  procedureCode: SAMPLE_CLAIM.procedureCode.toString(),
  amountText: "1250.00",
};

// The neutral label stops the Hospital's menu from revealing which option the patient's policy excludes (D-032).
export const PROCEDURE_OPTIONS = [
  ...SAMPLE_PROCEDURES.map(({ code, label }) => ({
    code: code.toString(),
    label: label as string,
  })),
  { code: SAMPLE_UNCOVERED_PROCEDURE.code.toString(), label: "Sample specialist procedure" },
];

export function procedureLabel(code: string) {
  return PROCEDURE_OPTIONS.find((option) => option.code === code)?.label ?? "Sample procedure";
}

/** Converts a displayed rupee string to 6-decimal token base units, or null if it is not a positive amount. */
export function parseClaimAmount(text: string) {
  const match = /^(\d{1,12})(?:\.(\d{1,2}))?$/.exec(text.trim());
  if (!match) return null;
  const units = BigInt(match[1]) * 1_000_000n + BigInt((match[2] ?? "").padEnd(2, "0")) * 10_000n;
  return units > 0n ? units : null;
}

/** Patient-side check, because only the patient holds the full policy terms. */
export function policyProblem(procedureCode: string, amount: bigint) {
  if (!SAMPLE_PROCEDURES.some(({ code }) => code.toString() === procedureCode))
    return "This procedure is not covered by your policy.";
  if (amount > SAMPLE_POLICY.perClaimLimit) return "This amount is above your per-claim limit.";
  return null;
}
