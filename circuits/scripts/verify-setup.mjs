// Proves the committed setup works: snarkjs and Solidity accept the sample proof,
// and both reject it when any one of the six public signals changes.
// Usage: node circuits/scripts/verify-setup.mjs [--placeholder]
import "./retain-file-handles.mjs";
import assert from "node:assert/strict";
import { copyFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import hardhatToolboxViemPlugin from "@nomicfoundation/hardhat-toolbox-viem";
import { createHardhatRuntimeEnvironment } from "hardhat/hre";
import { groth16 } from "snarkjs";
import { BN254_FIELD_PRIME, PUBLIC_SIGNALS } from "../../packages/shared/src/constants.ts";
import { repoRoot, setupTarget, sha256File } from "./setup-targets.mjs";

const target = setupTarget(process.argv.includes("--placeholder"));
const vector = JSON.parse(
  readFileSync(join(repoRoot, "packages", "shared", "vectors", "claim-valid.json"), "utf8"),
);

function checkManifest() {
  const manifest = JSON.parse(readFileSync(target.manifest, "utf8"));
  assert.equal(manifest.placeholder, target.placeholder, "manifest placeholder flag");
  assert.equal(manifest.demoOnly, true, "manifest demo-only label");
  assert.equal(
    manifest.circuitSha256,
    sha256File(target.source),
    "circuit changed, rerun the setup",
  );
  for (const [key, path] of Object.entries(target.outputs)) {
    assert.equal(manifest.files[key].sha256, sha256File(path), `${key} is not from this setup run`);
  }
  return manifest;
}

function proofInput() {
  if (!target.placeholder) return vector.circuitInput;
  return Object.fromEntries(PUBLIC_SIGNALS.map((name) => [name, vector.circuitInput[name]]));
}

function tampered(signals, index) {
  const changed = [...signals];
  changed[index] = ((BigInt(changed[index]) + 1n) % BN254_FIELD_PRIME).toString();
  return changed;
}

async function deployVerifier() {
  const projectDir = join(target.buildDir, "solidity-check");
  rmSync(projectDir, { recursive: true, force: true });
  mkdirSync(join(projectDir, "contracts"), { recursive: true });
  writeFileSync(
    join(projectDir, "package.json"),
    '{ "name": "rado-verifier-check", "private": true }\n',
  );
  copyFileSync(target.outputs.verifier, join(projectDir, "contracts", "Groth16Verifier.sol"));

  const hre = await createHardhatRuntimeEnvironment(
    { plugins: [hardhatToolboxViemPlugin], solidity: { version: "0.8.34" } },
    {},
    projectDir,
  );
  await hre.tasks.getTask("build").run({ quiet: true });
  const connection = await hre.network.connect();
  const verifier = await connection.viem.deployContract("Groth16Verifier");
  return { connection, verifier };
}

async function main() {
  const manifest = checkManifest();
  console.log(
    `[verify:${target.name}] manifest and file hashes match, ${manifest.constraints} constraints`,
  );

  const started = Date.now();
  const { proof, publicSignals } = await groth16.fullProve(
    proofInput(),
    target.outputs.wasm,
    target.outputs.zkey,
  );
  console.log(`[verify:${target.name}] proof generated in ${Date.now() - started} ms`);

  assert.deepEqual(
    publicSignals,
    PUBLIC_SIGNALS.map((name) => String(vector.circuitInput[name])),
    "public signals are out of order",
  );
  assert.deepEqual(
    publicSignals,
    vector.publicSignals.map(String),
    "public signals differ from the vector",
  );
  console.log(`[verify:${target.name}] public signal order: ${PUBLIC_SIGNALS.join(", ")}`);

  const verificationKey = JSON.parse(readFileSync(target.outputs.verificationKey, "utf8"));
  assert.equal(
    await groth16.verify(verificationKey, publicSignals, proof),
    true,
    "snarkjs rejected the proof",
  );
  console.log(`[verify:${target.name}] snarkjs accepts the sample proof`);

  const callData = await groth16.exportSolidityCallData(proof, publicSignals);
  const [pA, pB, pC, solidityPublic] = JSON.parse(`[${callData}]`);
  const { connection, verifier } = await deployVerifier();
  try {
    assert.equal(
      await verifier.read.verifyProof([pA, pB, pC, solidityPublic]),
      true,
      "Solidity rejected the proof",
    );
    console.log(`[verify:${target.name}] Solidity verifier accepts the sample proof`);

    for (const [index, name] of PUBLIC_SIGNALS.entries()) {
      const changed = tampered(publicSignals, index);
      assert.equal(
        await groth16.verify(verificationKey, changed, proof),
        false,
        `snarkjs accepted changed ${name}`,
      );
      const changedCall = changed.map(
        (value) => `0x${BigInt(value).toString(16).padStart(64, "0")}`,
      );
      assert.equal(
        await verifier.read.verifyProof([pA, pB, pC, changedCall]),
        false,
        `Solidity accepted changed ${name}`,
      );
      console.log(`[verify:${target.name}] changed ${name}: rejected by snarkjs and Solidity`);
    }
  } finally {
    await connection.close();
  }
  console.log(`[verify:${target.name}] all checks passed`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => globalThis.curve_bn128?.terminate());
