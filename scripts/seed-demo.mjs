// Rebuilds the demo chain from zero on a fresh Hardhat node.
// It does not register keys, policies, or hospitals: those need MetaMask unlock keys (D-027).
// Usage: npm run seed --workspace @rado/contracts
import { execFileSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createHardhatRuntimeEnvironment } from "hardhat/hre";
import { createPublicClient, createWalletClient, http, parseAbi, parseEther } from "viem";
import { generatePrivateKey, mnemonicToAccount, privateKeyToAccount } from "viem/accounts";
import { hardhat } from "viem/chains";
import hardhatConfig from "../contracts/hardhat.config.ts";
import { contractsDir, deployRado, resolveVerifier } from "../contracts/scripts/deploy.ts";
import {
  CHAIN_ID,
  claimSettlementAbi,
  mockUsdAbi,
  recordAccessAbi,
  SAMPLE_POLICY,
} from "../packages/shared/src/index.ts";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const walletFile = join(contractsDir, ".env.demo-wallets");
const deploymentFile = join(contractsDir, "deployments", "localhost.json");
const rpcUrl = "http://127.0.0.1:8545";
const roles = ["deployer", "insurer", "patient", "hospital", "doctor", "responder"];
const publicHardhatMnemonic = "test test test test test test test test test test test junk";

function keyName(role) {
  return `RADO_DEMO_${role.toUpperCase()}_KEY`;
}

function assertIgnored(path) {
  try {
    execFileSync("git", ["check-ignore", "-q", path], { cwd: repoRoot });
  } catch {
    throw new Error(`${path} is not git-ignored. Refusing to write wallet keys.`);
  }
}

function loadOrCreateKeys() {
  assertIgnored(walletFile);
  const saved = existsSync(walletFile)
    ? Object.fromEntries(
        readFileSync(walletFile, "utf8")
          .split(/\r?\n/)
          .filter(Boolean)
          .map((line) => line.split("=")),
      )
    : {};
  const keys = Object.fromEntries(
    roles.map((role) => [role, saved[keyName(role)] ?? generatePrivateKey()]),
  );
  const body = roles.map((role) => `${keyName(role)}=${keys[role]}`).join("\n");
  writeFileSync(walletFile, `${body}\n`, { mode: 0o600 });
  chmodSync(walletFile, 0o600);
  return keys;
}

function assertNotPublicAccounts(accounts) {
  const banned = new Set(
    Array.from({ length: 20 }, (_, addressIndex) =>
      mnemonicToAccount(publicHardhatMnemonic, { addressIndex }).address.toLowerCase(),
    ),
  );
  for (const [role, account] of Object.entries(accounts)) {
    if (banned.has(account.address.toLowerCase())) {
      throw new Error(`The ${role} wallet is a public Hardhat account (Invariant 17).`);
    }
  }
}

async function main() {
  const transport = http(rpcUrl);
  const publicClient = createPublicClient({ chain: hardhat, transport });
  if ((await publicClient.getChainId()) !== CHAIN_ID)
    throw new Error("Wrong chain. Expected 31337.");

  const keys = loadOrCreateKeys();
  const accounts = Object.fromEntries(roles.map((role) => [role, privateKeyToAccount(keys[role])]));
  assertNotPublicAccounts(accounts);
  if ((await publicClient.getTransactionCount({ address: accounts.deployer.address })) !== 0) {
    throw new Error("This chain is already seeded. Restart the Hardhat node, then seed again.");
  }

  const hre = await createHardhatRuntimeEnvironment(hardhatConfig, {}, contractsDir);
  await hre.tasks.getTask("build").run({ quiet: true });
  const verifier = await resolveVerifier();
  if (verifier.placeholder)
    console.warn("[seed] PLACEHOLDER VERIFIER. Never rehearse or demo this.");

  // Lives only in this process and is never saved, so no demo laptop can appoint a responder (D-056).
  const responderAdmin = privateKeyToAccount(generatePrivateKey());
  for (const account of [...Object.values(accounts), responderAdmin]) {
    await publicClient.request({
      method: "hardhat_setBalance",
      params: [account.address, `0x${parseEther("100").toString(16)}`],
    });
  }

  const walletFor = (account) => createWalletClient({ account, chain: hardhat, transport });
  const addresses = await deployRado(
    publicClient,
    walletFor(accounts.deployer),
    accounts.insurer.address,
    responderAdmin.address,
    verifier,
  );

  const insurer = walletFor(accounts.insurer);
  const send = async (address, abi, functionName, args) => {
    const hash = await insurer.writeContract({ address, abi: parseAbi(abi), functionName, args });
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    if (receipt.status !== "success") throw new Error(`Seed step ${functionName} failed.`);
  };
  await send(addresses.mockUsd, mockUsdAbi, "mint", [
    accounts.insurer.address,
    SAMPLE_POLICY.totalCap,
  ]);
  await send(addresses.mockUsd, mockUsdAbi, "transfer", [
    addresses.claimSettlement,
    SAMPLE_POLICY.totalCap,
  ]);
  const responderHash = await walletFor(responderAdmin).writeContract({
    address: addresses.recordAccess,
    abi: parseAbi(recordAccessAbi),
    functionName: "setResponder",
    args: [accounts.responder.address, true],
  });
  const responderReceipt = await publicClient.waitForTransactionReceipt({ hash: responderHash });
  if (responderReceipt.status !== "success") throw new Error("Seed step setResponder failed.");

  const pool = await publicClient.readContract({
    address: addresses.mockUsd,
    abi: parseAbi(mockUsdAbi),
    functionName: "balanceOf",
    args: [addresses.claimSettlement],
  });
  const root = await publicClient.readContract({
    address: addresses.claimSettlement,
    abi: parseAbi(claimSettlementAbi),
    functionName: "hospitalRoot",
  });
  if (pool !== SAMPLE_POLICY.totalCap || root !== 0n) throw new Error("Seed verification failed.");

  mkdirSync(dirname(deploymentFile), { recursive: true });
  const wallets = Object.fromEntries(roles.map((role) => [role, accounts[role].address]));
  writeFileSync(
    deploymentFile,
    `${JSON.stringify({ chainId: CHAIN_ID, placeholder: verifier.placeholder, contracts: addresses, wallets, poolBaseUnits: pool.toString() }, null, 2)}\n`,
  );
  console.log(`[seed] deployed and funded the pool with ${pool} mUSD base units.`);
  console.log("[seed] addresses: contracts/deployments/localhost.json");
  console.log(
    "[seed] import wallets from contracts/.env.demo-wallets. Never share or commit that file.",
  );
  console.log(
    "[seed] next, in the app: unlock, register keys, approve the hospital, register the policy.",
  );
}

main().catch((error) => {
  console.error(`[seed] ${error instanceof Error ? error.message : "failed"}`);
  process.exit(1);
});
