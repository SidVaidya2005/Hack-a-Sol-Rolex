import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync, copyFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import hardhatToolboxViemPlugin from "@nomicfoundation/hardhat-toolbox-viem";
import { createHardhatRuntimeEnvironment } from "hardhat/hre";
import type {
  Abi,
  Account,
  Address,
  Chain,
  Hex,
  PublicClient,
  Transport,
  WalletClient,
} from "viem";

export const contractsDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = resolve(contractsDir, "..");
const realVerifierPath = join(contractsDir, "contracts", "Groth16Verifier.sol");
const placeholderDir = join(repoRoot, "circuits", "placeholder");
const placeholderVerifierPath = join(placeholderDir, "Groth16Verifier.sol");

export interface Artifact {
  abi: Abi;
  bytecode: Hex;
}

export interface VerifierChoice {
  artifact: Artifact;
  placeholder: boolean;
}

type DeployWallet = WalletClient<Transport, Chain, Account>;

function sha256(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function readArtifact(root: string, source: string, name: string): Artifact {
  const path = join(root, "artifacts", "contracts", source, `${name}.json`);
  const { abi, bytecode } = JSON.parse(readFileSync(path, "utf8")) as Artifact;
  return { abi, bytecode };
}

async function buildPlaceholderVerifier(): Promise<Artifact> {
  const projectDir = join(contractsDir, "cache", "placeholder-verifier");
  rmSync(projectDir, { recursive: true, force: true });
  mkdirSync(join(projectDir, "contracts"), { recursive: true });
  writeFileSync(
    join(projectDir, "package.json"),
    '{ "name": "rado-placeholder", "private": true }\n',
  );
  copyFileSync(placeholderVerifierPath, join(projectDir, "contracts", "Groth16Verifier.sol"));
  const hre = await createHardhatRuntimeEnvironment(
    { plugins: [hardhatToolboxViemPlugin], solidity: { version: "0.8.34" } },
    {},
    projectDir,
  );
  await hre.tasks.getTask("build").run({ quiet: true });
  return readArtifact(projectDir, "Groth16Verifier.sol", "Groth16Verifier");
}

/** Picks the real verifier. The placeholder needs RADO_ALLOW_PLACEHOLDER=1 (Invariant 24). */
export async function resolveVerifier(
  env: NodeJS.ProcessEnv = process.env,
  realPath: string = realVerifierPath,
): Promise<VerifierChoice> {
  if (existsSync(realPath)) {
    if (sha256(realPath) === sha256(placeholderVerifierPath)) {
      throw new Error(
        "contracts/contracts/Groth16Verifier.sol is the placeholder. Refusing to deploy it.",
      );
    }
    return {
      artifact: readArtifact(contractsDir, "Groth16Verifier.sol", "Groth16Verifier"),
      placeholder: false,
    };
  }
  if (env.RADO_ALLOW_PLACEHOLDER !== "1") {
    throw new Error(
      "The real Groth16Verifier is missing. Finish W04, or set RADO_ALLOW_PLACEHOLDER=1 for development only.",
    );
  }
  return { artifact: await buildPlaceholderVerifier(), placeholder: true };
}

async function deploy(
  publicClient: PublicClient,
  wallet: DeployWallet,
  artifact: Artifact,
  args: readonly unknown[],
): Promise<Address> {
  const hash = await wallet.deployContract({
    abi: artifact.abi,
    bytecode: artifact.bytecode,
    args,
  });
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success" || !receipt.contractAddress) {
    throw new Error("A contract deployment failed.");
  }
  return receipt.contractAddress;
}

export async function deployRado(
  publicClient: PublicClient,
  deployer: DeployWallet,
  insurer: Address,
  responderAdmin: Address,
  verifier: VerifierChoice,
) {
  if (insurer.toLowerCase() === responderAdmin.toLowerCase()) {
    throw new Error("The insurer and responder admin must be different wallets (D-056).");
  }
  const verifierAddress = await deploy(publicClient, deployer, verifier.artifact, []);
  const mockUsd = await deploy(
    publicClient,
    deployer,
    readArtifact(contractsDir, "MockUSD.sol", "MockUSD"),
    [insurer],
  );
  const recordAccess = await deploy(
    publicClient,
    deployer,
    readArtifact(contractsDir, "RecordAccess.sol", "RecordAccess"),
    [responderAdmin],
  );
  const claimSettlement = await deploy(
    publicClient,
    deployer,
    readArtifact(contractsDir, "ClaimSettlement.sol", "ClaimSettlement"),
    [insurer, verifierAddress, mockUsd],
  );
  return { groth16Verifier: verifierAddress, mockUsd, recordAccess, claimSettlement };
}
