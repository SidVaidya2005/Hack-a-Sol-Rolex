import { CHAIN_ID } from "@rado/shared";
import { defineChain, http } from "viem";
import { createConfig } from "wagmi";
import { injected } from "wagmi/connectors";

export const radoChain = defineChain({
  id: CHAIN_ID,
  name: "Rado Network",
  nativeCurrency: { decimals: 18, name: "Ether", symbol: "ETH" },
  rpcUrls: { default: { http: ["/api/rpc"] } },
});

export const wagmiConfig = createConfig({
  chains: [radoChain],
  connectors: [injected()],
  ssr: true,
  transports: { [radoChain.id]: http("/api/rpc") },
});
