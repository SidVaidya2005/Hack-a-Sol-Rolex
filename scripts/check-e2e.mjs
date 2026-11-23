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
  MAX_DOCUMENT_BYTES,
  mockUsdAbi,
  PUBLIC_SIGNALS,
  recordAccessAbi,
  SAMPLE_CARE_RECORD,
  SAMPLE_EMERGENCY_SUMMARY,
  SAMPLE_POLICY,
  SAMPLE_RECORD,
  utf8Encode,
} from "../packages/shared/src/index.ts";
import { createClaimExchange } from "../app/lib/claim-exchange.ts";
import { escrowReaderAddress, escrowReleaseTypedData } from "../app/lib/escrow-auth.ts";
import { MAX_BUNDLE_BYTES, pinTypedData } from "../app/lib/pin-auth.ts";
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

  // W15 lab and pharmacy sharing
  const lab = await newUser(await newAccount());
  const pharmacy = await newUser(await newAccount());
  writeFileSync(
    join(workDir, "localhost.json"),
    JSON.stringify({
      chainId: hardhat.id,
      placeholder: false,
      contracts: addresses,
      wallets: {
        insurer: insurer.address,
        patient: patient.address,
        lab: lab.address,
        pharmacy: pharmacy.address,
      },
    }),
  );
  const providers = await patient.service.listProviders();
  report(
    "The provider directory lists providers and never the patient or insurer",
    providers.length === 2 &&
      providers.some(({ kind, wallet }) => kind === "lab" && wallet === lab.address) &&
      providers.some(({ kind, wallet }) => kind === "pharmacy" && wallet === pharmacy.address),
  );
  const careId = await patient.service.addRecord(
    patient.keys,
    utf8Encode(JSON.stringify(SAMPLE_CARE_RECORD)),
  );
  const { recordId: pharmacySlice } = await patient.service.shareSlice(
    patient.keys,
    careId,
    pharmacy.address,
    "pharmacy",
    1,
  );
  const { recordId: labSlice } = await patient.service.shareSlice(
    patient.keys,
    careId,
    lab.address,
    "lab",
    1,
  );
  const textOf = (rows) => rows.map(({ description }) => description).join("|");
  const pharmacyText = textOf(await pharmacy.service.open(pharmacy.keys, pharmacySlice));
  report(
    "The pharmacy reads prescriptions and allergies, and no diagnosis, procedure, or lab data",
    /Sample medication/.test(pharmacyText) &&
      /Sample drug allergy/.test(pharmacyText) &&
      !/chronic condition|imaging scan|blood panel/.test(pharmacyText),
  );
  const labText = textOf(await lab.service.open(lab.keys, labSlice));
  report(
    "The lab reads test orders and results, and no diagnosis, procedure, or prescription",
    /Sample blood panel result: Within sample range/.test(labText) &&
      !/chronic condition|imaging scan|Sample medication|allergy/.test(labText),
  );
  report(
    "The pharmacy cannot open the lab's copy",
    (await rejectionOf(() => pharmacy.service.open(pharmacy.keys, labSlice))) !== null,
  );
  report(
    "The lab cannot open the pharmacy's copy",
    (await rejectionOf(() => lab.service.open(lab.keys, pharmacySlice))) !== null,
  );
  report(
    "Neither provider can open the full source record",
    (await rejectionOf(() => pharmacy.service.open(pharmacy.keys, careId))) !== null &&
      (await rejectionOf(() => lab.service.open(lab.keys, careId))) !== null,
  );
  const { bundle: sourceBundle } = await patient.service.loadBundle(careId);
  report(
    "The source record gains no provider key",
    sourceBundle.wrappedKeys.length === 1 &&
      sourceBundle.wrappedKeys[0].reader.toLowerCase() === patient.address.toLowerCase(),
  );
  const { bundle: labBundle } = await patient.service.loadBundle(labSlice);
  report(
    "The pharmacy's key cannot decrypt the lab bundle",
    await decryptRecord(labBundle, pharmacy.address, pharmacy.keys.x25519SecretKey).then(
      () => false,
      () => true,
    ),
  );
  const profiles = await patient.service.sliceProfiles(patient.keys, [
    careId,
    pharmacySlice,
    labSlice,
  ]);
  report(
    "The patient's browser identifies each copy from its encrypted contents",
    profiles.get(careId) === null &&
      profiles.get(pharmacySlice) === "pharmacy" &&
      profiles.get(labSlice) === "lab",
  );
  report(
    "A limited copy cannot be sliced again",
    (await rejectionOf(() =>
      patient.service.shareSlice(patient.keys, labSlice, pharmacy.address, "pharmacy", 1),
    )) === "This record is already a limited copy.",
  );
  await patient.service.revoke(patient.keys, pharmacySlice, pharmacy.address);
  report(
    "Revoking the pharmacy ends its access",
    (await rejectionOf(() => pharmacy.service.open(pharmacy.keys, pharmacySlice))) !== null,
  );
  report(
    "Revoking the pharmacy leaves the lab's access working",
    /Within sample range/.test(textOf(await lab.service.open(lab.keys, labSlice))),
  );

  // W16 patient document upload
  writeFileSync(
    join(workDir, "localhost.json"),
    JSON.stringify({
      chainId: hardhat.id,
      placeholder: false,
      contracts: addresses,
      wallets: { doctor: doctor.address, lab: lab.address, pharmacy: pharmacy.address },
    }),
  );
  const documentMarker = `RadoW16Marker${randomBytes(6).toString("hex")}`;
  const documentName = `${documentMarker}.pdf`;
  const documentBytes = utf8Encode(`%PDF-1.4\n% ${documentMarker}\n%%EOF\n`);
  const sameBytes = (a, b) => Buffer.compare(Buffer.from(a), Buffer.from(b)) === 0;
  const documentId = await patient.service.addDocument(patient.keys, {
    name: documentName,
    category: "lab-report",
    bytes: documentBytes,
  });
  const ownDocument = await patient.service.openRecord(patient.keys, documentId);
  report(
    "The patient gets back the exact file, name, type, and category",
    ownDocument.kind === "document" &&
      sameBytes(ownDocument.document.bytes, documentBytes) &&
      ownDocument.document.name === documentName &&
      ownDocument.document.mime === "application/pdf" &&
      ownDocument.document.category === "lab-report",
  );
  // A new service has no remembered details, like a fresh browser session.
  const freshPatient = createRecordService({
    publicClient,
    walletClient: patient.walletClient,
    recordAccess: contracts.recordAccess,
    baseUrl: base,
  });
  const documentInfos = await freshPatient.recordInfos(patient.keys, [documentId, careId]);
  report(
    "A fresh session identifies the document from its encrypted contents",
    documentInfos.get(documentId)?.document?.name === documentName &&
      documentInfos.get(careId)?.document === null,
  );
  const blockBeforeRefusal = await publicClient.getBlockNumber();
  report(
    "A pharmacy cannot be granted a lab report",
    (await rejectionOf(() =>
      patient.service.grant(patient.keys, documentId, pharmacy.address, 1),
    )) === "A lab report cannot be shared with this wallet.",
  );
  report(
    "An unlisted wallet cannot be granted a document",
    (await rejectionOf(() =>
      patient.service.grant(patient.keys, documentId, outsider.address, 1),
    )) === "A lab report cannot be shared with this wallet.",
  );
  report(
    "Refused document shares send no transaction",
    (await publicClient.getBlockNumber()) === blockBeforeRefusal,
  );
  report(
    "A document cannot be split into a limited copy",
    (await rejectionOf(() =>
      patient.service.shareSlice(patient.keys, documentId, lab.address, "lab", 1),
    )) === "A document is shared whole and cannot be split into a copy.",
  );
  report(
    "A provider without access cannot open the document",
    (await rejectionOf(() => lab.service.openRecord(lab.keys, documentId))) !== null,
  );
  await patient.service.grant(patient.keys, documentId, lab.address, 1);
  await patient.service.grant(patient.keys, documentId, doctor.address, 1);
  const labDocument = await lab.service.openRecord(lab.keys, documentId);
  report(
    "An approved lab opens the exact document",
    labDocument.kind === "document" && sameBytes(labDocument.document.bytes, documentBytes),
  );
  report(
    "A provider's document view is logged on-chain",
    (await patient.service.timeline()).some(
      (entry) =>
        entry.recordId === documentId &&
        entry.title === "Record viewed" &&
        entry.actor?.toLowerCase() === lab.address.toLowerCase(),
    ),
  );
  await patient.service.revoke(patient.keys, documentId, lab.address);
  report(
    "Revoking the lab ends its document access",
    (await rejectionOf(() => lab.service.openRecord(lab.keys, documentId))) !== null,
  );
  const doctorDocument = await doctor.service.openRecord(doctor.keys, documentId);
  const rotatedDocument = await patient.service.openRecord(patient.keys, documentId);
  report(
    "After rotation, the doctor and patient still get the exact bytes",
    doctorDocument.kind === "document" &&
      sameBytes(doctorDocument.document.bytes, documentBytes) &&
      rotatedDocument.kind === "document" &&
      sameBytes(rotatedDocument.document.bytes, documentBytes),
  );
  report(
    "Break-glass cannot release an uploaded document",
    refused(await requestRelease(responder, documentId, await invoke(documentId)), 403),
  );
  const fullSizeBytes = new Uint8Array(MAX_DOCUMENT_BYTES);
  fullSizeBytes.set(documentBytes);
  const fullSizeIds = [];
  for (let index = 0; index < 5; index += 1) {
    fullSizeIds.push(
      await patient.service.addDocument(patient.keys, {
        name: `full-size-${index}.pdf`,
        category: "other",
        bytes: fullSizeBytes,
      }),
    );
  }
  await patient.service.grant(patient.keys, fullSizeIds[0], doctor.address, 1);
  const { bundle: fullSizeBundle } = await patient.service.loadBundle(fullSizeIds[0]);
  report(
    "A maximum-size document with a reader fits the bundle limit",
    encodeBundle(fullSizeBundle).length <= MAX_BUNDLE_BYTES,
  );
  report(
    "A file over the limit is refused",
    (await rejectionOf(() =>
      patient.service.addDocument(patient.keys, {
        name: "too-large.pdf",
        category: "other",
        bytes: new Uint8Array(MAX_DOCUMENT_BYTES + 1).fill(0x25),
      }),
    )) === "This file is larger than the 750 KB limit.",
  );
  // A new service measures a real first load, then the repeat that each screen refresh makes.
  const timedPatient = createRecordService({
    publicClient,
    walletClient: patient.walletClient,
    recordAccess: contracts.recordAccess,
    baseUrl: base,
  });
  const loadPatientScreen = async () => {
    const started = Date.now();
    const records = await timedPatient.listPatientRecords();
    await Promise.all([
      timedPatient.emergencySummaryIds(),
      timedPatient.recordInfos(
        patient.keys,
        records.map(({ recordId }) => recordId),
      ),
    ]);
    return Date.now() - started;
  };
  const firstLoadMs = await loadPatientScreen();
  const repeatLoadMs = await loadPatientScreen();
  console.log(
    `INFO  Patient screen with five maximum-size documents: first ${firstLoadMs} ms, repeat ${repeatLoadMs} ms`,
  );
  report("The first patient screen load finishes within 10 seconds", firstLoadMs < 10_000);
  report("A repeat patient screen load finishes within 2 seconds", repeatLoadMs < 2_000);
  const reloadedDocument = await timedPatient.openRecord(patient.keys, fullSizeIds[1]);
  report(
    "A document opened from the session cache still has its exact bytes",
    reloadedDocument.kind === "document" &&
      sameBytes(reloadedDocument.document.bytes, fullSizeBytes),
  );
  const chainLogs = await chainClient.getLogs({
    address: addresses.recordAccess,
    fromBlock: 0n,
  });
  const markerHex = Buffer.from(documentMarker).toString("hex");
  report(
    "The document's name and contents never appear on-chain",
    !chainLogs.some((log) => log.data.toLowerCase().includes(markerHex)),
  );

  const storedRecords = readdirSync(recordsDir)
    .map((name) => readFileSync(join(recordsDir, name), "utf8"))
    .join("");
  report(
    "Stored bundles hold no readable summary or record text",
    !/Test Patient Alpha|Sample drug allergy|O positive|Sample medication|Sample blood panel|Within sample range|share-slice|resourceType/.test(
      storedRecords,
    ),
  );
  report(
    "Stored bundles hold no readable document name, contents, or type",
    !storedRecords.includes(documentMarker) &&
      !storedRecords.includes(Buffer.from(documentMarker).toString("base64").slice(0, 16)) &&
      !/RADODOC1|application\/pdf|%PDF/.test(storedRecords),
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
