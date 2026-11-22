import { SAMPLE_CLAIM } from "@rado/shared";

/*
 * In-memory stand-in for the W10 and W11 claim flow. It creates no proof, signature, or transaction.
 * This state deliberately holds no medical data, so Insurer and Public Chain screens cannot read any from it.
 */

const STAGES = ["draft", "requested", "approved", "proving", "proved", "settled"] as const;

export type ClaimStage = (typeof STAGES)[number];

export const PROOF_CHECK_COUNT = 4;

export type ClaimSimulationState = {
  stage: ClaimStage;
  proofStep: number;
  rejection: string | null;
};

export type ClaimSimulationAction =
  | { type: "request" }
  | { type: "approve" }
  | { type: "startProof" }
  | { type: "tick" }
  | { type: "submit" }
  | { type: "restart" };

export const INITIAL_CLAIM_SIMULATION: ClaimSimulationState = { stage: "draft", proofStep: 0, rejection: null };

export function hasReached(stage: ClaimStage, target: ClaimStage) {
  return STAGES.indexOf(stage) >= STAGES.indexOf(target);
}

export function claimSimulationReducer(state: ClaimSimulationState, action: ClaimSimulationAction): ClaimSimulationState {
  switch (action.type) {
    case "request":
      return state.stage === "draft" ? { ...state, stage: "requested" } : state;
    case "approve":
      return state.stage === "requested" ? { ...state, stage: "approved" } : state;
    case "startProof":
      return state.stage === "approved" ? { ...state, stage: "proving", proofStep: 0 } : state;
    case "tick": {
      if (state.stage !== "proving") return state;
      const proofStep = state.proofStep + 1;
      return { ...state, proofStep, stage: proofStep >= PROOF_CHECK_COUNT ? "proved" : "proving" };
    }
    case "submit":
      if (state.stage === "settled") return { ...state, rejection: "This claim was already submitted." };
      return state.stage === "proved" ? { ...state, stage: "settled", rejection: null } : state;
    case "restart":
      return INITIAL_CLAIM_SIMULATION;
  }
}

function formatClaimDay(day: bigint) {
  return new Date(Number(day) * 86_400_000).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** The only claim values the Insurer and Public Chain screens may use. */
export function publicClaimView(state: ClaimSimulationState) {
  return {
    settled: state.stage === "settled",
    claimId: "CLM-00824",
    policy: "POL-00481",
    amount: SAMPLE_CLAIM.claimAmount,
    date: formatClaimDay(SAMPLE_CLAIM.claimDay),
    block: "#18,422",
    eventId: "sim:0xc4d7…92be",
  };
}
