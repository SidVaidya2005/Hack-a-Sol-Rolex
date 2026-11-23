import type { PUBLIC_SIGNALS } from "@rado/shared";

const MS_PER_DAY = 86_400_000;

/** Plain names for the six public claim values. The technical name stays visible beside them. */
export const SIGNAL_LABELS: Record<(typeof PUBLIC_SIGNALS)[number], string> = {
  claimAmount: "Claim amount",
  policyCommitment: "Policy fingerprint",
  nullifier: "One-time claim marker",
  hospitalRoot: "Approved hospitals fingerprint",
  claimDay: "Claim date",
  payoutAddress: "Payout address",
};

/** Claim days count whole UTC days since the Unix epoch, so the date must render in UTC. */
export function formatClaimDay(day: bigint | number | string) {
  return new Date(Number(day) * MS_PER_DAY).toLocaleDateString("en-IN", {
    dateStyle: "medium",
    timeZone: "UTC",
  });
}
