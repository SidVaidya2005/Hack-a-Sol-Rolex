import { MUSD_DECIMALS, SAMPLE_POLICY } from "@rado/shared";

/** Displays mock token amounts as rupees at 1 token = ₹1. This is a label only, with no exchange rate (D-046). */
export function formatAmount(value: bigint) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 2,
  }).format(Number(value) / 10 ** MUSD_DECIMALS);
}

export function getInsurerSampleData() {
  return {
    balanceUnits: 84_500_000_000n,
    paidUnits: 2_925_000_000n,
    usedCapUnits: 7_200_000_000n,
    capUnits: SAMPLE_POLICY.totalCap,
    policyCap: formatAmount(SAMPLE_POLICY.totalCap),
    claims: [
      {
        id: "CLM-00823",
        policy: "POL-00480",
        amount: formatAmount(875_000_000n),
        amountUnits: 875_000_000n,
        date: "Nov 21, 2026",
        state: "Verified · sample",
      },
      {
        id: "CLM-00822",
        policy: "POL-00476",
        amount: formatAmount(2_050_000_000n),
        amountUnits: 2_050_000_000n,
        date: "Nov 20, 2026",
        state: "Verified · sample",
      },
    ],
  };
}
