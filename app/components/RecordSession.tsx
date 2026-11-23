"use client";

import { deriveUnlockKeys, unlockTypedData } from "@rado/shared";
import type { Address, UnlockedKeys } from "@rado/shared";
import type { ReactNode } from "react";
import { createContext, useCallback, useContext, useMemo, useState } from "react";
import type { Chain, PublicClient, Transport, WalletClient } from "viem";
import { useAccount, usePublicClient, useWalletClient } from "wagmi";

import { radoChain } from "../app/wagmi";
import {
  createRecordService,
  plainRecordError,
  type RecordAccount,
  type RecordService,
} from "../lib/record-service";
import { Icon } from "./icons";

/** Keys live only in this React state, so a reload or wallet change locks them (Invariant 5). */
type Session = { address: Address; keys: UnlockedKeys; service: RecordService };

type RecordSessionValue = {
  session: Session | null;
  /** Bumped after each change, so every panel reloads from the chain. */
  revision: number;
  refresh: () => void;
  ready: boolean;
  connected: boolean;
  correctNetwork: boolean;
  unlocking: boolean;
  error: string;
  unlock: () => Promise<void>;
};

const RecordSessionContext = createContext<RecordSessionValue | null>(null);

export function RecordSessionProvider({ children }: { children: ReactNode }) {
  const { address, chainId, isConnected } = useAccount();
  const publicClient = usePublicClient({ chainId: radoChain.id });
  const { data: walletClient } = useWalletClient({ chainId: radoChain.id });
  const [session, setSession] = useState<Session | null>(null);
  const [revision, setRevision] = useState(0);
  const [unlocking, setUnlocking] = useState(false);
  const [error, setError] = useState("");
  const correctNetwork = chainId === radoChain.id;

  if (session && (session.address !== address || !isConnected || !correctNetwork)) {
    setSession(null);
  }

  const refresh = useCallback(() => setRevision((value) => value + 1), []);

  const unlock = useCallback(async () => {
    if (!address || !walletClient || !publicClient) return;
    setUnlocking(true);
    setError("");
    try {
      const response = await fetch("/api/contracts", { cache: "no-store" });
      const body = (await response.json().catch(() => null)) as { recordAccess?: Address } | null;
      if (!response.ok || !body?.recordAccess) {
        setError("The Rado contracts are not available yet.");
        return;
      }
      const signature = await walletClient.signTypedData({
        account: walletClient.account,
        ...unlockTypedData(address),
      });
      const keys = await deriveUnlockKeys(signature);
      const service = createRecordService({
        publicClient: publicClient as unknown as PublicClient,
        walletClient: walletClient as unknown as WalletClient<Transport, Chain, RecordAccount>,
        recordAccess: body.recordAccess,
      });
      await service.ensureRegistered(keys);
      setSession({ address, keys, service });
    } catch (caught) {
      setError(plainRecordError(caught));
    } finally {
      setUnlocking(false);
    }
  }, [address, publicClient, walletClient]);

  const value = useMemo(
    () => ({
      session: session?.address === address ? session : null,
      revision,
      refresh,
      ready: Boolean(address && walletClient && publicClient),
      connected: isConnected,
      correctNetwork,
      unlocking,
      error,
      unlock,
    }),
    [
      address,
      correctNetwork,
      error,
      isConnected,
      publicClient,
      refresh,
      revision,
      session,
      unlock,
      unlocking,
      walletClient,
    ],
  );

  return <RecordSessionContext.Provider value={value}>{children}</RecordSessionContext.Provider>;
}

export function useRecordSession() {
  const value = useContext(RecordSessionContext);
  if (!value) throw new Error("useRecordSession needs RecordSessionProvider");
  return value;
}

export function UnlockGate({ purpose }: { purpose: string }) {
  const { connected, correctNetwork, ready, unlocking, error, unlock } = useRecordSession();
  const hint = !connected
    ? "Connect your wallet using the button at the top of the page."
    : !correctNetwork
      ? "Switch your wallet to Rado Local using the button at the top of the page."
      : purpose;

  return (
    <div className="rounded-lg border border-dashed border-rado-line px-5 py-8 text-center">
      <span className="inline-block text-rado-muted">
        <Icon name="lock" className="size-7" />
      </span>
      <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-rado-slate">{hint}</p>
      {connected && correctNetwork ? (
        <button
          className="button-primary mt-4 disabled:opacity-50"
          disabled={!ready || unlocking}
          onClick={() => void unlock()}
          type="button"
        >
          {unlocking ? "Check your wallet…" : "Unlock Rado"}
        </button>
      ) : null}
      {error ? (
        <p className="mt-3 text-sm text-rado-error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function shortId(value: string) {
  return `${value.slice(0, 6)}…${value.slice(-4)}`;
}

export function formatExpiry(expiresAt: bigint) {
  return new Date(Number(expiresAt) * 1000).toLocaleString("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export function RecordItems({
  items,
}: {
  items: { id: string; kind: string; description: string }[];
}) {
  return (
    <ul className="motion-reveal mt-3 divide-y divide-rado-line rounded-lg border border-rado-line px-4">
      {items.map((item) => (
        <li className="py-3" key={item.id}>
          <p className="text-sm text-rado-ink">{item.description}</p>
          <p className="mt-0.5 text-xs text-rado-slate">{item.kind} · Synthetic record</p>
        </li>
      ))}
    </ul>
  );
}

export function StatusMessage({ message }: { message: { ok: boolean; text: string } | null }) {
  if (!message) return null;
  return (
    <p
      aria-live="polite"
      className={`${message.ok ? "status-success" : "status-error"} motion-reveal mb-6 rounded-lg border px-4 py-3 text-sm`}
      role="status"
    >
      {message.text}
    </p>
  );
}
