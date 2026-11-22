import { PUBLIC_SIGNALS, SAMPLE_CLAIM, SAMPLE_POLICY } from "@rado/shared";

export function getPublicChainSampleData() {
  const values = [
    SAMPLE_CLAIM.claimAmount.toString(),
    "sim:176548529681430125678934",
    "sim:218440392512932881",
    "sim:1922381114902245279931",
    SAMPLE_CLAIM.claimDay.toString(),
    "sim:0x8b91...e620",
  ];

  return {
    signals: PUBLIC_SIGNALS.map((name, index) => ({ name, value: values[index] })),
    policyCap: SAMPLE_POLICY.totalCap.toString(),
    events: [
      { id: "0x9f31…ae20", name: "PolicyRegistered", block: "#18,402" },
      { id: "0xb820…1d07", name: "ClaimSettled", block: "#18,417" },
      { id: "0xaa12…18fb", name: "RecordViewed", block: "#18,421" },
    ],
  };
}
