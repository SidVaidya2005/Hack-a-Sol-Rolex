"use client";

import { deriveUnlockKeys, unlockTypedData } from "@rado/shared";
import type { Address, UnlockedKeys } from "@rado/shared";
import type { ReactNode } from "react";
import { createContext, useCallback, useContext, useMemo, useState } from "react";
import type { Chain, PublicClient, Transport, WalletClient } from "viem";
import { useAccount, usePublicClient, useWalletClient } from "wagmi";

import { radoChain } from "../app/wagmi";
import { createClaimExchange, type ClaimExchange } from "../lib/claim-exchange";
import {
  createRecordService,
  plainRecordError,
  type RecordAccount,
  type RecordService,
} from "../lib/record-service";
import { createSettlement, type Settlement } from "../lib/settlement";
import { Icon } from "./icons";
import { useWalletActions } from "./WalletConnection";

/** Keys live only in this React state, so a reload or wallet change locks them (Invariant 5). */
type Session = {
  address: Address;
  keys: UnlockedKeys;
  service: RecordService;
  exchange: ClaimExchange;
  settlement: Settlement;
};

type RecordSessionValue = {
  session: Session | null;
  /** Bumped after each change, so every panel reloads from the chain. */
  revision: number;
  refresh: () => void;
  ready: boolean;
  connected: boolean;
  correctNetwork: boolean;
  unlocking: boolean;
  unlockPrompt: string;
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
  const [unlockPrompt, setUnlockPrompt] = useState("");
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
      const body = (await response.json().catch(() => null)) as {
        recordAccess?: Address;
        claimSettlement?: Address;
        mockUsd?: Address;
      } | null;
      if (!response.ok || !body?.recordAccess || !body.claimSettlement || !body.mockUsd) {
        setError("The Rado contracts are not available yet.");
        return;
      }
      setUnlockPrompt("Sign the unlock message in your wallet. It costs nothing.");
      const signature = await walletClient.signTypedData({
        account: walletClient.account,
        ...unlockTypedData(address),
      });
      const keys = await deriveUnlockKeys(signature);
      const clients = {
        publicClient: publicClient as unknown as PublicClient,
        walletClient: walletClient as unknown as WalletClient<Transport, Chain, RecordAccount>,
        recordAccess: body.recordAccess,
      };
      const service = createRecordService(clients);
      await service.ensureRegistered(keys, setUnlockPrompt);
      const exchange = createClaimExchange({
        ...clients,
        claimSettlement: body.claimSettlement,
        keys,
      });
      const settlement = createSettlement({
        publicClient: clients.publicClient,
        walletClient: clients.walletClient,
        claimSettlement: body.claimSettlement,
        mockUsd: body.mockUsd,
      });
      setSession({ address, keys, service, exchange, settlement });
    } catch (caught) {
      setError(plainRecordError(caught));
    } finally {
      setUnlocking(false);
      setUnlockPrompt("");
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
      unlockPrompt,
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
      unlockPrompt,
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
  const { connected, correctNetwork, ready, unlocking, unlockPrompt, error, unlock } =
    useRecordSession();
  const wallet = useWalletActions();
  const current = !connected ? 0 : !correctNetwork ? 1 : 2;
  const steps = [
    {
      title: "Connect wallet",
      detail: "Use the MetaMask account for this role.",
      label: !wallet.hasConnector
        ? "Wallet unavailable"
        : wallet.connecting
          ? "Connecting…"
          : "Connect wallet",
      disabled: !wallet.hasConnector || wallet.connecting,
      onClick: wallet.connectWallet,
    },
    {
      title: "Switch to Rado Local",
      detail: "Rado runs on the local demo network.",
      label: wallet.switching ? "Switching…" : "Switch network",
      disabled: wallet.switching,
      onClick: wallet.switchNetwork,
    },
    {
      title: "Unlock with one signature",
      detail: unlockPrompt || purpose,
      label: unlocking ? "Check your wallet…" : "Unlock Rado",
      disabled: !ready || unlocking,
      onClick: () => void unlock(),
    },
  ];
  const failure =
    current === 0 && wallet.connectFailed
      ? "Wallet connection failed. Check your wallet and try again."
      : current === 1 && wallet.switchFailed
        ? "Could not switch networks. Try again in your wallet."
        : current === 2
          ? error
          : "";

  return (
    <div className="rounded-lg border border-rado-line px-5">
      <ol className="divide-y divide-rado-line">
        {steps.map((step, index) => {
          const done = index < current;
          const active = index === current;
          return (
            <li
              aria-current={active ? "step" : undefined}
              className="flex flex-wrap items-center gap-x-4 gap-y-3 py-4"
              key={step.title}
            >
              <span
                className={`grid size-7 shrink-0 place-items-center rounded-full font-mono text-xs ${done ? "bg-rado-pale-green text-rado-green" : active ? "bg-rado-ink text-rado-on-ink" : "bg-rado-stone-wash text-rado-muted"}`}
              >
                {done ? <Icon name="check" className="size-4" /> : index + 1}
              </span>
              <div className="min-w-48 flex-1">
                <p className={`text-sm ${index > current ? "text-rado-muted" : "text-rado-ink"}`}>
                  {step.title}
                </p>
                {active ? (
                  <p className="mt-0.5 text-xs leading-5 text-rado-slate">{step.detail}</p>
                ) : null}
              </div>
              {active ? (
                <button
                  className="button-primary !px-4 !py-1.5 disabled:opacity-50"
                  disabled={step.disabled}
                  onClick={step.onClick}
                  type="button"
                >
                  {step.label}
                </button>
              ) : null}
            </li>
          );
        })}
      </ol>
      {failure ? (
        <p className="border-t border-rado-line py-3 text-sm text-rado-error" role="alert">
          {failure}
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

export function WalletPromptNotice({ text }: { text: string }) {
  if (!text) return null;
  return (
    <p
      aria-live="polite"
      className="motion-reveal mb-6 flex items-center gap-2 rounded-lg bg-rado-pale-blue px-4 py-3 text-sm text-rado-blue"
      role="status"
    >
      <Icon name="wallet" className="size-4" />
      {text}
    </p>
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
