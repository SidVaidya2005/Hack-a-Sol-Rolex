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
export const ACCESS_CANDIDATES = [
  { id: "clinic-one", name: "Sample City Clinic" },
  { id: "hospital-two", name: "Sample General Hospital" },
  { id: "partner-clinic", name: "Sample Partner Clinic" },
];

type SimulatedChainEvent = { id: string; name: string; block: number };
export type AuditCategory = "Access" | "Claims" | "Records";
export type AccessGrant = { id: string; name: string; status: "Active" | "Expired" | "Revoked"; expiry: string };

export type ClaimSimulationState = {
  stage: ClaimStage;
  proofStep: number;
  rejection: string | null;
  declined: boolean;
  amount: bigint;
  access: { status: "idle" | "rotating"; step: number; target: string | null; keyVersion: number };
  grants: AccessGrant[];
  chainEvents: SimulatedChainEvent[];
  audit: { title: string; category: AuditCategory }[];
};

export type ClaimSimulationAction =
  | { type: "request"; amount: bigint }
  | { type: "approve" }
  | { type: "decline" }
  | { type: "startProof" }
  | { type: "tick" }
  | { type: "submit" }
  | { type: "grant"; id: string; days: number }
  | { type: "startRotation"; target: string }
  | { type: "rotationTick" }
  | { type: "restart" };

export const INITIAL_CLAIM_SIMULATION: ClaimSimulationState = {
  stage: "draft",
  proofStep: 0,
  rejection: null,
  declined: false,
  amount: SAMPLE_CLAIM.claimAmount,
  access: { status: "idle", step: 0, target: null, keyVersion: 1 },
  grants: [
    { id: "clinic-one", name: "Sample City Clinic", status: "Active", expiry: "Expires in 30 days" },
    { id: "hospital-two", name: "Sample General Hospital", status: "Expired", expiry: "Access ended" },
  ],
  chainEvents: [],
  audit: [],
};

export function hasReached(stage: ClaimStage, target: ClaimStage) {
  return STAGES.indexOf(stage) >= STAGES.indexOf(target);
}

function simulatedId(block: number, index: number) {
  const hex = (block * 7_919 + index * 104_729).toString(16).padStart(8, "0");
  return `sim:0x${hex.slice(0, 4)}…${hex.slice(-4)}`;
}

/** Events passed together share a block, as they would inside one transaction. */
function addTransaction(events: SimulatedChainEvent[], names: string[]) {
  const block = (events.at(-1)?.block ?? LAST_SAMPLE_BLOCK) + 1;
  return [...events, ...names.map((name, index) => ({ id: simulatedId(block, index), name, block }))];
}

export function claimSimulationReducer(state: ClaimSimulationState, action: ClaimSimulationAction): ClaimSimulationState {
  switch (action.type) {
    case "request":
      if (state.stage !== "draft") return state;
      return {
        ...state,
        stage: "requested",
        amount: action.amount,
        declined: false,
        audit: [...state.audit, { title: "Claim request received", category: "Claims" }],
      };
    case "approve":
      if (state.stage !== "requested") return state;
      return { ...state, stage: "approved", audit: [...state.audit, { title: "Claim approved", category: "Claims" }] };
    case "decline":
      if (state.stage !== "requested") return state;
      return { ...state, stage: "draft", declined: true, audit: [...state.audit, { title: "Claim request declined", category: "Claims" }] };
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
        chainEvents: addTransaction(state.chainEvents, ["ClaimSettled"]),
        audit: [...state.audit, { title: "Claim settled", category: "Claims" }],
      };
    case "grant": {
      const candidate = ACCESS_CANDIDATES.find(({ id }) => id === action.id);
      const existing = state.grants.find(({ id }) => id === action.id);
      if (!candidate || state.access.status === "rotating" || existing?.status === "Active") return state;
      const grant: AccessGrant = { ...candidate, status: "Active", expiry: `Expires in ${action.days} ${action.days === 1 ? "day" : "days"}` };
      return {
        ...state,
        access: { ...state.access, step: 0 },
        grants: existing ? state.grants.map((item) => (item.id === action.id ? grant : item)) : [...state.grants, grant],
        chainEvents: addTransaction(state.chainEvents, ["AccessGranted"]),
        audit: [...state.audit, { title: "Doctor access granted", category: "Access" }],
      };
    }
    case "startRotation": {
      const target = state.grants.find(({ id }) => id === action.target);
      if (state.access.status === "rotating" || target?.status !== "Active") return state;
      return { ...state, access: { ...state.access, status: "rotating", step: 0, target: action.target } };
    }
    case "rotationTick": {
      if (state.access.status !== "rotating") return state;
      const step = state.access.step + 1;
      if (step < ROTATION_STEP_COUNT) return { ...state, access: { ...state.access, step } };
      return {
        ...state,
        access: { ...state.access, status: "idle", step, keyVersion: state.access.keyVersion + 1 },
        grants: state.grants.map((grant) => (grant.id === state.access.target ? { ...grant, status: "Revoked", expiry: "Access removed" } : grant)),
        chainEvents: addTransaction(state.chainEvents, ["AccessRevoked", "RecordKeyRotated"]),
        audit: [...state.audit, { title: "Doctor access revoked", category: "Access" }, { title: "Record key rotated", category: "Access" }],
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
    amount: state.amount,
    date: formatClaimDay(SAMPLE_CLAIM.claimDay),
    latestBlock: formatBlock(state.chainEvents.at(-1)?.block ?? LAST_SAMPLE_BLOCK),
    events: [...state.chainEvents].reverse().map((event) => ({ ...event, block: formatBlock(event.block) })),
  };
}
