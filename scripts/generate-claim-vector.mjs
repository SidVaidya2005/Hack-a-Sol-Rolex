// Generates packages/shared/vectors/claim-valid.json from public labels.
// The derived keys are public test values. Never use them for a demo wallet.

import { writeFileSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  BN254_FIELD_PRIME as FIELD,
  CLAIM_DOMAIN,
  COVERED_TREE_DEPTH,
  EMPTY_LEAF,
  HOSPITAL_TREE_DEPTH,
  REQUEST_DOMAIN,
  SAMPLE_CLAIM,
  SAMPLE_POLICY,
  SAMPLE_PROCEDURES,
  claimHashInputs,
  coveredLeafInputs,
  hospitalLeafInputs,
  merkleNodeInputs,
  nullifierInputs,
  policyCommitmentInputs,
  requestHashInputs,
} from "../packages/shared/src/index.ts";

const require = createRequire(import.meta.url);
const { buildEddsa, buildPoseidon } = require("circomlibjs");
const { keccak_256: keccak } = require("@noble/hashes/sha3.js");

const here = path.dirname(fileURLToPath(import.meta.url));
const outFile = path.join(here, "..", "packages", "shared", "vectors", "claim-valid.json");

const label = (name) => `rado/test-vector/${name}/v1`;
const labelBytes = (name) => keccak(new TextEncoder().encode(label(name)));
const toBigInt = (bytes) => BigInt(`0x${Buffer.from(bytes).toString("hex")}`);
const fieldFromLabel = (name) => toBigInt(labelBytes(name)) % FIELD;
const domainTag = (text) => toBigInt(keccak(new TextEncoder().encode(text))) % FIELD;

if (domainTag("rado/claim/v1") !== CLAIM_DOMAIN) throw new Error("CLAIM_DOMAIN is wrong");
if (domainTag("rado/request/v1") !== REQUEST_DOMAIN) throw new Error("REQUEST_DOMAIN is wrong");

const poseidon = await buildPoseidon();
const eddsa = await buildEddsa();
const hash = (inputs) => poseidon.F.toObject(poseidon(inputs));

function buildTree(leaves, depth) {
  if (leaves.length > 2 ** depth) throw new Error("Too many leaves");
  const levels = [[...leaves]];
  let empty = EMPTY_LEAF;
  for (let level = 0; level < depth; level += 1) {
    const current = levels[level];
    const next = [];
    for (let i = 0; i < current.length; i += 2) {
      next.push(hash(merkleNodeInputs(current[i], current[i + 1] ?? empty)));
    }
    levels.push(next);
    empty = hash(merkleNodeInputs(empty, empty));
  }
  return { levels, root: levels[depth][0] };
}

function merklePath(tree, leafIndex, depth) {
  const pathElements = [];
  const pathIndices = [];
  let empty = EMPTY_LEAF;
  let index = leafIndex;
  for (let level = 0; level < depth; level += 1) {
    const bit = index % 2;
    pathElements.push(tree.levels[level][bit === 0 ? index + 1 : index - 1] ?? empty);
    pathIndices.push(bit);
    index = Math.floor(index / 2);
    empty = hash(merkleNodeInputs(empty, empty));
  }
  return { pathElements, pathIndices };
}

function checkPath(leaf, proof, root) {
  let node = leaf;
  proof.pathElements.forEach((sibling, i) => {
    node = proof.pathIndices[i] === 0
      ? hash(merkleNodeInputs(node, sibling))
      : hash(merkleNodeInputs(sibling, node));
  });
  if (node !== root) throw new Error("Merkle path does not reach the root");
}

function testKey(name) {
  const seed = labelBytes(name);
  const publicKey = eddsa.prv2pub(seed);
  return {
    seed,
    publicKey,
    Ax: eddsa.F.toObject(publicKey[0]),
    Ay: eddsa.F.toObject(publicKey[1]),
  };
}

function sign(key, message) {
  const element = eddsa.F.e(message);
  const signature = eddsa.signPoseidon(key.seed, element);
  if (!eddsa.verifyPoseidon(element, signature, key.publicKey)) {
    throw new Error("Signature did not verify");
  }
  return {
    R8x: eddsa.F.toObject(signature.R8[0]),
    R8y: eddsa.F.toObject(signature.R8[1]),
    S: signature.S,
  };
}

const patient = testKey("patient");
const hospital = testKey("hospital");
const otherHospital = testKey("other-hospital");
const policySalt = fieldFromLabel("policy-salt");
const encounterId = fieldFromLabel("encounter-id");
const payoutBytes = labelBytes("payout-address").slice(12);
const payoutAddress = toBigInt(payoutBytes);
const payoutHex = `0x${Buffer.from(payoutBytes).toString("hex")}`;
const { procedureCode, claimAmount, claimDay } = SAMPLE_CLAIM;
const { expiryDay, perClaimLimit, totalCap } = SAMPLE_POLICY;

const hospitalLeaves = [hospital, otherHospital].map((key) =>
  hash(hospitalLeafInputs(key.Ax, key.Ay)),
);
const hospitalTree = buildTree(hospitalLeaves, HOSPITAL_TREE_DEPTH);
const hospitalPath = merklePath(hospitalTree, 0, HOSPITAL_TREE_DEPTH);
checkPath(hospitalLeaves[0], hospitalPath, hospitalTree.root);

const coveredCodes = SAMPLE_PROCEDURES.map((procedure) => procedure.code);
const coveredLeaves = coveredCodes.map((code) => hash(coveredLeafInputs(code, policySalt)));
const coveredIndex = coveredCodes.indexOf(procedureCode);
if (coveredIndex < 0) throw new Error("Sample procedure is not covered");
const coveredTree = buildTree(coveredLeaves, COVERED_TREE_DEPTH);
const coveredPath = merklePath(coveredTree, coveredIndex, COVERED_TREE_DEPTH);
checkPath(coveredLeaves[coveredIndex], coveredPath, coveredTree.root);

const terms = {
  patientAx: patient.Ax,
  patientAy: patient.Ay,
  expiryDay,
  perClaimLimit,
  coveredRoot: coveredTree.root,
  policySalt,
};
const policyCommitment = hash(policyCommitmentInputs(terms));
const nullifier = hash(nullifierInputs(encounterId, policySalt));
const claimFields = { encounterId, procedureCode, claimAmount, claimDay, payoutAddress };
const requestHash = hash(requestHashInputs(claimFields));
const claimHash = hash(claimHashInputs({ policyCommitment, ...claimFields }));

const requestSignature = sign(hospital, requestHash);
const hospitalSignature = sign(hospital, claimHash);
const patientSignature = sign(patient, claimHash);

const circuitInput = {
  claimAmount,
  policyCommitment,
  nullifier,
  hospitalRoot: hospitalTree.root,
  claimDay,
  payoutAddress,
  procedureCode,
  encounterId,
  policySalt,
  expiryDay,
  perClaimLimit,
  coveredRoot: coveredTree.root,
  coveredPathElements: coveredPath.pathElements,
  coveredPathIndices: coveredPath.pathIndices,
  patientAx: patient.Ax,
  patientAy: patient.Ay,
  patientS: patientSignature.S,
  patientR8x: patientSignature.R8x,
  patientR8y: patientSignature.R8y,
  hospitalAx: hospital.Ax,
  hospitalAy: hospital.Ay,
  hospitalS: hospitalSignature.S,
  hospitalR8x: hospitalSignature.R8x,
  hospitalR8y: hospitalSignature.R8y,
  hospitalPathElements: hospitalPath.pathElements,
  hospitalPathIndices: hospitalPath.pathIndices,
};

const vector = {
  warning: "Synthetic test vector. Its keys come from public labels and must never hold funds.",
  labels: ["patient", "hospital", "other-hospital", "policy-salt", "encounter-id", "payout-address"].map(label),
  payoutAddressHex: payoutHex,
  policy: { totalCap, coveredProcedures: coveredCodes },
  hospitalLeaves,
  hashes: {
    hospitalLeaf: hospitalLeaves[0],
    hospitalRoot: hospitalTree.root,
    coveredLeaf: coveredLeaves[coveredIndex],
    coveredRoot: coveredTree.root,
    policyCommitment,
    nullifier,
    requestHash,
    claimHash,
  },
  signatures: {
    hospitalOverRequest: requestSignature,
    hospitalOverClaim: hospitalSignature,
    patientOverClaim: patientSignature,
  },
  publicSignals: [claimAmount, policyCommitment, nullifier, hospitalTree.root, claimDay, payoutAddress],
  circuitInput,
};

const json = JSON.stringify(vector, (_key, value) => (typeof value === "bigint" ? value.toString() : value), 2);
mkdirSync(path.dirname(outFile), { recursive: true });
writeFileSync(outFile, `${json}\n`);
console.log(`Wrote ${path.relative(process.cwd(), outFile)}`);
