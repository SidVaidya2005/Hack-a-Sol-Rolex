import "../../circuits/scripts/retain-file-handles.mjs";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { after, describe, it } from "node:test";
import { network } from "hardhat";
import { groth16 } from "snarkjs";
import { PUBLIC_SIGNALS, SECONDS_PER_DAY } from "@rado/shared";
import vector from "@rado/shared/vectors/claim-valid.json" with { type: "json" };
import { contractsDir, resolveVerifier } from "../scripts/deploy.ts";

const repoRoot = join(contractsDir, "..");
const realManifest = join(repoRoot, "app", "public", "zk", "manifest.json");
const useReal =
  existsSync(join(contractsDir, "contracts", "Groth16Verifier.sol")) &&
  existsSync(realManifest) &&
  JSON.parse(readFileSync(realManifest, "utf8")).placeholder === false;
const zkDir = useReal
  ? join(repoRoot, "app", "public", "zk")
  : join(repoRoot, "circuits", "placeholder");
const wasm = join(zkDir, useReal ? "claim.wasm" : "placeholder.wasm");
const zkey = join(zkDir, useReal ? "claim_final.zkey" : "placeholder_final.zkey");
const circuitInput = vector.circuitInput as Record<string, unknown>;
const input = useReal
  ? circuitInput
  : Object.fromEntries(PUBLIC_SIGNALS.map((name) => [name, circuitInput[name]]));

type Six = readonly [bigint, bigint, bigint, bigint, bigint, bigint];
type Pair = readonly [bigint, bigint];

describe(`Groth16 settlement with the ${useReal ? "REAL" : "PLACEHOLDER"} verifier`, () => {
  after(() => {
    (globalThis as { curve_bn128?: { terminate(): void } }).curve_bn128?.terminate();
  });

  it("pays a valid proof, then rejects replay and tampered signals", async () => {
    const claimDay = BigInt(vector.publicSignals[4]);
    const { viem } = await network.create({
      override: { initialDate: new Date(Number(claimDay) * SECONDS_PER_DAY * 1000 + 3_600_000) },
    });
    const [insurer] = await viem.getWalletClients();
    const publicClient = await viem.getPublicClient();
    const choice = await resolveVerifier(useReal ? process.env : { RADO_ALLOW_PLACEHOLDER: "1" });
    assert.equal(choice.placeholder, !useReal);
    const hash = await insurer.deployContract({
      abi: choice.artifact.abi,
      bytecode: choice.artifact.bytecode,
    });
    const { contractAddress } = await publicClient.waitForTransactionReceipt({ hash });
    assert.ok(contractAddress);

    const usd = await viem.deployContract("MockUSD", [insurer.account.address]);
    const settlement = await viem.deployContract("ClaimSettlement", [
      insurer.account.address,
      contractAddress,
      usd.address,
    ]);
    const signals = vector.publicSignals.map(BigInt) as unknown as Six;
    const cap = BigInt(vector.policy.totalCap);
    await usd.write.mint([settlement.address, cap]);
    await settlement.write.registerPolicy([signals[1], cap]);
    await settlement.write.updateHospitalRoot([signals[3], vector.hospitalLeaves.map(BigInt)]);

    const { proof, publicSignals } = await groth16.fullProve(input, wasm, zkey);
    assert.deepEqual(publicSignals, vector.publicSignals);
    const [pA, pB, pC] = JSON.parse(
      `[${await groth16.exportSolidityCallData(proof, publicSignals)}]`,
    ).map((part: unknown) =>
      JSON.parse(JSON.stringify(part), (_key, value) =>
        typeof value === "string" ? BigInt(value) : value,
      ),
    ) as [Pair, readonly [Pair, Pair], Pair];

    const reject = (changed: Six, a: Pair, error: "InvalidProof" | "NullifierAlreadyUsed") =>
      viem.assertions.revertWithCustomError(
        settlement.write.submitClaim([a, pB, pC, changed]),
        settlement,
        error,
      );

    await reject(
      [signals[0] - 1n, signals[1], signals[2], signals[3], signals[4], signals[5]],
      pA,
      "InvalidProof",
    );
    await reject(
      [signals[0], signals[1], signals[2] + 1n, signals[3], signals[4], signals[5]],
      pA,
      "InvalidProof",
    );
    await reject(
      [signals[0], signals[1], signals[2], signals[3], signals[4], signals[5] + 1n],
      pA,
      "InvalidProof",
    );
    await reject(signals, [pA[0], pA[1] + 1n], "InvalidProof");

    await settlement.write.submitClaim([pA, pB, pC, signals]);
    assert.equal(await usd.read.balanceOf([vector.payoutAddressHex as `0x${string}`]), signals[0]);
    await reject(signals, pA, "NullifierAlreadyUsed");
  });
});
