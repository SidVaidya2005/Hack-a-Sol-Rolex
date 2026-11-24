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
import { DecryptText } from "./dossier";
import { Icon } from "./icons";
import { Badge } from "./ui";
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
      setUnlockPrompt("Confirm it's you in your wallet. This costs nothing.");
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
      const exchange = createClaimExchange({
        ...clients,
        claimSettlement: body.claimSettlement,
        keys,
      });
      const service = createRecordService({ ...clients, profileAccess: exchange });
      await service.ensureFunded();
      await service.ensureRegistered(keys, setUnlockPrompt);
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
      detail: "Use your MetaMask account.",
      label: !wallet.hasConnector
        ? "Wallet unavailable"
        : wallet.connecting
          ? "Connecting…"
          : "Connect wallet",
      disabled: !wallet.hasConnector || wallet.connecting,
      onClick: wallet.connectWallet,
    },
    {
      title: "Switch to the Rado network",
      detail: "Your wallet needs to be on the Rado network.",
      label: wallet.switching ? "Switching…" : "Switch network",
      disabled: wallet.switching,
      onClick: wallet.switchNetwork,
    },
    {
      title: "Secure sign-in",
      detail: unlockPrompt || purpose,
      label: unlocking ? "Check your wallet…" : "Sign in",
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
    <div className="entry-steps">
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
                className={`grid size-7 shrink-0 place-items-center rounded-full border font-mono text-[11px] ${done ? "border-rado-pale-green bg-rado-pale-green text-rado-green" : active ? "border-rado-primary bg-rado-primary text-white" : "border-rado-line text-rado-muted"}`}
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

const ITEM_KINDS: Record<string, string> = {
  Patient: "Patient",
  Condition: "Diagnosis",
  MedicationRequest: "Medication",
  AllergyIntolerance: "Allergy",
  Observation: "Result",
  Procedure: "Procedure",
  ServiceRequest: "Test order",
  DocumentReference: "Visit note",
};

export function RecordItems({
  items,
}: {
  items: { id: string; kind: string; description: string }[];
}) {
  return (
    <ul className="mt-4 divide-y divide-rado-line rounded-[10px] border border-rado-line bg-white px-3.5">
      {items.map((item) => (
        <li className="grid gap-x-4 gap-y-0.5 py-2.5 sm:grid-cols-[9rem_1fr]" key={item.id}>
          <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-rado-muted sm:pt-1">
            {ITEM_KINDS[item.kind] ?? "Health record"}
          </p>
          <p className="text-sm text-rado-ink">
            <DecryptText text={item.description} />
            <span className="ml-2 text-xs text-rado-muted">Patient-reported</span>
          </p>
        </li>
      ))}
    </ul>
  );
}

export function WalletPromptNotice({ text }: { text: string }) {
  if (!text) return null;
  return (
    <p aria-live="polite" className="wallet-slip motion-reveal mb-5" role="status">
      <span className="wallet-slip-label">Awaiting signature</span>
      {text}
    </p>
  );
}

export function StatusMessage({ message }: { message: { ok: boolean; text: string } | null }) {
  if (!message) return null;
  return (
    <p
      aria-live="polite"
      className={`${message.ok ? "status-success" : "status-error"} motion-reveal mb-5 flex items-center gap-3 border py-2.5 text-sm`}
      role="status"
    >
      <Badge tone={message.ok ? "info" : "warning"}>{message.ok ? "Filed" : "Refused"}</Badge>
      <span>{message.text}</span>
    </p>
  );
}
