"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from "react";

import { INITIAL_CLAIM_DRAFT, type ClaimDraft } from "../data/claim-draft";
import {
  claimSimulationReducer,
  INITIAL_CLAIM_SIMULATION,
  publicClaimView,
  type ClaimSimulationState,
} from "../data/claim-simulation";

type ClaimActions = {
  requestApproval: (amount: bigint) => void;
  approveClaim: () => void;
  declineClaim: () => void;
  startProof: () => void;
  submitClaim: () => void;
  grantAccess: (id: string, days: number) => void;
  revokeAndRotate: (target: string) => void;
  restart: () => void;
};

type PrivateDraft = { draft: ClaimDraft; setDraft: Dispatch<SetStateAction<ClaimDraft>> };

const ClaimStateContext = createContext<ClaimSimulationState | null>(null);
const ClaimActionsContext = createContext<ClaimActions | null>(null);
const PrivateDraftContext = createContext<PrivateDraft | null>(null);

export function ClaimSimulationProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(claimSimulationReducer, INITIAL_CLAIM_SIMULATION);
  const [draft, setDraft] = useState(INITIAL_CLAIM_DRAFT);
  const proving = state.stage === "proving";
  const rotating = state.access.status === "rotating";

  // These timers live here so simulated work keeps running while the user switches roles.
  useEffect(() => {
    if (!proving) return;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const intervalId = setInterval(() => dispatch({ type: "tick" }), reducedMotion ? 120 : 700);
    return () => clearInterval(intervalId);
  }, [proving]);

  useEffect(() => {
    if (!rotating) return;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const intervalId = setInterval(
      () => dispatch({ type: "rotationTick" }),
      reducedMotion ? 120 : 600,
    );
    return () => clearInterval(intervalId);
  }, [rotating]);

  const actions = useMemo<ClaimActions>(
    () => ({
      requestApproval: (amount) => dispatch({ type: "request", amount }),
      approveClaim: () => dispatch({ type: "approve" }),
      declineClaim: () => dispatch({ type: "decline" }),
      startProof: () => dispatch({ type: "startProof" }),
      submitClaim: () => dispatch({ type: "submit" }),
      grantAccess: (id, days) => dispatch({ type: "grant", id, days }),
      revokeAndRotate: (target) => dispatch({ type: "startRotation", target }),
      restart: () => {
        dispatch({ type: "restart" });
        setDraft(INITIAL_CLAIM_DRAFT);
      },
    }),
    [],
  );
  const privateDraft = useMemo(() => ({ draft, setDraft }), [draft]);

  return (
    <ClaimStateContext value={state}>
      <ClaimActionsContext value={actions}>
        <PrivateDraftContext value={privateDraft}>{children}</PrivateDraftContext>
      </ClaimActionsContext>
    </ClaimStateContext>
  );
}

export function useClaimState() {
  const state = useContext(ClaimStateContext);
  if (!state) throw new Error("useClaimState must be used inside ClaimSimulationProvider");
  return state;
}

export function useClaimActions() {
  const actions = useContext(ClaimActionsContext);
  if (!actions) throw new Error("useClaimActions must be used inside ClaimSimulationProvider");
  return actions;
}

export function usePublicClaim() {
  return publicClaimView(useClaimState());
}

/** Holds private claim details. Only the Patient and Hospital screens may call this. */
export function usePrivateClaimDraft() {
  const value = useContext(PrivateDraftContext);
  if (!value) throw new Error("usePrivateClaimDraft must be used inside ClaimSimulationProvider");
  return value;
}
