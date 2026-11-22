// Each rejection case breaks one rule. Hashes and signatures are recomputed
// around that change, and the test asserts which circuit line rejected it.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import * as snarkjs from "snarkjs";

import {
  AMOUNT_BITS,
  BN254_FIELD_PRIME as FIELD,
  CLAIM_DOMAIN,
  COVERED_TREE_DEPTH,
  DAY_BITS,
  HOSPITAL_TREE_DEPTH,
  PUBLIC_SIGNALS,
  claimHashInputs,
  coveredLeafInputs,
  hospitalLeafInputs,
  merkleNodeInputs,
  nullifierInputs,
  policyCommitmentInputs,
} from "../../packages/shared/src/index.ts";

const require = createRequire(import.meta.url);
const { wasm: wasmTester } = require("circom_tester");
const WitnessCalculator = require("circom_tester/wasm/witness_calculator");
const { buildEddsa, buildPoseidon } = require("circomlibjs");
const { keccak_256: keccak } = require("@noble/hashes/sha3.js");

const here = path.dirname(fileURLToPath(import.meta.url));
const circuitsDir = path.join(here, "..");
const repoRoot = path.join(circuitsDir, "..");
const circuitFile = path.join(circuitsDir, "src", "claim.circom");
const outputDir = path.join(circuitsDir, "build", "test");
const vector = JSON.parse(
  readFileSync(path.join(repoRoot, "packages", "shared", "vectors", "claim-valid.json"), "utf8"),
);

// circom_tester builds an unquoted shell command, so relative paths keep it
// working when a parent folder contains a space.
const fromCwd = (target) => path.relative(process.cwd(), target) || ".";

const circuitSource = readFileSync(circuitFile, "utf8");
const ruleLines = new Map();
circuitSource.split(/\r?\n/).forEach((line, index) => {
  const match = line.match(/\/\/ rule: ([a-z-]+)/);
  if (match) ruleLines.set(index + 1, match[1]);
});

function failedRule(message) {
  const frame = /Error in template (?:Claim|MerkleRoot)_\d+ line: (\d+)/.exec(message);
  return frame ? ruleLines.get(Number(frame[1])) : undefined;
}

describe("Claim(8, 6)", () => {
  let circuit;
  let wasmBytes;
  let poseidon;
  let eddsa;
  let hash;
  let base;
  let keys;

  const testKey = (name) => {
    const seed = keccak(new TextEncoder().encode(`rado/test-vector/${name}/v1`));
    const publicKey = eddsa.prv2pub(seed);
    return { seed, Ax: eddsa.F.toObject(publicKey[0]), Ay: eddsa.F.toObject(publicKey[1]) };
  };

  const sign = (key, message) => {
    const signature = eddsa.signPoseidon(key.seed, eddsa.F.e(message));
    return {
      S: signature.S,
      R8x: eddsa.F.toObject(signature.R8[0]),
      R8y: eddsa.F.toObject(signature.R8[1]),
    };
  };

  /**
   * Builds a fully re-signed claim. `change` replaces claim fields, and
   * `signedOver` lets one signer sign different claim values from the circuit input.
   */
  function buildClaim(change = {}, signedOver = {}) {
    const claim = { ...base, ...change };
    const policyCommitment =
      claim.policyCommitment ??
      hash(
        policyCommitmentInputs({
          patientAx: claim.patient.Ax,
          patientAy: claim.patient.Ay,
          expiryDay: claim.expiryDay,
          perClaimLimit: claim.perClaimLimit,
          coveredRoot: claim.coveredRoot,
          policySalt: claim.policySalt,
        }),
      );
    const nullifier = claim.nullifier ?? hash(nullifierInputs(claim.encounterId, claim.policySalt));
    const claimFields = {
      policyCommitment,
      encounterId: claim.encounterId,
      procedureCode: claim.procedureCode,
      claimAmount: claim.claimAmount,
      claimDay: claim.claimDay,
      payoutAddress: claim.payoutAddress,
    };
    const hashFor = (signer) => hash(claimHashInputs({ ...claimFields, ...signedOver[signer] }));
    const hospitalSig = sign(claim.hospitalSigner ?? claim.hospital, hashFor("hospital"));
    const patientSig = sign(claim.patientSigner ?? claim.patient, hashFor("patient"));

    const input = {
      claimAmount: claim.claimAmount,
      policyCommitment,
      nullifier,
      hospitalRoot: claim.hospitalRoot,
      claimDay: claim.claimDay,
      payoutAddress: claim.payoutAddress,
      procedureCode: claim.procedureCode,
      encounterId: claim.encounterId,
      policySalt: claim.policySalt,
      expiryDay: claim.expiryDay,
      perClaimLimit: claim.perClaimLimit,
      coveredRoot: claim.coveredRoot,
      coveredPathElements: claim.coveredPathElements,
      coveredPathIndices: claim.coveredPathIndices,
      patientAx: claim.patient.Ax,
      patientAy: claim.patient.Ay,
      patientS: patientSig.S,
      patientR8x: patientSig.R8x,
      patientR8y: patientSig.R8y,
      hospitalAx: claim.hospital.Ax,
      hospitalAy: claim.hospital.Ay,
      hospitalS: hospitalSig.S,
      hospitalR8x: hospitalSig.R8x,
      hospitalR8y: hospitalSig.R8y,
      hospitalPathElements: claim.hospitalPathElements,
      hospitalPathIndices: claim.hospitalPathIndices,
    };
    return JSON.parse(
      JSON.stringify(input, (_key, value) =>
        typeof value === "bigint" ? value.toString() : value,
      ),
    );
  }

  async function assertRejected(input, rule) {
    let failure;
    try {
      // A calculator keeps earlier error text, so each rejection needs a fresh one.
      const calculator = await WitnessCalculator(wasmBytes);
      await calculator.calculateWitness(input, true);
    } catch (error) {
      failure = error;
    }
    assert.ok(failure, `Expected rule ${rule} to reject this claim`);
    assert.equal(failedRule(failure.message), rule);
  }

  async function assertAccepted(input) {
    const witness = await circuit.calculateWitness(input, true);
    await circuit.checkConstraints(witness);
  }

  // Applies the circuit's path formula, including to a non-binary index.
  function rootWithIndices(leaf, elements, indices) {
    let node = leaf;
    elements.forEach((element, i) => {
      const bit = BigInt(indices[i]);
      const left = (node + bit * (element - node + FIELD)) % FIELD;
      const right = (element + bit * (node - element + FIELD)) % FIELD;
      node = hash(merkleNodeInputs(left, right));
    });
    return node;
  }

  before(
    async () => {
      poseidon = await buildPoseidon();
      eddsa = await buildEddsa();
      hash = (inputs) => poseidon.F.toObject(poseidon(inputs));
      keys = {
        patient: testKey("patient"),
        hospital: testKey("hospital"),
        otherHospital: testKey("other-hospital"),
        unapproved: testKey("unapproved-hospital"),
      };

      const input = vector.circuitInput;
      base = {
        claimAmount: BigInt(input.claimAmount),
        hospitalRoot: BigInt(input.hospitalRoot),
        claimDay: BigInt(input.claimDay),
        payoutAddress: BigInt(input.payoutAddress),
        procedureCode: BigInt(input.procedureCode),
        encounterId: BigInt(input.encounterId),
        policySalt: BigInt(input.policySalt),
        expiryDay: BigInt(input.expiryDay),
        perClaimLimit: BigInt(input.perClaimLimit),
        coveredRoot: BigInt(input.coveredRoot),
        coveredPathElements: input.coveredPathElements,
        coveredPathIndices: input.coveredPathIndices,
        hospitalPathElements: input.hospitalPathElements,
        hospitalPathIndices: input.hospitalPathIndices,
        patient: keys.patient,
        hospital: keys.hospital,
      };

      circuit = await wasmTester(fromCwd(circuitFile), {
        include: fromCwd(path.join(repoRoot, "node_modules")),
        output: fromCwd(outputDir),
      });

      wasmBytes = readFileSync(path.join(outputDir, "claim_js", "claim.wasm"));

      const info = await snarkjs.r1cs.info(path.join(outputDir, "claim.r1cs"));
      console.log(`Claim constraints for W04: ${info.nConstraints}`);
    },
    { timeout: 300_000 },
  );

  // snarkjs keeps curve worker threads open, which would stop the process exiting.
  after(async () => {
    await globalThis.curve_bn128?.terminate();
  });

  describe("valid claim", () => {
    it("uses the shared domain and tree depths", () => {
      assert.ok(circuitSource.includes(`var CLAIM_DOMAIN = ${CLAIM_DOMAIN};`));
      assert.ok(circuitSource.includes(`Claim(${HOSPITAL_TREE_DEPTH}, ${COVERED_TREE_DEPTH})`));
      assert.ok(circuitSource.includes(`var DAY_BITS = ${DAY_BITS};`));
      assert.ok(circuitSource.includes(`var AMOUNT_BITS = ${AMOUNT_BITS};`));
    });

    it("rebuilds the committed vector exactly", () => {
      assert.deepEqual(buildClaim(), vector.circuitInput);
    });

    it("accepts the committed vector", async () => {
      await assertAccepted(vector.circuitInput);
    });

    it("exposes exactly six public signals, in order, with no outputs", async () => {
      const info = await snarkjs.r1cs.info(path.join(outputDir, "claim.r1cs"));
      assert.equal(info.nOutputs, 0);
      assert.equal(info.nPubInputs, PUBLIC_SIGNALS.length);

      const witness = await circuit.calculateWitness(vector.circuitInput, true);
      const publicSignals = witness.slice(1, 1 + PUBLIC_SIGNALS.length).map(String);
      assert.deepEqual(publicSignals, vector.publicSignals);
      PUBLIC_SIGNALS.forEach((name, i) => {
        assert.equal(publicSignals[i], vector.circuitInput[name]);
      });

      await circuit.loadSymbols();
      PUBLIC_SIGNALS.forEach((name, i) => {
        assert.equal(circuit.symbols[`main.${name}`].varIdx, i + 1);
      });
    });

    it("accepts an amount equal to the per-claim limit", async () => {
      await assertAccepted(buildClaim({ claimAmount: base.perClaimLimit }));
    });

    it("accepts the largest in-range day and amount", async () => {
      const maxDay = 2n ** 32n - 1n;
      const maxAmount = 2n ** 64n - 1n;
      await assertAccepted(
        buildClaim({
          claimDay: maxDay - 1n,
          expiryDay: maxDay,
          claimAmount: maxAmount,
          perClaimLimit: maxAmount,
        }),
      );
    });
  });

  describe("policy rules", () => {
    it("rejects an unapproved hospital with a valid signature", async () => {
      await assertRejected(buildClaim({ hospital: keys.unapproved }), "hospital-root");
    });

    it("rejects an expired policy", async () => {
      await assertRejected(buildClaim({ claimDay: base.expiryDay + 1n }), "not-expired");
    });

    it("rejects a claim on the expiry day", async () => {
      await assertRejected(buildClaim({ claimDay: base.expiryDay }), "not-expired");
    });

    it("rejects an uncovered procedure", async () => {
      await assertRejected(buildClaim({ procedureCode: 9999n }), "covered-root");
    });

    it("rejects an amount over the per-claim limit", async () => {
      await assertRejected(buildClaim({ claimAmount: base.perClaimLimit + 1n }), "within-limit");
    });

    it("rejects a wrong policy commitment", async () => {
      await assertRejected(
        buildClaim({ policyCommitment: BigInt(vector.hashes.policyCommitment) + 1n }),
        "policy-commitment",
      );
    });

    it("rejects a different patient key under the same commitment", async () => {
      await assertRejected(
        buildClaim({
          patient: keys.otherHospital,
          policyCommitment: BigInt(vector.hashes.policyCommitment),
        }),
        "policy-commitment",
      );
    });

    it("rejects a wrong nullifier", async () => {
      await assertRejected(
        buildClaim({ nullifier: BigInt(vector.hashes.nullifier) + 1n }),
        "nullifier",
      );
    });
  });

  describe("claim binding", () => {
    const tampered = [
      ["amount", "claimAmount", (value) => value - 1n],
      ["day", "claimDay", (value) => value + 1n],
      ["payout address", "payoutAddress", (value) => value + 1n],
    ];

    for (const [label, field, change] of tampered) {
      it(`rejects a tampered ${label} at the hospital signature`, async () => {
        const original = { [field]: base[field] };
        const input = buildClaim(
          { [field]: change(base[field]) },
          { hospital: original, patient: original },
        );
        await assertRejected(input, "hospital-signature");
      });

      it(`rejects a tampered ${label} the patient did not approve`, async () => {
        const input = buildClaim(
          { [field]: change(base[field]) },
          { patient: { [field]: base[field] } },
        );
        await assertRejected(input, "patient-signature");
      });
    }
  });

  describe("signatures", () => {
    it("rejects a hospital signature from another key", async () => {
      await assertRejected(
        buildClaim({ hospitalSigner: keys.otherHospital }),
        "hospital-signature",
      );
    });

    it("rejects a patient signature from another key", async () => {
      await assertRejected(buildClaim({ patientSigner: keys.otherHospital }), "patient-signature");
    });
  });

  describe("range checks", () => {
    const negativeOne = FIELD - 1n;

    it("rejects a claim day that wraps around the field", async () => {
      await assertRejected(buildClaim({ claimDay: negativeOne }), "claim-day-range");
    });

    it("rejects an expiry day above 32 bits", async () => {
      await assertRejected(buildClaim({ expiryDay: 2n ** 32n }), "expiry-day-range");
    });

    it("rejects a claim amount that wraps around the field", async () => {
      await assertRejected(buildClaim({ claimAmount: negativeOne }), "claim-amount-range");
    });

    it("rejects a per-claim limit above 64 bits", async () => {
      await assertRejected(buildClaim({ perClaimLimit: 2n ** 64n }), "limit-range");
    });
  });

  describe("Merkle path indices", () => {
    it("rejects a non-binary hospital path index with a matching root", async () => {
      const hospitalPathIndices = [2, ...base.hospitalPathIndices.slice(1)];
      const leaf = hash(hospitalLeafInputs(keys.hospital.Ax, keys.hospital.Ay));
      const hospitalRoot = rootWithIndices(
        leaf,
        base.hospitalPathElements.map(BigInt),
        hospitalPathIndices,
      );
      await assertRejected(buildClaim({ hospitalPathIndices, hospitalRoot }), "path-index-binary");
    });

    it("rejects a non-binary covered path index with a matching root", async () => {
      const coveredPathIndices = [2, ...base.coveredPathIndices.slice(1)];
      const leaf = hash(coveredLeafInputs(base.procedureCode, base.policySalt));
      const coveredRoot = rootWithIndices(
        leaf,
        base.coveredPathElements.map(BigInt),
        coveredPathIndices,
      );
      await assertRejected(buildClaim({ coveredPathIndices, coveredRoot }), "path-index-binary");
    });
  });
});
