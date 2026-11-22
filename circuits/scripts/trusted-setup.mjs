// Creates the demo proving files from one run of one circuit.
// Usage: node circuits/scripts/trusted-setup.mjs [--placeholder]
// Rerun after any circuit change, and commit every output together.
import "./retain-file-handles.mjs";
import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { copyFileSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, join, relative } from "node:path";
import { curves, powersOfTau, r1cs, zKey } from "snarkjs";
import {
  DEMO_WARNING,
  PLACEHOLDER_WARNING,
  circuitsDir,
  repoRoot,
  setupTarget,
  sha256File,
} from "./setup-targets.mjs";

const GITHUB_FILE_LIMIT_BYTES = 100 * 1024 * 1024;
const MIN_POWER = 8;

const target = setupTarget(process.argv.includes("--placeholder"));
const { buildDir, name, outputs } = target;

function step(message) {
  console.log(`[setup:${name}] ${message}`);
}

/** The entropy exists only in memory for one contribution and is never logged or saved. */
function entropy() {
  return randomBytes(64).toString("hex");
}

function compile() {
  const result = spawnSync(
    "circom",
    [
      target.source,
      "--r1cs",
      "--wasm",
      "--sym",
      "-l",
      join(repoRoot, "node_modules"),
      "-o",
      buildDir,
    ],
    { encoding: "utf8" },
  );
  if (result.error) throw new Error(`Could not run circom: ${result.error.message}`);
  if (result.status !== 0) throw new Error(`circom failed:\n${result.stdout}\n${result.stderr}`);
}

function circomVersion() {
  return spawnSync("circom", ["--version"], { encoding: "utf8" }).stdout.trim();
}

/** Matches the domain-size rule in snarkjs newZKey. */
function requiredPower(info) {
  const domain = info.nConstraints + info.nPubInputs + info.nOutputs + 1;
  return Math.max(MIN_POWER, Math.ceil(Math.log2(domain)));
}

async function run() {
  rmSync(buildDir, { recursive: true, force: true });
  mkdirSync(buildDir, { recursive: true });

  step("compiling circuit");
  const sourceHash = sha256File(target.source);
  compile();
  const stem = basename(target.source, ".circom");
  const r1csFile = join(buildDir, `${stem}.r1cs`);
  const wasmFile = join(buildDir, `${stem}_js`, `${stem}.wasm`);

  const info = await r1cs.info(r1csFile);
  if (info.nOutputs !== 0 || info.nPubInputs !== 6) {
    throw new Error(
      `Expected 6 public inputs and 0 outputs, got ${info.nPubInputs} and ${info.nOutputs}`,
    );
  }
  const power = requiredPower(info);
  step(`${info.nConstraints} constraints, using Powers of Tau power ${power}`);

  const curve = await curves.getCurveFromName("bn128");
  const ptau0 = join(buildDir, "pot_0000.ptau");
  const ptau1 = join(buildDir, "pot_0001.ptau");
  const ptauFinal = join(buildDir, "pot_final.ptau");
  const zkey0 = join(buildDir, "claim_0000.zkey");
  const zkeyFinal = join(buildDir, "final.zkey");

  step("running Powers of Tau");
  await powersOfTau.newAccumulator(curve, power, ptau0);
  await powersOfTau.contribute(ptau0, ptau1, "Rado demo phase 1", entropy());
  await powersOfTau.preparePhase2(ptau1, ptauFinal);

  step("creating proving key");
  await zKey.newZKey(r1csFile, ptauFinal, zkey0);
  await zKey.contribute(zkey0, zkeyFinal, "Rado demo phase 2", entropy());
  if (!(await zKey.verifyFromR1cs(r1csFile, ptauFinal, zkeyFinal))) {
    throw new Error("The proving key does not match the circuit and Powers of Tau");
  }

  step("exporting verification key and Solidity verifier");
  const verificationKey = await zKey.exportVerificationKey(zkeyFinal);
  const templatePath = join(
    repoRoot,
    "node_modules",
    "snarkjs",
    "templates",
    "verifier_groth16.sol.ejs",
  );
  const verifierSource = await zKey.exportSolidityVerifier(zkeyFinal, {
    groth16: readFileSync(templatePath, "utf8"),
  });
  const vkeyFile = join(buildDir, "verification_key.json");
  const verifierFile = join(buildDir, "Groth16Verifier.sol");
  writeFileSync(vkeyFile, `${JSON.stringify(verificationKey, null, 2)}\n`);
  writeFileSync(verifierFile, verifierSource.replace(/\r\n/g, "\n"));

  const built = {
    wasm: wasmFile,
    zkey: zkeyFinal,
    verificationKey: vkeyFile,
    verifier: verifierFile,
  };
  for (const [key, file] of Object.entries(built)) {
    const { size } = statSync(file);
    if (size >= GITHUB_FILE_LIMIT_BYTES) {
      throw new Error(
        `${key} is ${size} bytes, over GitHub's 100 MB limit. Nothing was copied. Stop and ask.`,
      );
    }
  }

  const files = {};
  for (const [key, file] of Object.entries(built)) {
    mkdirSync(dirname(outputs[key]), { recursive: true });
    copyFileSync(file, outputs[key]);
    const path = relative(repoRoot, outputs[key]).split("\\").join("/");
    files[key] = { path, bytes: statSync(outputs[key]).size, sha256: sha256File(outputs[key]) };
    step(`${path}: ${(files[key].bytes / 1024 / 1024).toFixed(2)} MB`);
  }

  const manifest = {
    placeholder: target.placeholder,
    demoOnly: true,
    warning: target.placeholder ? PLACEHOLDER_WARNING : DEMO_WARNING,
    circuit: relative(repoRoot, target.source).split("\\").join("/"),
    circuitSha256: sourceHash,
    compiler: circomVersion(),
    constraints: info.nConstraints,
    publicInputs: info.nPubInputs,
    outputs: info.nOutputs,
    powersOfTau: power,
    files,
  };
  writeFileSync(target.manifest, `${JSON.stringify(manifest, null, 2)}\n`);
  step(`wrote ${relative(circuitsDir, target.manifest).split("\\").join("/")}`);

  await curve.terminate();
}

run().catch(async (error) => {
  console.error(error);
  process.exitCode = 1;
  await globalThis.curve_bn128?.terminate();
});
