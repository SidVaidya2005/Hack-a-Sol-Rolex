"use client";

import { useEffect, useState } from "react";
import type { PublicClient } from "viem";
import { usePublicClient } from "wagmi";

import { radoChain } from "../app/wagmi";
import { readChainLedger, type ChainLedger, type LedgerContracts } from "./settlement";

const POLL_MS = 4_000;

/** Live public chain data for the Insurer and Public Chain screens. Needs no wallet. */
export function useChainLedger() {
  const publicClient = usePublicClient({ chainId: radoChain.id });
  const [state, setState] = useState<{ ledger: ChainLedger | null; error: string }>({
    ledger: null,
    error: "",
  });

  useEffect(() => {
    if (!publicClient) return;
    let current = true;
    let loading = false;
    const load = async () => {
      if (loading) return;
      loading = true;
      try {
        const response = await fetch("/api/contracts", { cache: "no-store" });
        if (!response.ok) throw new Error("contracts");
        const contracts = (await response.json()) as LedgerContracts;
        const ledger = await readChainLedger(publicClient as unknown as PublicClient, contracts);
        if (current) setState({ ledger, error: "" });
      } catch {
        if (current) {
          setState((previous) => ({
            ...previous,
            error: "Could not read the local chain. Showing the last values received.",
          }));
        }
      } finally {
        loading = false;
      }
    };
    void load();
    const timer = setInterval(() => void load(), POLL_MS);
    return () => {
      current = false;
      clearInterval(timer);
    };
  }, [publicClient]);

  return state;
}
