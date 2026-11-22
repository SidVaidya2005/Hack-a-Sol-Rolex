import { SAMPLE_CLAIM } from "@rado/shared";

/*
 * In-memory stand-in for the W09 to W11 flows. It creates no proof, signature, key, or transaction.
 * This state deliberately holds no medical data, so Insurer and Public Chain screens cannot read any from it.
 */

const STAGES = ["draft", "requested", "approved", "proving", "proved", "settled"] as const;
const LAST_SAMPLE_BLOCK = 18_421;

export type ClaimStage = (typeof STAGES)[number];

export const PROOF_CHECK_COUNT = 4;
export const ROTATION_STEP_COUNT = 4;

type SimulatedChainEvent = { id: string; name: string; block: number };

export type ClaimSimulationState = {
  stage: ClaimStage;
  proofStep: number;
  rejection: string | null;
  access: { status: "active" | "rotating" | "revoked"; step: number };
  chainEvents: SimulatedChainEvent[];
};

export type ClaimSimulationAction =
  | { type: "request" }
  | { type: "approve" }
  | { type: "startProof" }
  | { type: "tick" }
  | { type: "submit" }
  | { type: "startRotation" }
  | { type: "rotationTick" }
  | { type: "restart" };

export const INITIAL_CLAIM_SIMULATION: ClaimSimulationState = {
  stage: "draft",
  proofStep: 0,
  rejection: null,
  access: { status: "active", step: 0 },
  chainEvents: [],
};

export function hasReached(stage: ClaimStage, target: ClaimStage) {
  return STAGES.indexOf(stage) >= STAGES.indexOf(target);
}

/** Events passed together share a block, as they would inside one transaction. */
function addTransaction(events: SimulatedChainEvent[], added: Omit<SimulatedChainEvent, "block">[]) {
  const block = (events.at(-1)?.block ?? LAST_SAMPLE_BLOCK) + 1;
  return [...events, ...added.map((event) => ({ ...event, block }))];
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
      if (state.stage !== "proved") return state;
      return {
        ...state,
        stage: "settled",
        rejection: null,
        chainEvents: addTransaction(state.chainEvents, [{ id: "sim:0xc4d7…92be", name: "ClaimSettled" }]),
      };
    case "startRotation":
      return state.access.status === "active" ? { ...state, access: { status: "rotating", step: 0 } } : state;
    case "rotationTick": {
      if (state.access.status !== "rotating") return state;
      const step = state.access.step + 1;
      if (step < ROTATION_STEP_COUNT) return { ...state, access: { status: "rotating", step } };
      return {
        ...state,
        access: { status: "revoked", step },
        chainEvents: addTransaction(state.chainEvents, [
          { id: "sim:0x71ea…04cd", name: "AccessRevoked" },
          { id: "sim:0x3fb2…a816", name: "RecordKeyRotated" },
        ]),
      };
    }
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

function formatBlock(block: number) {
  return `#${block.toLocaleString("en-US")}`;
}

/** The only simulated values the Insurer and Public Chain screens may use. */
export function publicClaimView(state: ClaimSimulationState) {
  return {
    settled: state.stage === "settled",
    claimId: "CLM-00824",
    policy: "POL-00481",
    amount: SAMPLE_CLAIM.claimAmount,
    date: formatClaimDay(SAMPLE_CLAIM.claimDay),
    latestBlock: formatBlock(state.chainEvents.at(-1)?.block ?? LAST_SAMPLE_BLOCK),
    events: [...state.chainEvents].reverse().map((event) => ({ ...event, block: formatBlock(event.block) })),
  };
}
