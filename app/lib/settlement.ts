import { claimSettlementAbi, mockUsdAbi, PUBLIC_SIGNALS, recordAccessAbi } from "@rado/shared";
import type { Address, Hex32 } from "@rado/shared";
import { getAddress, parseAbi, parseEventLogs } from "viem";
import type { AbiEvent, Chain, JsonRpcAccount, PublicClient, Transport, WalletClient } from "viem";

import { plainRecordError, RecordError, type RecordAccount } from "./record-service.ts";

const settlementAbi = parseAbi(claimSettlementAbi);
const accessAbi = parseAbi(recordAccessAbi);
const tokenAbi = parseAbi(mockUsdAbi);
const chainEvents = [...settlementAbi, ...accessAbi].filter(
  (item): item is Extract<typeof item, { type: "event" }> => item.type === "event",
) as unknown as AbiEvent[];

export interface SnarkProof {
  pi_a: string[];
  pi_b: string[][];
  pi_c: string[];
}

export interface SubmittableProof {
  proof: SnarkProof;
  publicSignals: readonly string[];
}

export interface SettlementReceipt {
  txHash: Hex32;
  blockNumber: bigint;
  amount: bigint;
  balanceBefore: bigint;
  balanceAfter: bigint;
}

export interface SettledClaim {
  id: string;
  nullifier: bigint;
  policyCommitment: bigint;
  payoutAddress: Address;
  claimAmount: bigint;
  claimDay: bigint;
  hospitalRoot: bigint;
  blockNumber: bigint;
  txHash: Hex32;
}

export interface LedgerEvent {
  id: string;
  name: string;
  blockNumber: bigint;
  txHash: Hex32;
  fields: [string, string][];
}

export interface LedgerPolicy {
  commitment: bigint;
  startDay: bigint;
  totalCap: bigint;
  totalPaid: bigint;
}

/** Everything here is already public on-chain. It holds no private claim value. */
export interface ChainLedger {
  latestBlock: bigint;
  poolBalance: bigint;
  totalPaid: bigint;
  totalCap: bigint;
  policies: LedgerPolicy[];
  claims: SettledClaim[];
  events: LedgerEvent[];
}

export interface LedgerContracts {
  recordAccess: Address;
  claimSettlement: Address;
  mockUsd: Address;
}

/** snarkjs and the Solidity verifier store each G2 coordinate pair in opposite order. */
export function toContractArgs({ proof, publicSignals }: SubmittableProof) {
  const [ax, ay] = proof.pi_a;
  const [b0, b1] = proof.pi_b;
  const [cx, cy] = proof.pi_c;
  if (
    !ax ||
    !ay ||
    !b0?.[0] ||
    !b0[1] ||
    !b1?.[0] ||
    !b1[1] ||
    !cx ||
    !cy ||
    publicSignals.length !== PUBLIC_SIGNALS.length
  ) {
    throw new RecordError("This proof is not in the expected format.");
  }
  return [
    [BigInt(ax), BigInt(ay)],
    [
      [BigInt(b0[1]), BigInt(b0[0])],
      [BigInt(b1[1]), BigInt(b1[0])],
    ],
    [BigInt(cx), BigInt(cy)],
    publicSignals.map(BigInt) as [bigint, bigint, bigint, bigint, bigint, bigint],
  ] as const;
}

export function createSettlement({
  publicClient,
  walletClient,
  claimSettlement,
  mockUsd,
}: {
  publicClient: PublicClient;
  walletClient: WalletClient<Transport, Chain, RecordAccount>;
  claimSettlement: Address;
  mockUsd: Address;
}) {
  // viem cannot infer simulate types for an account union. The real object is passed unchanged.
  const account = walletClient.account as JsonRpcAccount;

  const simulate = (claim: SubmittableProof) =>
    publicClient.simulateContract({
      address: claimSettlement,
      abi: settlementAbi,
      functionName: "submitClaim",
      args: toContractArgs(claim),
      account,
    });

  const balanceOf = (wallet: Address, blockNumber?: bigint) =>
    publicClient.readContract({
      address: mockUsd,
      abi: tokenAbi,
      functionName: "balanceOf",
      args: [wallet],
      blockNumber,
    });

  return {
    /** Simulates first, so a rejected claim gets a plain reason and opens no wallet prompt. */
    async submit(claim: SubmittableProof): Promise<SettlementReceipt> {
      const { request } = await simulate(claim);
      const amount = BigInt(claim.publicSignals[0] as string);
      const nullifier = BigInt(claim.publicSignals[2] as string);
      const payout = getAddress(
        `0x${BigInt(claim.publicSignals[5] as string)
          .toString(16)
          .padStart(40, "0")}`,
      );
      const balanceBefore = await balanceOf(payout);
      const txHash = await walletClient.writeContract(request);
      const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
      if (receipt.status !== "success") {
        throw new RecordError("The transaction failed. Nothing was paid.");
      }
      const settled = parseEventLogs({
        abi: settlementAbi,
        eventName: "ClaimSettled",
        logs: receipt.logs,
      }).some((log) => log.args.nullifier === nullifier && log.args.claimAmount === amount);
      if (!settled) throw new RecordError("The chain did not record this payout.");
      return {
        txHash,
        blockNumber: receipt.blockNumber,
        amount,
        balanceBefore,
        balanceAfter: await balanceOf(payout, receipt.blockNumber),
      };
    },

    /** Asks the contract to run the same claim again and returns its plain rejection reason. */
    async replayReason(claim: SubmittableProof): Promise<string> {
      try {
        await simulate(claim);
      } catch (error) {
        return plainRecordError(error);
      }
      throw new RecordError("The contract did not reject this replay.");
    },
  };
}

export type Settlement = ReturnType<typeof createSettlement>;

function fieldText(value: unknown): string {
  if (Array.isArray(value)) return `${value.length} approved`;
  return String(value);
}

/** Reads only public chain data, so it needs no wallet or unlock. */
export async function readChainLedger(
  publicClient: PublicClient,
  { recordAccess, claimSettlement, mockUsd }: LedgerContracts,
): Promise<ChainLedger> {
  const latestBlock = await publicClient.getBlockNumber();
  const [poolBalance, logs] = await Promise.all([
    publicClient.readContract({
      address: mockUsd,
      abi: tokenAbi,
      functionName: "balanceOf",
      args: [claimSettlement],
      blockNumber: latestBlock,
    }),
    publicClient.getLogs({
      address: [recordAccess, claimSettlement],
      events: chainEvents,
      fromBlock: 0n,
      toBlock: latestBlock,
    }),
  ]);

  const events: LedgerEvent[] = [];
  const claims: SettledClaim[] = [];
  const commitments: bigint[] = [];
  for (const log of logs) {
    const { eventName, args } = log as unknown as {
      eventName: string;
      args: Record<string, unknown>;
    };
    const id = `${log.transactionHash}:${log.logIndex}`;
    events.push({
      id,
      name: eventName,
      blockNumber: log.blockNumber,
      txHash: log.transactionHash,
      fields: Object.entries(args).map(([name, value]) => [name, fieldText(value)]),
    });
    if (eventName === "PolicyRegistered") commitments.push(args.policyCommitment as bigint);
    if (eventName === "ClaimSettled") {
      claims.push({
        id,
        nullifier: args.nullifier as bigint,
        policyCommitment: args.policyCommitment as bigint,
        payoutAddress: args.payoutAddress as Address,
        claimAmount: args.claimAmount as bigint,
        claimDay: BigInt(args.claimDay as bigint),
        hospitalRoot: args.hospitalRoot as bigint,
        blockNumber: log.blockNumber,
        txHash: log.transactionHash,
      });
    }
  }

  const policies = await Promise.all(
    commitments.map(async (commitment): Promise<LedgerPolicy> => {
      const [startDay, totalCap, totalPaid] = await publicClient.readContract({
        address: claimSettlement,
        abi: settlementAbi,
        functionName: "policyOf",
        args: [commitment],
        blockNumber: latestBlock,
      });
      return { commitment, startDay: BigInt(startDay), totalCap, totalPaid };
    }),
  );

  return {
    latestBlock,
    poolBalance,
    totalPaid: policies.reduce((sum, policy) => sum + policy.totalPaid, 0n),
    totalCap: policies.reduce((sum, policy) => sum + policy.totalCap, 0n),
    policies,
    claims: claims.reverse(),
    events: events.reverse(),
  };
}
