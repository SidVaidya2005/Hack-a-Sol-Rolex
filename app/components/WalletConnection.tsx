"use client";

import { useAccount, useConnect, useDisconnect, useSwitchChain } from "wagmi";

import { radoChain } from "../app/wagmi";
import { Icon } from "./icons";

function shortAddress(address: string) {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

export function WalletConnection() {
  const account = useAccount();
  const connect = useConnect();
  const disconnect = useDisconnect();
  const switchChain = useSwitchChain();
  const connector = connect.connectors[0];

  if (account.isConnected && account.address) {
    return (
      <div className="flex flex-wrap items-center justify-end gap-x-3 gap-y-1">
        <div className="flex items-center gap-2">
          <span className={`size-2 rounded-full ${account.chainId === radoChain.id ? "bg-rado-green" : "bg-rado-coral"}`} />
          <span className="font-mono text-xs text-rado-slate">{shortAddress(account.address)}</span>
          <span className="hidden border-l border-rado-line pl-2 text-xs text-rado-slate xl:inline">{account.chain?.name ?? "Unknown network"}</span>
        </div>
        {account.chainId !== radoChain.id ? (
          <button
            className="button-pill-outline disabled:opacity-50"
            disabled={switchChain.isPending}
            onClick={() => switchChain.mutate({ chainId: radoChain.id })}
            type="button"
          >
            {switchChain.isPending ? "Switching…" : "Switch network"}
          </button>
        ) : null}
        <button
          aria-label="Disconnect wallet"
          className="button-secondary"
          onClick={() => disconnect.mutate()}
          type="button"
        >
          Disconnect
        </button>
        {switchChain.isError ? <p className="w-full text-right text-xs text-rado-error">Could not switch networks. Try again in your wallet.</p> : null}
      </div>
    );
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        className="button-primary !px-4 !py-1.5"
        disabled={!connector || connect.isPending}
        onClick={() => connector && connect.mutate({ connector })}
        type="button"
      >
        <Icon name="wallet" className="size-4" />
        {!connector ? "Wallet unavailable" : connect.isPending ? "Connecting…" : "Connect wallet"}
      </button>
      {connect.isError ? <p className="max-w-52 text-right text-xs text-rado-error">Wallet connection failed. Check your wallet and try again.</p> : null}
    </div>
  );
}
