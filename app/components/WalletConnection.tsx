"use client";

import { useAccount, useConnect, useDisconnect, useSwitchChain } from "wagmi";

import { radoChain } from "../app/wagmi";
import { Icon } from "./icons";

function shortAddress(address: string) {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

/** Shared by the header and the setup steps, so both connect and switch the same way. */
export function useWalletActions() {
  const connect = useConnect();
  const switchChain = useSwitchChain();
  const connector = connect.connectors[0];

  return {
    hasConnector: Boolean(connector),
    connectWallet: () => {
      if (connector) connect.mutate({ connector });
    },
    connecting: connect.isPending,
    connectFailed: connect.isError,
    switchNetwork: () =>
      switchChain.mutate({
        chainId: radoChain.id,
        // Wallets run outside this page, so they need the full URL when adding the network.
        addEthereumChainParameter: {
          rpcUrls: [new URL("/api/rpc", window.location.origin).href],
        },
      }),
    switching: switchChain.isPending,
    switchFailed: switchChain.isError,
  };
}

export function WalletConnection() {
  const account = useAccount();
  const disconnect = useDisconnect();
  const {
    hasConnector,
    connectWallet,
    connecting,
    connectFailed,
    switchNetwork,
    switching,
    switchFailed,
  } = useWalletActions();

  if (account.isConnected && account.address) {
    return (
      <div className="flex flex-wrap items-center justify-end gap-x-3 gap-y-1">
        <div className="flex items-center gap-2">
          <span
            className={`size-2 rounded-full ${account.chainId === radoChain.id ? "bg-rado-green" : "bg-rado-coral"}`}
          />
          <span className="font-mono text-xs text-rado-slate">{shortAddress(account.address)}</span>
          <span className="hidden border-l border-rado-line pl-2 text-xs text-rado-slate xl:inline">
            {account.chain?.name ?? "Unknown network"}
          </span>
        </div>
        {account.chainId !== radoChain.id ? (
          <button
            className="button-pill-outline disabled:opacity-50"
            disabled={switching}
            onClick={switchNetwork}
            type="button"
          >
            {switching ? "Switching…" : "Switch network"}
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
        {switchFailed ? (
          <p className="w-full text-right text-xs text-rado-error">
            Could not switch networks. Try again in your wallet.
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        className="button-primary whitespace-nowrap !px-3.5 !py-1.5"
        disabled={!hasConnector || connecting}
        onClick={connectWallet}
        type="button"
      >
        <Icon name="wallet" className="size-4" />
        {!hasConnector ? "Wallet unavailable" : connecting ? "Connecting…" : "Connect wallet"}
      </button>
      {connectFailed ? (
        <p className="max-w-52 text-right text-xs text-rado-error">
          Wallet connection failed. Check your wallet and try again.
        </p>
      ) : null}
    </div>
  );
}
