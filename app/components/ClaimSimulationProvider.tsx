"use client";

import { createContext, useContext, useEffect, useMemo, useReducer, type ReactNode } from "react";

import {
  claimSimulationReducer,
  INITIAL_CLAIM_SIMULATION,
  publicClaimView,
  type ClaimSimulationState,
} from "../data/claim-simulation";

type ClaimActions = {
  requestApproval: () => void;
  approveClaim: () => void;
  startProof: () => void;
  submitClaim: () => void;
  restart: () => void;
};

const ClaimStateContext = createContext<ClaimSimulationState | null>(null);
const ClaimActionsContext = createContext<ClaimActions | null>(null);

export function ClaimSimulationProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(claimSimulationReducer, INITIAL_CLAIM_SIMULATION);
  const proving = state.stage === "proving";

  // The timer lives here so the simulated proof keeps running while the user switches roles.
  useEffect(() => {
    if (!proving) return;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const intervalId = setInterval(() => dispatch({ type: "tick" }), reducedMotion ? 120 : 700);
    return () => clearInterval(intervalId);
  }, [proving]);

  const actions = useMemo<ClaimActions>(() => ({
    requestApproval: () => dispatch({ type: "request" }),
    approveClaim: () => dispatch({ type: "approve" }),
    startProof: () => dispatch({ type: "startProof" }),
    submitClaim: () => dispatch({ type: "submit" }),
    restart: () => dispatch({ type: "restart" }),
  }), []);

  return (
    <ClaimStateContext value={state}>
      <ClaimActionsContext value={actions}>{children}</ClaimActionsContext>
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
