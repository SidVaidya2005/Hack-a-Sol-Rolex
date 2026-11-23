import type { Address, ShareProfile } from "@rado/shared";
import { isAddress } from "viem";

export type ProviderKind = "hospital" | "doctor" | "lab" | "pharmacy";

export interface Provider {
  wallet: Address;
  name: string;
  kind: ProviderKind;
}

/** Synthetic names. They stay off-chain so the chain never labels a provider's type. */
export const PROVIDER_NAMES: Record<ProviderKind, string> = {
  hospital: "Sample General Hospital",
  doctor: "Sample General Doctor",
  lab: "Sample City Lab",
  pharmacy: "Sample City Pharmacy",
};

export function shareProfileFor(kind: ProviderKind | undefined): ShareProfile {
  return kind === "lab" || kind === "pharmacy" ? kind : "hospital";
}

/** Keeps only provider roles, so patient and insurer wallets never enter the directory. */
export function providersFromWallets(wallets: unknown): Provider[] {
  if (typeof wallets !== "object" || wallets === null) return [];
  const source = wallets as Record<string, unknown>;
  return (Object.keys(PROVIDER_NAMES) as ProviderKind[]).flatMap((kind) => {
    const wallet = source[kind];
    if (typeof wallet !== "string" || !isAddress(wallet, { strict: false })) return [];
    return [{ wallet, name: PROVIDER_NAMES[kind], kind }];
  });
}
