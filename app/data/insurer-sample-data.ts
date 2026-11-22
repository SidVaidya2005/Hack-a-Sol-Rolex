import { MUSD_DECIMALS, SAMPLE_CLAIM, SAMPLE_POLICY } from "@rado/shared";

function formatAmount(value: bigint) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  }).format(Number(value) / 10 ** MUSD_DECIMALS);
}

export function getInsurerSampleData() {
  return {
    balance: formatAmount(84_500_000_000n),
    policyCap: formatAmount(SAMPLE_POLICY.totalCap),
    paid: formatAmount(SAMPLE_CLAIM.claimAmount),
    claims: [
      {
        id: "CLM-00824",
        policy: "POL-00481",
        amount: formatAmount(SAMPLE_CLAIM.claimAmount),
        date: "Nov 22, 2026",
        state: "Verified · sample",
      },
      {
        id: "CLM-00823",
        policy: "POL-00480",
        amount: formatAmount(875_000_000n),
        date: "Nov 21, 2026",
        state: "Verified · sample",
      },
      {
        id: "CLM-00822",
        policy: "POL-00476",
        amount: formatAmount(2_050_000_000n),
        date: "Nov 20, 2026",
        state: "Verified · sample",
      },
    ],
  };
}
