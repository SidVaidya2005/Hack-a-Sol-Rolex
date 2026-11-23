import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { mkdtempSync, rmSync, writeFileSync, copyFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { network } from "hardhat";
import { keccak256, stringToHex, zeroAddress, zeroHash } from "viem";
import { MAX_CLAIM_AGE_DAYS, SECONDS_PER_DAY } from "@rado/shared";
import { contractsDir, deployRado, resolveVerifier } from "../scripts/deploy.ts";

const { viem, networkHelpers } = await network.create();
const { assertions } = viem;
const DAY = BigInt(SECONDS_PER_DAY);
const POLICY = 111n;
const ROOT = 222n;
const CAP = 1_000n;
const POOL = 5_000n;
const pA = [1n, 2n] as const;
const pB = [
  [3n, 4n],
  [5n, 6n],
] as const;
const pC = [7n, 8n] as const;

const field = (tuple: unknown, index: number) => (tuple as readonly unknown[])[index];

async function today() {
  return BigInt(await networkHelpers.time.latest()) / DAY;
}

async function settlementFixture() {
  const [insurer, hospital, other] = await viem.getWalletClients();
  const usd = await viem.deployContract("MockUSD", [insurer.account.address]);
  const verifier = await viem.deployContract("MockGroth16Verifier");
  const settlement = await viem.deployContract("ClaimSettlement", [
    insurer.account.address,
    verifier.address,
    usd.address,
  ]);
  await usd.write.mint([settlement.address, POOL]);
  await settlement.write.registerPolicy([POLICY, CAP]);
  await settlement.write.updateHospitalRoot([ROOT, [9n]]);
  const signals = async (change: Partial<Record<0 | 1 | 2 | 3 | 4 | 5, bigint>> = {}) => {
    const base = [100n, POLICY, 333n, ROOT, await today(), BigInt(hospital.account.address)];
    for (const [index, value] of Object.entries(change)) base[Number(index)] = value;
    return base as unknown as readonly [bigint, bigint, bigint, bigint, bigint, bigint];
  };
  return { insurer, hospital, other, usd, verifier, settlement, signals };
}

async function recordFixture() {
  const [insurer, patient, doctor, responder, stranger, responderAdmin] =
    await viem.getWalletClients();
  const access = await viem.deployContract("RecordAccess", [responderAdmin.account.address]);
  const id = keccak256(stringToHex("synthetic-record"));
  const hash = keccak256(stringToHex("bundle-1"));
  const newHash = keccak256(stringToHex("bundle-2"));
  for (const wallet of [patient, doctor, responder]) {
    await access.write.registerKeys([1n, 2n, zeroHash], { account: wallet.account });
  }
  await access.write.anchorRecord([id, hash, "cid-1"], { account: patient.account });
  const future = BigInt(await networkHelpers.time.latest()) + 1_000n;
  return {
    insurer,
    patient,
    doctor,
    responder,
    stranger,
    responderAdmin,
    access,
    id,
    hash,
    newHash,
    future,
  };
}

describe("MockUSD", () => {
  it("has 6 decimals and only the insurer can mint", async () => {
    const { usd, other, insurer } = await networkHelpers.loadFixture(settlementFixture);
    assert.equal(await usd.read.decimals(), 6);
    await assertions.revertWithCustomErrorWithArgs(
      usd.write.mint([other.account.address, 1n], { account: other.account }),
      usd,
      "NotInsurer",
      [(value: string) => value.toLowerCase() === other.account.address],
    );
    await usd.write.mint([insurer.account.address, 1n]);
  });
});

describe("ClaimSettlement admin", () => {
  it("rejects non-insurer policy and root updates", async () => {
    const { settlement, other } = await networkHelpers.loadFixture(settlementFixture);
    await assertions.revertWithCustomError(
      settlement.write.registerPolicy([5n, 1n], { account: other.account }),
      settlement,
      "NotInsurer",
    );
    await assertions.revertWithCustomError(
      settlement.write.updateHospitalRoot([5n, []], { account: other.account }),
      settlement,
      "NotInsurer",
    );
  });

  it("rejects a duplicate policy and audits registration and root leaves", async () => {
    const { settlement } = await networkHelpers.loadFixture(settlementFixture);
    await assertions.revertWithCustomError(
      settlement.write.registerPolicy([POLICY, CAP]),
      settlement,
      "PolicyAlreadyRegistered",
    );
    const day = await today();
    await assertions.emitWithArgs(
      settlement.write.registerPolicy([77n, 5n]),
      settlement,
      "PolicyRegistered",
      [77n, (value: bigint) => value === day || value === day + 1n, 5n],
    );
    await assertions.emitWithArgs(
      settlement.write.updateHospitalRoot([88n, [1n, 2n]]),
      settlement,
      "HospitalRootUpdated",
      [88n, [1n, 2n]],
    );
    assert.equal(await settlement.read.hospitalRoot(), 88n);
  });
});

describe("submitClaim", () => {
  it("pays the hospital, records state, and emits ClaimSettled", async () => {
    const { settlement, usd, hospital, signals } =
      await networkHelpers.loadFixture(settlementFixture);
    const input = await signals();
    await assertions.emitWithArgs(
      settlement.write.submitClaim([pA, pB, pC, input]),
      settlement,
      "ClaimSettled",
      [
        333n,
        POLICY,
        (value: string) => value.toLowerCase() === hospital.account.address,
        100n,
        input[4],
        ROOT,
      ],
    );
    assert.equal(await usd.read.balanceOf([hospital.account.address]), 100n);
    assert.equal(await settlement.read.nullifierUsed([333n]), true);
    assert.equal(field(await settlement.read.policyOf([POLICY]), 2), 100n);
  });

  const rejections = [
    ["zero amount", "ZeroAmount", async () => ({ 0: 0n })],
    ["payout above 160 bits", "InvalidPayoutAddress", async () => ({ 5: 1n << 160n })],
    ["unknown policy", "UnknownPolicy", async () => ({ 1: 999n })],
    ["wrong root", "StaleHospitalRoot", async () => ({ 3: 999n })],
    ["future day", "ClaimDayInFuture", async () => ({ 4: (await today()) + 2n })],
    [
      "day too large for 64 bits",
      "ClaimDayInFuture",
      async () => ({ 4: (1n << 64n) + (await today()) }),
    ],
    [
      "day before policy start",
      "ClaimBeforePolicyStart",
      async () => ({ 4: (await today()) - 1n }),
    ],
    ["over total cap", "TotalCapExceeded", async () => ({ 0: CAP + 1n })],
    ["amount that would overflow", "TotalCapExceeded", async () => ({ 0: (1n << 256n) - 1n })],
  ] as const;

  for (const [label, error, change] of rejections) {
    it(`rejects ${label}`, async () => {
      const { settlement, signals } = await networkHelpers.loadFixture(settlementFixture);
      await assertions.revertWithCustomError(
        settlement.write.submitClaim([pA, pB, pC, await signals(await change())]),
        settlement,
        error,
      );
    });
  }

  it("rejects a claim older than 30 days but accepts exactly 30", async () => {
    const { settlement, signals } = await networkHelpers.loadFixture(settlementFixture);
    const claimDay = await today();
    await networkHelpers.time.increaseTo((claimDay + BigInt(MAX_CLAIM_AGE_DAYS)) * DAY + 10n);
    await settlement.write.submitClaim([pA, pB, pC, await signals({ 2: 1n, 4: claimDay })]);
    await networkHelpers.time.increaseTo((claimDay + BigInt(MAX_CLAIM_AGE_DAYS) + 1n) * DAY + 10n);
    await assertions.revertWithCustomError(
      settlement.write.submitClaim([pA, pB, pC, await signals({ 2: 2n, 4: claimDay })]),
      settlement,
      "ClaimTooOld",
    );
  });

  it("rejects a replayed nullifier and pays only once", async () => {
    const { settlement, usd, hospital, signals } =
      await networkHelpers.loadFixture(settlementFixture);
    const input = await signals();
    await settlement.write.submitClaim([pA, pB, pC, input]);
    await assertions.revertWithCustomError(
      settlement.write.submitClaim([pA, pB, pC, input]),
      settlement,
      "NullifierAlreadyUsed",
    );
    assert.equal(await usd.read.balanceOf([hospital.account.address]), 100n);
  });

  it("enforces the cap across claims and allows the exact cap", async () => {
    const { settlement, signals } = await networkHelpers.loadFixture(settlementFixture);
    await settlement.write.submitClaim([pA, pB, pC, await signals({ 0: CAP - 1n, 2: 1n })]);
    await assertions.revertWithCustomError(
      settlement.write.submitClaim([pA, pB, pC, await signals({ 0: 2n, 2: 2n })]),
      settlement,
      "TotalCapExceeded",
    );
    await settlement.write.submitClaim([pA, pB, pC, await signals({ 0: 1n, 2: 3n })]);
    assert.equal(field(await settlement.read.policyOf([POLICY]), 2), CAP);
  });

  it("rejects an invalid proof and changes no state", async () => {
    const { settlement, verifier, usd, hospital, signals } =
      await networkHelpers.loadFixture(settlementFixture);
    await verifier.write.setAccept([false]);
    await assertions.revertWithCustomError(
      settlement.write.submitClaim([pA, pB, pC, await signals()]),
      settlement,
      "InvalidProof",
    );
    assert.equal(await settlement.read.nullifierUsed([333n]), false);
    assert.equal(await usd.read.balanceOf([hospital.account.address]), 0n);
  });

  it("checks in the documented order when several checks fail", async () => {
    const { settlement, verifier, signals } = await networkHelpers.loadFixture(settlementFixture);
    await verifier.write.setAccept([false]);
    const day = await today();
    const used = await signals({ 2: 50n });
    await verifier.write.setAccept([true]);
    await settlement.write.submitClaim([pA, pB, pC, used]);
    await verifier.write.setAccept([false]);
    const bad = { 0: CAP + 1n, 1: POLICY, 2: 50n, 3: 999n, 4: day + 5n, 5: 1n << 160n };
    const steps: [Partial<typeof bad>, string][] = [
      [{ 0: 0n }, "ZeroAmount"],
      [{}, "InvalidPayoutAddress"],
      [{ 5: 1n, 1: 999n }, "UnknownPolicy"],
      [{ 5: 1n }, "StaleHospitalRoot"],
      [{ 5: 1n, 3: ROOT }, "NullifierAlreadyUsed"],
      [{ 5: 1n, 3: ROOT, 2: 51n, 4: day - 1n }, "ClaimBeforePolicyStart"],
      [{ 5: 1n, 3: ROOT, 2: 51n }, "ClaimDayInFuture"],
      [{ 5: 1n, 3: ROOT, 2: 51n, 4: day }, "TotalCapExceeded"],
      [{ 5: 1n, 3: ROOT, 2: 51n, 4: day, 0: 1n }, "InvalidProof"],
    ];
    for (const [change, error] of steps) {
      await assertions.revertWithCustomError(
        settlement.write.submitClaim([pA, pB, pC, await signals({ ...bad, ...change })]),
        settlement,
        error as "InvalidProof",
      );
    }
  });

  it("rolls back the claim if the pool cannot pay", async () => {
    const { insurer, hospital } = await networkHelpers.loadFixture(settlementFixture);
    const usd = await viem.deployContract("MockUSD", [insurer.account.address]);
    const verifier = await viem.deployContract("MockGroth16Verifier");
    const settlement = await viem.deployContract("ClaimSettlement", [
      insurer.account.address,
      verifier.address,
      usd.address,
    ]);
    await settlement.write.registerPolicy([POLICY, CAP]);
    await settlement.write.updateHospitalRoot([ROOT, []]);
    const input = [1n, POLICY, 5n, ROOT, await today(), BigInt(hospital.account.address)] as const;
    await assertions.revertWithCustomError(
      settlement.write.submitClaim([pA, pB, pC, input]),
      usd,
      "ERC20InsufficientBalance",
    );
    assert.equal(await settlement.read.nullifierUsed([5n]), false);
    assert.equal(field(await settlement.read.policyOf([POLICY]), 2), 0n);
  });
});

describe("RecordAccess", () => {
  it("refuses a zero responder admin", async () => {
    await assert.rejects(viem.deployContract("RecordAccess", [zeroAddress]), /NotResponderAdmin/);
  });

  it("refuses to deploy with the insurer as responder admin", async () => {
    const [insurer] = await viem.getWalletClients();
    const wallet = insurer.account.address;
    await assert.rejects(
      deployRado(null as never, null as never, wallet, wallet, null as never),
      /must be different wallets/,
    );
  });

  it("audits key registration and anchoring", async () => {
    const { access, stranger, id, hash } = await networkHelpers.loadFixture(recordFixture);
    await assertions.emit(
      access.write.registerKeys([3n, 4n, zeroHash], { account: stranger.account }),
      access,
      "KeysRegistered",
    );
    const other = keccak256(stringToHex("other"));
    await assertions.emit(
      access.write.anchorRecord([other, hash, "cid"], { account: stranger.account }),
      access,
      "RecordAnchored",
    );
    assert.equal(field(await access.read.recordOf([id]), 3), 1n);
  });

  it("rejects anchoring without keys and duplicate records", async () => {
    const { access, stranger, patient, id, hash } = await networkHelpers.loadFixture(recordFixture);
    await assertions.revertWithCustomError(
      access.write.anchorRecord([zeroHash, hash, "cid"], { account: stranger.account }),
      access,
      "KeysNotRegistered",
    );
    await assertions.revertWithCustomError(
      access.write.anchorRecord([id, hash, "cid"], { account: patient.account }),
      access,
      "RecordAlreadyExists",
    );
  });

  it("grant updates the bundle (D-031) and audits it", async () => {
    const { access, patient, doctor, id, newHash, future } =
      await networkHelpers.loadFixture(recordFixture);
    await assertions.emit(
      access.write.grantAccess([id, doctor.account.address, future, newHash, "cid-2"], {
        account: patient.account,
      }),
      access,
      "AccessGranted",
    );
    const record = await access.read.recordOf([id]);
    assert.equal(field(record, 1), newHash);
    assert.equal(field(record, 2), "cid-2");
    assert.equal(await access.read.hasAccess([id, doctor.account.address]), true);
  });

  it("rejects unauthorized and invalid grants", async () => {
    const { access, patient, doctor, stranger, id, newHash, future } =
      await networkHelpers.loadFixture(recordFixture);
    await assertions.revertWithCustomError(
      access.write.grantAccess([id, doctor.account.address, future, newHash, "x"], {
        account: doctor.account,
      }),
      access,
      "NotRecordPatient",
    );
    await assertions.revertWithCustomError(
      access.write.grantAccess([zeroHash, doctor.account.address, future, newHash, "x"], {
        account: patient.account,
      }),
      access,
      "UnknownRecord",
    );
    await assertions.revertWithCustomError(
      access.write.grantAccess([id, stranger.account.address, future, newHash, "x"], {
        account: patient.account,
      }),
      access,
      "KeysNotRegistered",
    );
    await assertions.revertWithCustomError(
      access.write.grantAccess([id, doctor.account.address, 1n, newHash, "x"], {
        account: patient.account,
      }),
      access,
      "InvalidExpiry",
    );
  });

  it("expired access cannot log a view but can still be revoked and rotated", async () => {
    const { access, patient, doctor, id, newHash, future } =
      await networkHelpers.loadFixture(recordFixture);
    await access.write.grantAccess([id, doctor.account.address, future, newHash, "cid-2"], {
      account: patient.account,
    });
    await assertions.emit(
      access.write.logView([id], { account: doctor.account }),
      access,
      "RecordViewed",
    );
    await networkHelpers.time.increaseTo(future + 1n);
    assert.equal(await access.read.hasAccess([id, doctor.account.address]), false);
    await assertions.revertWithCustomError(
      access.write.logView([id], { account: doctor.account }),
      access,
      "AccessNotActive",
    );
    await access.write.revokeAndRotate([id, doctor.account.address, newHash, "cid-3"], {
      account: patient.account,
    });
    assert.equal(field(await access.read.recordOf([id]), 3), 2n);
  });

  it("revoke removes access, rotates in one transaction, and audits both", async () => {
    const { access, patient, doctor, stranger, id, newHash, future } =
      await networkHelpers.loadFixture(recordFixture);
    await access.write.grantAccess([id, doctor.account.address, future, newHash, "cid-2"], {
      account: patient.account,
    });
    await assertions.revertWithCustomError(
      access.write.revokeAndRotate([id, doctor.account.address, newHash, "x"], {
        account: stranger.account,
      }),
      access,
      "NotRecordPatient",
    );
    const rotated = keccak256(stringToHex("bundle-3"));
    const txHash = await access.write.revokeAndRotate(
      [id, doctor.account.address, rotated, "cid-3"],
      {
        account: patient.account,
      },
    );
    await assertions.emit(Promise.resolve(txHash), access, "AccessRevoked");
    await assertions.emit(Promise.resolve(txHash), access, "RecordKeyRotated");
    assert.equal(await access.read.hasAccess([id, doctor.account.address]), false);
    assert.equal(await access.read.accessExpiry([id, doctor.account.address]), 0n);
    await assertions.revertWithCustomError(
      access.write.logView([id], { account: doctor.account }),
      access,
      "AccessNotActive",
    );
    await assertions.revertWithCustomError(
      access.write.revokeAndRotate([id, doctor.account.address, rotated, "x"], {
        account: patient.account,
      }),
      access,
      "AccessNotActive",
    );
  });

  it("restricts the responder registry and break-glass, and audits both", async () => {
    const { access, insurer, patient, doctor, responder, stranger, responderAdmin, id } =
      await networkHelpers.loadFixture(recordFixture);
    const patientAddress = patient.account.address;
    await assertions.revertWithCustomError(
      access.write.setResponder([responder.account.address, true], { account: stranger.account }),
      access,
      "NotResponderAdmin",
    );
    await assertions.revertWithCustomError(
      access.write.setResponder([insurer.account.address, true], { account: insurer.account }),
      access,
      "NotResponderAdmin",
    );
    await assertions.revertWithCustomError(
      access.write.invokeBreakGlass([patientAddress, id], { account: responder.account }),
      access,
      "NotResponder",
    );
    await assertions.emit(
      access.write.setResponder([responder.account.address, true], {
        account: responderAdmin.account,
      }),
      access,
      "ResponderUpdated",
    );
    await access.write.setResponder([stranger.account.address, true], {
      account: responderAdmin.account,
    });
    await assertions.revertWithCustomError(
      access.write.invokeBreakGlass([patientAddress, id], { account: stranger.account }),
      access,
      "KeysNotRegistered",
    );
    await assertions.revertWithCustomError(
      access.write.invokeBreakGlass([patientAddress, zeroHash], { account: responder.account }),
      access,
      "UnknownRecord",
    );
    await assertions.revertWithCustomError(
      access.write.invokeBreakGlass([doctor.account.address, id], { account: responder.account }),
      access,
      "NotRecordPatient",
    );
    await assertions.emit(
      access.write.invokeBreakGlass([patientAddress, id], { account: responder.account }),
      access,
      "BreakGlassInvoked",
    );
  });
});

describe("deployment guards", () => {
  it("refuses a missing real verifier without RADO_ALLOW_PLACEHOLDER=1", async () => {
    await assert.rejects(
      resolveVerifier({}, join(contractsDir, "missing.sol")),
      /real Groth16Verifier is missing/,
    );
  });

  it("refuses the placeholder copied into the real verifier path", async () => {
    const dir = mkdtempSync(join(tmpdir(), "rado-verifier-"));
    try {
      const copy = join(dir, "Groth16Verifier.sol");
      copyFileSync(
        join(contractsDir, "..", "circuits", "placeholder", "Groth16Verifier.sol"),
        copy,
      );
      await assert.rejects(
        resolveVerifier({ RADO_ALLOW_PLACEHOLDER: "1" }, copy),
        /is the placeholder/,
      );
      writeFileSync(copy, "// changed\n");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("keeps the mock verifier out of deployment and seed code", () => {
    for (const path of [
      join(contractsDir, "scripts", "deploy.ts"),
      join(contractsDir, "..", "scripts", "seed-demo.mjs"),
    ]) {
      assert.equal(readFileSync(path, "utf8").includes("MockGroth16"), false, path);
    }
  });
});
