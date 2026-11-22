import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { artifacts } from "hardhat";
import { parseAbi, type Abi, type AbiParameter } from "viem";
import { claimSettlementAbi, mockUsdAbi, recordAccessAbi } from "@rado/shared";

function parameter(item: AbiParameter & { indexed?: boolean }) {
  return { name: item.name ?? "", type: item.type, indexed: item.indexed ?? false };
}

function normalize(abi: Abi) {
  return abi
    .filter((item) => item.type !== "constructor")
    .map((item) => {
      if (item.type === "function") {
        return {
          type: item.type,
          name: item.name,
          stateMutability: item.stateMutability,
          inputs: item.inputs.map(parameter),
          outputs: item.outputs.map(parameter),
        };
      }
      if (item.type === "event" || item.type === "error") {
        return { type: item.type, name: item.name, inputs: item.inputs.map(parameter) };
      }
      return { type: item.type, name: "", inputs: [] };
    })
    .sort((a, b) => `${a.type}:${a.name}`.localeCompare(`${b.type}:${b.name}`));
}

describe("compiled ABIs match packages/shared/src/abi.ts", async () => {
  for (const [name, shared] of [
    ["MockUSD", mockUsdAbi],
    ["RecordAccess", recordAccessAbi],
    ["ClaimSettlement", claimSettlementAbi],
  ] as const) {
    it(name, async () => {
      const artifact = await artifacts.readArtifact(name);
      // OpenZeppelin's inherited ERC-20 errors are the only allowed additions.
      const compiled = (artifact.abi as Abi).filter(
        (item) => !(name === "MockUSD" && item.type === "error" && item.name.startsWith("ERC20")),
      );
      assert.deepEqual(normalize(compiled), normalize(parseAbi(shared) as Abi));
    });
  }
});
