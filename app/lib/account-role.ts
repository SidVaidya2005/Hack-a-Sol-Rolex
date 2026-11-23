export type AccountRole = "patient" | "hospital" | "provider" | "responder" | "insurer";
/** The only roles a wallet can pick for itself. The others are assigned and read from the chain. */
export type ChosenRole = "patient" | "hospital";

export interface RoleFacts {
  isInsurer: boolean;
  isResponder: boolean;
  providerKind: "hospital" | "doctor" | "lab" | "pharmacy" | undefined;
  isApprovedHospital: boolean;
  hasPatientRecords: boolean;
  savedRole: ChosenRole | null;
}

/**
 * Assigned roles always win over a saved choice, so picking a role grants nothing.
 * Returns null when this wallet still needs to choose.
 */
export function resolveAccountRole(facts: RoleFacts): AccountRole | null {
  if (facts.isInsurer) return "insurer";
  if (facts.isResponder) return "responder";
  if (facts.providerKind === "lab" || facts.providerKind === "pharmacy") return "provider";
  if (facts.providerKind || facts.isApprovedHospital) return "hospital";
  if (facts.hasPatientRecords) return "patient";
  return facts.savedRole;
}

const storageKey = (wallet: string) => `rado.role.v1.${wallet.toLowerCase()}`;

/** Holds only the label this wallet chose on this browser, never profile or medical data. */
export function readSavedRole(wallet: string): ChosenRole | null {
  try {
    const value = window.localStorage.getItem(storageKey(wallet));
    return value === "patient" || value === "hospital" ? value : null;
  } catch {
    return null;
  }
}

export function saveRole(wallet: string, role: ChosenRole): void {
  try {
    window.localStorage.setItem(storageKey(wallet), role);
  } catch {
    // Private windows can block storage. The wallet simply chooses again next time.
  }
}
