// W11 end-to-end claim flow on its own chain and app, so a running demo is never touched.
// Usage: npm run e2e            real proof and verifier, fails on any mock or placeholder
//        npm run e2e -- --draft development only, and never counts as a pass
// Works on Windows and macOS. Needs Node 26 and the committed proving files.
import "../circuits/scripts/retain-file-handles.mjs";
import { spawn, spawnSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { x25519 } from "@noble/curves/ed25519.js";
import { createHardhatRuntimeEnvironment } from "hardhat/hre";
import { groth16 } from "snarkjs";
import {
  createPublicClient,
  createWalletClient,
  hexToBytes,
  http,
  parseAbi,
  parseEther,
  parseEventLogs,
} from "viem";
import { generatePrivateKey, mnemonicToAccount, privateKeyToAccount } from "viem/accounts";
import { hardhat } from "viem/chains";
import hardhatConfig from "../contracts/hardhat.config.ts";
import { contractsDir, deployRado, resolveVerifier } from "../contracts/scripts/deploy.ts";
import {
  claimSettlementAbi,
  decryptRecord,
  eddsaPublicKey,
  encodeBundle,
  encryptRecord,
  hashBundleBytes,
  mockUsdAbi,
  PUBLIC_SIGNALS,
  recordAccessAbi,
  SAMPLE_EMERGENCY_SUMMARY,
  SAMPLE_POLICY,
  SAMPLE_RECORD,
  utf8Encode,
} from "../packages/shared/src/index.ts";
import { createClaimExchange } from "../app/lib/claim-exchange.ts";
import { escrowReaderAddress, escrowReleaseTypedData } from "../app/lib/escrow-auth.ts";
import { pinTypedData } from "../app/lib/pin-auth.ts";
import {
  createRecordService,
  describeEmergencySummary,
  plainRecordError,
} from "../app/lib/record-service.ts";
import { createSettlement, readChainLedger, toContractArgs } from "../app/lib/settlement.ts";

const draft = process.argv.includes("--draft");
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const appDir = join(repoRoot, "app");
const zkDir = join(appDir, "public", "zk");
const CHAIN_PORT = 8555;
const APP_PORT = 3100;
const chainUrl = `http://127.0.0.1:${CHAIN_PORT}`;
const base = `http://127.0.0.1:${APP_PORT}`;
const isWindows = process.platform === "win32";
const settlementAbi = parseAbi(claimSettlementAbi);
const tokenAbi = parseAbi(mockUsdAbi);
const publicHardhatMnemonic = "test test test test test test test test test test test junk";
const CLAIM_AMOUNT = 1_250_000_000n;
// Next adds its build folder to tsconfig in dev, so the script puts the tracked file back.
const tsconfigPath = join(appDir, "tsconfig.json");
const tsconfigBytes = readFileSync(tsconfigPath);

let failed = 0;
let workDir;
const children = [];

function report(name, passed) {
  if (!passed) failed += 1;
  console.log(`${passed ? "PASS" : "FAIL"}  ${name}`);
}

const sha256 = (path) => createHash("sha256").update(readFileSync(path)).digest("hex");
const wait = (ms) => new Promise((done) => setTimeout(done, ms));

function portFree(port) {
  return new Promise((done) => {
    const probe = createServer();
    probe.once("error", () => done(false));
    probe.listen(port, "127.0.0.1", () => probe.close(() => done(true)));
  });
}

/** Refuses a placeholder or changed proving file unless this is a draft (Invariant 24). */
function assertRealProvingFiles() {
  const manifest = JSON.parse(readFileSync(join(zkDir, "manifest.json"), "utf8"));
  const files = {
    wasm: join(zkDir, "claim.wasm"),
    zkey: join(zkDir, "claim_final.zkey"),
    verificationKey: join(zkDir, "verification_key.json"),
    verifier: join(contractsDir, "contracts", "Groth16Verifier.sol"),
  };
  const real =
    manifest.placeholder === false &&
    manifest.publicInputs === PUBLIC_SIGNALS.length &&
    Object.entries(files).every(
      ([name, path]) => existsSync(path) && sha256(path) === manifest.files[name]?.sha256,
    );
  if (!real && !draft) {
    throw new Error("A placeholder or changed proving file is present. Refusing to run.");
  }
  return real;
}

function start(name, args, cwd, env = {}) {
  const child = spawn(process.execPath, args, {
    cwd,
    detached: !isWindows,
    env: { ...process.env, ...env },
    stdio: ["ignore", "ignore", "ignore"],
  });
  children.push(child);
  child.label = name;
  return child;
}

/** Stops a child and its workers. Windows has no process groups, so it uses taskkill. */
function stop(child) {
  if (child.exitCode !== null) return;
  if (isWindows) {
    spawnSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], { stdio: "ignore" });
    return;
  }
  try {
    process.kill(-child.pid, "SIGTERM");
  } catch {}
}

async function waitFor(label, check) {
  for (let attempt = 0; attempt < 360; attempt += 1) {
    try {
      if (await check()) return;
    } catch {}
    await wait(500);
  }
  throw new Error(`${label} did not start.`);
}

const rpcOk = (url) =>
  fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_chainId", params: [] }),
  }).then((response) => response.ok);

async function rejectionOf(run) {
  try {
    await run();
    return null;
  } catch (error) {
    return plainRecordError(error);
  }
}

async function main() {
  if (!(await portFree(CHAIN_PORT)) || !(await portFree(APP_PORT))) {
    throw new Error(`Ports ${CHAIN_PORT} and ${APP_PORT} must be free.`);
  }
  const realFiles = assertRealProvingFiles();
  report("Proving files are real and match the manifest", realFiles);

  // Fresh chain and fresh wallets
  workDir = mkdtempSync(join(tmpdir(), "rado-e2e-"));
  mkdirSync(join(workDir, "cache"));
  start(
    "chain",
    [
      join(repoRoot, "node_modules", "hardhat", "dist", "src", "cli.js"),
      "node",
      "--port",
      String(CHAIN_PORT),
    ],
    contractsDir,
  );
  await waitFor("The chain", () => rpcOk(chainUrl));

  const direct = http(chainUrl, { timeout: 60_000 });
  const chainClient = createPublicClient({
    chain: hardhat,
    transport: direct,
    pollingInterval: 100,
  });
  const banned = new Set(
    Array.from({ length: 20 }, (_, addressIndex) =>
      mnemonicToAccount(publicHardhatMnemonic, { addressIndex }).address.toLowerCase(),
    ),
  );
  const newAccount = async () => {
    const account = privateKeyToAccount(generatePrivateKey());
    if (banned.has(account.address.toLowerCase())) throw new Error("Public wallet generated.");
    await chainClient.request({
      method: "hardhat_setBalance",
      params: [account.address, `0x${parseEther("10").toString(16)}`],
    });
    return account;
  };
  const deployerAccount = await newAccount();
  const insurerAccount = await newAccount();
  const responderAdminAccount = await newAccount();

  const hre = await createHardhatRuntimeEnvironment(hardhatConfig, {}, contractsDir);
  await hre.tasks.getTask("build").run({ quiet: true });
  const verifier = await resolveVerifier(draft ? process.env : {});
  if (verifier.placeholder && !draft) throw new Error("The verifier is a placeholder.");
  const walletOn = (account) => createWalletClient({ account, chain: hardhat, transport: direct });
  const addresses = await deployRado(
    chainClient,
    walletOn(deployerAccount),
    insurerAccount.address,
    responderAdminAccount.address,
    verifier,
  );
  const artifact = JSON.parse(
    readFileSync(
      join(contractsDir, "artifacts", "contracts", "Groth16Verifier.sol", "Groth16Verifier.json"),
      "utf8",
    ),
  );
  report(
    "The deployed verifier is the real generated contract",
    !verifier.placeholder &&
      (await chainClient.getCode({ address: addresses.groth16Verifier })) ===
        artifact.deployedBytecode,
  );

  const insurerWallet = walletOn(insurerAccount);
  for (const [functionName, args] of [
    ["mint", [insurerAccount.address, SAMPLE_POLICY.totalCap]],
    ["transfer", [addresses.claimSettlement, SAMPLE_POLICY.totalCap]],
  ]) {
    await chainClient.waitForTransactionReceipt({
      hash: await insurerWallet.writeContract({
        address: addresses.mockUsd,
        abi: tokenAbi,
        functionName,
        args,
      }),
    });
  }
  writeFileSync(
    join(workDir, "localhost.json"),
    JSON.stringify({ chainId: hardhat.id, placeholder: false, contracts: addresses }),
  );

  // Real app routes, pointed at this chain
  const escrowKey = `0x${randomBytes(32).toString("hex")}`;
  const startApp = async () => {
    const child = start(
      "app",
      [
        join(repoRoot, "node_modules", "next", "dist", "bin", "next"),
        "dev",
        "--hostname",
        "127.0.0.1",
        "--port",
        String(APP_PORT),
      ],
      appDir,
      { HARDHAT_RPC_URL: chainUrl, RADO_E2E_DIR: workDir, ESCROW_PRIVATE_KEY: escrowKey },
    );
    await waitFor("The app", () => rpcOk(`${base}/api/rpc`));
    return child;
  };
  let appChild = await startApp();

  const transport = http(`${base}/api/rpc`, { timeout: 120_000 });
  const publicClient = createPublicClient({ chain: hardhat, transport, pollingInterval: 100 });
  const contracts = await (await fetch(`${base}/api/contracts`)).json();
  report(
    "The app serves this run's three contract addresses",
    contracts.recordAccess === addresses.recordAccess &&
      contracts.claimSettlement === addresses.claimSettlement &&
      contracts.mockUsd === addresses.mockUsd,
  );

  // Writes straight to this run's cache, so the test never uploads to Pinata.
  const recordsDir = join(workDir, "cache", "records");
  const ownersDir = join(workDir, "cache", "record-owners");
  const storeBundle = async (bundle, owner) => {
    const bytes = encodeBundle(bundle);
    const alphabet = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
    const cid = `Qm${Array.from(randomBytes(44), (byte) => alphabet[byte % 58]).join("")}`;
    mkdirSync(recordsDir, { recursive: true });
    mkdirSync(ownersDir, { recursive: true });
    writeFileSync(join(recordsDir, `${cid}.json`), bytes);
    writeFileSync(join(ownersDir, bundle.recordId.slice(2).toLowerCase()), owner.toLowerCase());
    return { bundleHash: hashBundleBytes(bytes), cid };
  };

  async function newUser(account) {
    const eddsaSeed = randomBytes(32);
    const x25519Key = x25519.keygen();
    const keys = {
      eddsaSeed,
      eddsaPublicKey: await eddsaPublicKey(eddsaSeed),
      x25519SecretKey: x25519Key.secretKey,
      x25519PublicKey: x25519Key.publicKey,
    };
    const walletClient = createWalletClient({ account, chain: hardhat, transport });
    const config = {
      publicClient,
      walletClient,
      recordAccess: contracts.recordAccess,
      baseUrl: base,
      storeBundle: (bundle) => storeBundle(bundle, account.address),
    };
    const service = createRecordService(config);
    await service.ensureRegistered(keys);
    return {
      address: account.address,
      keys,
      service,
      walletClient,
      exchange: createClaimExchange({
        ...config,
        claimSettlement: contracts.claimSettlement,
        keys,
      }),
      settlement: createSettlement({
        publicClient,
        walletClient,
        claimSettlement: contracts.claimSettlement,
        mockUsd: contracts.mockUsd,
      }),
    };
  }

  const insurer = await newUser(insurerAccount);
  const patient = await newUser(await newAccount());
  const hospital = await newUser(await newAccount());
  const otherHospital = await newUser(await newAccount());

  const balance = (wallet) =>
    publicClient.readContract({
      address: contracts.mockUsd,
      abi: tokenAbi,
      functionName: "balanceOf",
      args: [wallet],
    });
  const pollFor = async (user, kind) => {
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const found = (await user.exchange.poll()).find((event) => event.kind === kind);
      if (found) return found;
      await wait(150);
    }
    throw new Error(`No ${kind} message arrived.`);
  };

  // Insurer, Hospital, Patient, Hospital
  await insurer.exchange.approveHospital(hospital.address);
  await insurer.exchange.issuePolicy(patient.address);
  const { terms } = await pollFor(patient, "terms");

  async function provedClaim(claimAmount) {
    await hospital.exchange.requestClaim({
      patient: patient.address,
      procedureCode: 1002n,
      claimAmount,
    });
    const incoming = await pollFor(patient, "request");
    await patient.exchange.approveClaim(incoming.body, hospital.address, terms);
    const approval = await pollFor(hospital, "approval");
    const input = await hospital.exchange.buildCircuitInput(approval.body);
    const result = await groth16.fullProve(
      input,
      join(zkDir, "claim.wasm"),
      join(zkDir, "claim_final.zkey"),
    );
    return { input, proof: result.proof, publicSignals: result.publicSignals };
  }

  const claim = await provedClaim(CLAIM_AMOUNT);
  const verificationKey = JSON.parse(readFileSync(join(zkDir, "verification_key.json"), "utf8"));
  report(
    "The real proof verifies off-chain",
    await groth16.verify(verificationKey, claim.publicSignals, claim.proof),
  );
  report(
    "Public signals are the six values in the required order",
    claim.publicSignals.length === 6 &&
      PUBLIC_SIGNALS.every((name, index) => claim.publicSignals[index] === claim.input[name]),
  );

  // Changed values must fail before anything is paid
  const changedAmount = [...claim.publicSignals];
  changedAmount[0] = (CLAIM_AMOUNT - 1n).toString();
  report(
    "A changed claim amount is rejected with a plain reason",
    (await rejectionOf(() =>
      hospital.settlement.submit({ proof: claim.proof, publicSignals: changedAmount }),
    )) === "The contract rejected this proof.",
  );
  const changedPayout = [...claim.publicSignals];
  changedPayout[5] = BigInt(otherHospital.address).toString();
  report(
    "A redirected payout is rejected with a plain reason",
    (await rejectionOf(() =>
      otherHospital.settlement.submit({ proof: claim.proof, publicSignals: changedPayout }),
    )) === "The contract rejected this proof.",
  );

  // Settlement
  const hospitalBefore = await balance(hospital.address);
  const poolBefore = await balance(contracts.claimSettlement);
  const receipt = await hospital.settlement.submit(claim);
  report(
    "The hospital balance rises by exactly the claim amount",
    (await balance(hospital.address)) === hospitalBefore + CLAIM_AMOUNT &&
      receipt.balanceAfter - receipt.balanceBefore === CLAIM_AMOUNT,
  );
  report(
    "The insurer pool falls by exactly the claim amount",
    (await balance(contracts.claimSettlement)) === poolBefore - CLAIM_AMOUNT,
  );
  const nullifier = BigInt(claim.input.nullifier);
  report(
    "The nullifier is recorded",
    await publicClient.readContract({
      address: contracts.claimSettlement,
      abi: settlementAbi,
      functionName: "nullifierUsed",
      args: [nullifier],
    }),
  );

  // Replay
  report(
    "A replay is rejected with a plain reason",
    (await hospital.settlement.replayReason(claim)) === "This claim was already submitted.",
  );
  // Skips the app's simulation, like a modified client. Hardhat reports the revert on send.
  const sentReplay = await rejectionOf(() =>
    hospital.walletClient.writeContract({
      address: contracts.claimSettlement,
      abi: settlementAbi,
      functionName: "submitClaim",
      args: toContractArgs(claim),
      gas: 1_000_000n,
    }),
  );
  report(
    "A replay sent as a real transaction reverts and pays nothing",
    sentReplay === "This claim was already submitted." &&
      (await balance(hospital.address)) === hospitalBefore + CLAIM_AMOUNT,
  );

  // Insurer and public data
  const ledger = await readChainLedger(publicClient, contracts);
  const settled = ledger.claims[0];
  report(
    "The ledger shows the one settled claim with its public values",
    ledger.claims.length === 1 &&
      settled.claimAmount === CLAIM_AMOUNT &&
      settled.nullifier === nullifier &&
      settled.policyCommitment === BigInt(claim.input.policyCommitment) &&
      settled.hospitalRoot === BigInt(claim.input.hospitalRoot) &&
      settled.claimDay === BigInt(claim.input.claimDay) &&
      settled.payoutAddress.toLowerCase() === hospital.address.toLowerCase(),
  );
  report(
    "The ledger reports pool, paid total, and cap",
    ledger.poolBalance === poolBefore - CLAIM_AMOUNT &&
      ledger.totalPaid === CLAIM_AMOUNT &&
      ledger.totalCap === SAMPLE_POLICY.totalCap,
  );
  const publicText = JSON.stringify(ledger, (_, value) =>
    typeof value === "bigint" ? value.toString() : value,
  );
  const privateValues = [
    claim.input.encounterId,
    claim.input.policySalt,
    claim.input.coveredRoot,
    claim.input.patientS,
    claim.input.hospitalS,
  ];
  report(
    "Insurer and public data hold no private claim value",
    !privateValues.some((value) => publicText.includes(value)) &&
      !/procedureCode|encounterId|policySalt|perClaimLimit/.test(publicText),
  );
  const inboxDir = join(workDir, "cache", "inbox");
  const stored = existsSync(inboxDir)
    ? readdirSync(inboxDir)
        .filter((name) => name.endsWith(".json"))
        .map((name) => readFileSync(join(inboxDir, name), "utf8"))
        .join("")
    : "";
  report(
    "No private claim value appears in stored inbox data",
    !privateValues.some((value) => stored.includes(value)),
  );

  // A proof made for an old approved list
  const staleClaim = await provedClaim(2_000_000n);
  await insurer.exchange.approveHospital(otherHospital.address);
  report(
    "A proof for an old hospital list is rejected with a plain reason",
    (await rejectionOf(() => hospital.settlement.submit(staleClaim))) ===
      "The approved hospital list changed. Generate a new proof.",
  );

  // W12 break-glass
  const accessAbi = parseAbi(recordAccessAbi);
  const responder = await newUser(await newAccount());
  const outsider = await newUser(await newAccount());
  const doctor = await newUser(await newAccount());
  report(
    "The insurer cannot appoint itself as a responder",
    await chainClient
      .simulateContract({
        account: insurerAccount,
        address: addresses.recordAccess,
        abi: accessAbi,
        functionName: "setResponder",
        args: [insurerAccount.address, true],
      })
      .then(
        () => false,
        (error) => String(error?.message).includes("NotResponderAdmin"),
      ),
  );
  const responderTx = await walletOn(responderAdminAccount).writeContract({
    address: addresses.recordAccess,
    abi: accessAbi,
    functionName: "setResponder",
    args: [responder.address, true],
  });
  await chainClient.waitForTransactionReceipt({ hash: responderTx });

  const fullRecordId = await patient.service.addRecord(
    patient.keys,
    utf8Encode(JSON.stringify(SAMPLE_RECORD)),
  );
  const summaryId = await patient.service.addEmergencySummary(
    patient.keys,
    utf8Encode(JSON.stringify(SAMPLE_EMERGENCY_SUMMARY)),
  );
  const target = { patient: patient.address, recordId: summaryId };
  const listed = await responder.service.listEmergencyPatients();
  report(
    "The responder finds only the patient's emergency summary",
    listed.length === 1 && listed[0].recordId === summaryId,
  );

  const invoke = async (recordId) => {
    const hash = await responder.walletClient.writeContract({
      address: contracts.recordAccess,
      abi: accessAbi,
      functionName: "invokeBreakGlass",
      args: [patient.address, recordId],
    });
    const invoked = await publicClient.waitForTransactionReceipt({ hash });
    const [log] = parseEventLogs({
      abi: accessAbi,
      logs: invoked.logs,
      eventName: "BreakGlassInvoked",
    });
    return { transactionHash: hash, logIndex: log.logIndex };
  };
  const requestRelease = async (user, recordId, event) => {
    const expiresAt = Math.floor(Date.now() / 1000) + 120;
    const signature = await user.walletClient.signTypedData({
      account: user.walletClient.account,
      ...escrowReleaseTypedData({
        wallet: user.address,
        recordId,
        ...event,
        expiresAt: BigInt(expiresAt),
      }),
    });
    const response = await fetch(`${base}/api/escrow/release`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ wallet: user.address, recordId, ...event, expiresAt, signature }),
    });
    const body = await response.json().catch(() => ({}));
    return { status: response.status, wrappedKey: body.wrappedKey };
  };
  const refused = (result, status) => result.status === status && !result.wrappedKey;

  report(
    "Release with a made-up transaction is refused",
    refused(
      await requestRelease(responder, summaryId, {
        transactionHash: `0x${randomBytes(32).toString("hex")}`,
        logIndex: 0,
      }),
      403,
    ),
  );
  report(
    "Release with a real transaction that is not break-glass is refused",
    refused(
      await requestRelease(responder, summaryId, { transactionHash: responderTx, logIndex: 0 }),
      403,
    ),
  );
  report(
    "An unregistered wallet cannot invoke break-glass",
    (await rejectionOf(() => outsider.service.openEmergencySummary(outsider.keys, target))) ===
      "This wallet is not a registered emergency responder.",
  );
  const event = await invoke(summaryId);
  report(
    "An unregistered wallet cannot use a real break-glass event",
    refused(await requestRelease(outsider, summaryId, event), 403),
  );
  report(
    "Break-glass on a full record releases nothing",
    refused(await requestRelease(responder, fullRecordId, await invoke(fullRecordId)), 403),
  );

  // A responder anchors their own record at the patient's summary CID, so the event avoids the patient.
  const [, , summaryCid] = await publicClient.readContract({
    address: contracts.recordAccess,
    abi: accessAbi,
    functionName: "recordOf",
    args: [summaryId],
  });
  const aliasId = `0x${randomBytes(32).toString("hex")}`;
  await publicClient.waitForTransactionReceipt({
    hash: await responder.walletClient.writeContract({
      address: contracts.recordAccess,
      abi: accessAbi,
      functionName: "anchorRecord",
      args: [aliasId, `0x${randomBytes(32).toString("hex")}`, summaryCid],
    }),
  });
  const aliasHash = await responder.walletClient.writeContract({
    address: contracts.recordAccess,
    abi: accessAbi,
    functionName: "invokeBreakGlass",
    args: [responder.address, aliasId],
  });
  const aliasReceipt = await publicClient.waitForTransactionReceipt({ hash: aliasHash });
  const [aliasLog] = parseEventLogs({
    abi: accessAbi,
    logs: aliasReceipt.logs,
    eventName: "BreakGlassInvoked",
  });
  report(
    "A record pointing at another patient's summary releases nothing",
    refused(
      await requestRelease(responder, aliasId, {
        transactionHash: aliasHash,
        logIndex: aliasLog.logIndex,
      }),
      403,
    ),
  );

  // A summary is pinned but not anchored yet, and a responder tries to anchor it first.
  const { publicKey: escrowHex } = await (await fetch(`${base}/api/escrow/release`)).json();
  const escrowPublicKey = hexToBytes(escrowHex);
  const pendingId = `0x${randomBytes(32).toString("hex")}`;
  const { bundle: pendingBundle } = await encryptRecord({
    recordId: pendingId,
    plaintext: utf8Encode(JSON.stringify(SAMPLE_EMERGENCY_SUMMARY)),
    readers: [
      { address: patient.address, x25519PublicKey: patient.keys.x25519PublicKey },
      { address: escrowReaderAddress(escrowPublicKey), x25519PublicKey: escrowPublicKey },
    ],
  });
  const pending = await storeBundle(pendingBundle, patient.address);
  const pendingBytes = encodeBundle(pendingBundle);
  const pinExpiresAt = Math.floor(Date.now() / 1000) + 120;
  const pinNonce = `0x${randomBytes(32).toString("hex")}`;
  const pinSignature = await responder.walletClient.signTypedData({
    account: responder.walletClient.account,
    ...pinTypedData({
      wallet: responder.address,
      bundleHash: pending.bundleHash,
      nonce: pinNonce,
      expiresAt: BigInt(pinExpiresAt),
    }),
  });
  const stolenPin = await fetch(`${base}/api/pin`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      bundle: Buffer.from(pendingBytes).toString("base64"),
      auth: {
        wallet: responder.address,
        nonce: pinNonce,
        expiresAt: pinExpiresAt,
        signature: pinSignature,
      },
    }),
  });
  report(
    "Another wallet cannot pin a record ID that already has an owner",
    stolenPin.status === 403,
  );
  await publicClient.waitForTransactionReceipt({
    hash: await responder.walletClient.writeContract({
      address: contracts.recordAccess,
      abi: accessAbi,
      functionName: "anchorRecord",
      args: [pendingId, pending.bundleHash, pending.cid],
    }),
  });
  const frontRunHash = await responder.walletClient.writeContract({
    address: contracts.recordAccess,
    abi: accessAbi,
    functionName: "invokeBreakGlass",
    args: [responder.address, pendingId],
  });
  const frontRunReceipt = await publicClient.waitForTransactionReceipt({ hash: frontRunHash });
  const [frontRunLog] = parseEventLogs({
    abi: accessAbi,
    logs: frontRunReceipt.logs,
    eventName: "BreakGlassInvoked",
  });
  report(
    "Anchoring another patient's pinned summary first releases nothing",
    refused(
      await requestRelease(responder, pendingId, {
        transactionHash: frontRunHash,
        logIndex: frontRunLog.logIndex,
      }),
      403,
    ),
  );

  const released = await requestRelease(responder, summaryId, event);
  const { bundle: summaryBundle } = await responder.service.loadBundle(summaryId);
  const items =
    released.status === 200
      ? describeEmergencySummary(
          await decryptRecord(
            { ...summaryBundle, wrappedKeys: [released.wrappedKey] },
            responder.address,
            responder.keys.x25519SecretKey,
          ),
        )
      : [];
  report(
    "A registered responder gets exactly the summary after the event",
    items.map(({ value }) => value).join("|") ===
      "Test Patient Alpha|Sample drug allergy|O positive",
  );
  report(
    "A repeated release is refused",
    refused(await requestRelease(responder, summaryId, event), 409),
  );

  stop(appChild);
  await waitFor("The stopped app's port", () => portFree(APP_PORT));
  appChild = await startApp();
  report(
    "A repeated release is still refused after a server restart",
    refused(await requestRelease(responder, summaryId, event), 409),
  );

  const opened = await responder.service.openEmergencySummary(responder.keys, target);
  report("The responder app flow opens a new event's summary", opened.length === 3);
  const emergencyEntries = (await patient.service.timeline()).filter(
    (entry) => entry.title === "Emergency access used",
  );
  report(
    "The patient timeline shows each emergency access and the responder",
    emergencyEntries.length === 3 &&
      emergencyEntries.every(
        (entry) => entry.actor?.toLowerCase() === responder.address.toLowerCase(),
      ),
  );

  await patient.service.grant(patient.keys, summaryId, doctor.address, 1);
  await patient.service.revoke(patient.keys, summaryId, doctor.address);
  const afterRevoke = await responder.service.openEmergencySummary(responder.keys, target);
  report(
    "Revoking a doctor rotates the summary key and keeps emergency access working",
    afterRevoke.length === 3 &&
      (await rejectionOf(() => doctor.service.open(doctor.keys, summaryId))) !== null,
  );
  const storedRecords = readdirSync(recordsDir)
    .map((name) => readFileSync(join(recordsDir, name), "utf8"))
    .join("");
  report(
    "Stored bundles hold no readable summary or record text",
    !/Test Patient Alpha|Sample drug allergy|O positive|resourceType/.test(storedRecords),
  );
  await globalThis.curve_bn128?.terminate?.();
}

function cleanup() {
  for (const child of children) stop(child);
  writeFileSync(tsconfigPath, tsconfigBytes);
  if (workDir) {
    try {
      rmSync(workDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    } catch {}
  }
}

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.once(signal, () => {
    cleanup();
    process.exit(1);
  });
}

main()
  .catch((error) => {
    failed += 1;
    console.error(`FAIL  E2E stopped: ${error instanceof Error ? error.message : "unknown error"}`);
  })
  .finally(async () => {
    cleanup();
    await wait(300);
    if (draft) {
      console.log("\nDRAFT run. This never counts as a pass.");
      process.exit(2);
    }
    console.log(failed === 0 ? "\nE2E passed." : `\n${failed} E2E check(s) failed.`);
    process.exit(failed === 0 ? 0 : 1);
  });
