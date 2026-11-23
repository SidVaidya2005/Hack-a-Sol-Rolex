// Proves the W10 exchange against a running, seeded chain and app, with throwaway wallets.
// Usage: node scripts/check-claim-exchange.mjs [app-url]   (default http://127.0.0.1:3000)
// For an HTTPS app, set NODE_EXTRA_CA_CERTS to app/certificates/ca.pem.
import "../circuits/scripts/retain-file-handles.mjs";
import { randomBytes } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { x25519 } from "@noble/curves/ed25519.js";
import { groth16 } from "snarkjs";
import { createPublicClient, createWalletClient, http, parseAbi, parseEther } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { hardhat } from "viem/chains";
import {
  eddsaPublicKey,
  eddsaSign,
  encryptInboxMessage,
  inboxCiphertextHash,
  PUBLIC_SIGNALS,
  SAMPLE_POLICY,
  SAMPLE_UNCOVERED_PROCEDURE,
  signInboxRequest,
} from "../packages/shared/src/index.ts";
import { claimProblem, createClaimExchange, derivePolicyTerms } from "../app/lib/claim-exchange.ts";
import { createRecordService, plainRecordError } from "../app/lib/record-service.ts";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const base = process.argv[2] ?? "http://127.0.0.1:3000";
const inboxDir = join(repoRoot, "app", ".cache", "inbox");
const verifierAbi = parseAbi([
  "function verifyProof(uint256[2] _pA, uint256[2][2] _pB, uint256[2] _pC, uint256[6] _pubSignals) view returns (bool)",
]);

let failed = 0;
function report(name, passed) {
  if (!passed) failed += 1;
  console.log(`${passed ? "PASS" : "FAIL"}  ${name}`);
}

async function refused(run) {
  try {
    await run();
    return false;
  } catch {
    return true;
  }
}

async function main() {
  const transport = http(`${base}/api/rpc`, { timeout: 60_000 });
  const publicClient = createPublicClient({ chain: hardhat, transport, pollingInterval: 100 });
  const contracts = await (await fetch(`${base}/api/contracts`)).json();
  const { recordAccess, claimSettlement } = contracts;
  report(
    "The contracts route returns both addresses",
    /^0x[0-9a-fA-F]{40}$/.test(recordAccess) && /^0x[0-9a-fA-F]{40}$/.test(claimSettlement),
  );
  const deployment = JSON.parse(
    readFileSync(join(repoRoot, "contracts", "deployments", "localhost.json"), "utf8"),
  );
  const walletKeys = Object.fromEntries(
    readFileSync(join(repoRoot, "contracts", ".env.demo-wallets"), "utf8")
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => line.split("=")),
  );
  const funder = createWalletClient({
    account: privateKeyToAccount(walletKeys.RADO_DEMO_DEPLOYER_KEY),
    chain: hardhat,
    transport,
  });

  async function newUser(privateKey = generatePrivateKey()) {
    const account = privateKeyToAccount(privateKey);
    await publicClient.waitForTransactionReceipt({
      hash: await funder.sendTransaction({ to: account.address, value: parseEther("1") }),
    });
    const eddsaSeed = randomBytes(32);
    const x25519Key = x25519.keygen();
    const keys = {
      eddsaSeed,
      eddsaPublicKey: await eddsaPublicKey(eddsaSeed),
      x25519SecretKey: x25519Key.secretKey,
      x25519PublicKey: x25519Key.publicKey,
    };
    const walletClient = createWalletClient({ account, chain: hardhat, transport });
    const config = { publicClient, walletClient, recordAccess, baseUrl: base };
    await createRecordService(config).ensureRegistered(keys);
    const exchange = createClaimExchange({ ...config, claimSettlement, keys });
    return { address: account.address, keys, exchange };
  }

  const insurer = await newUser(walletKeys.RADO_DEMO_INSURER_KEY);
  const patient = await newUser();
  const hospital = await newUser();
  const stranger = await newUser();

  /** Sends any plaintext straight to a recipient, like a modified client would. */
  async function sendRaw(sender, recipient, plaintext) {
    const envelope = await encryptInboxMessage({
      sender: sender.address,
      recipient: recipient.address,
      recipientX25519PublicKey: recipient.keys.x25519PublicKey,
      plaintext,
    });
    const post = async () => {
      const auth = await signInboxRequest({
        action: "send",
        wallet: sender.address,
        eddsaSeed: sender.keys.eddsaSeed,
        ciphertextHash: inboxCiphertextHash(envelope.ciphertext),
      });
      return fetch(`${base}/api/inbox`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ envelope, auth }),
      });
    };
    return { envelope, post };
  }
  const deliver = async (sender, recipient, plaintext) => {
    const { post } = await sendRaw(sender, recipient, plaintext);
    if (!(await post()).ok) throw new Error("raw send failed");
  };
  const rejectedBy = async (user) =>
    (await user.exchange.poll()).filter((event) => event.kind === "rejected");

  // Insurer setup
  report(
    "A non-insurer cannot approve a hospital",
    await refused(() => stranger.exchange.approveHospital(hospital.address)),
  );
  report(
    "A non-insurer cannot register a policy",
    await refused(() => stranger.exchange.issuePolicy(patient.address)),
  );
  report(
    "An unapproved hospital cannot request a claim",
    await refused(() =>
      hospital.exchange.requestClaim({
        patient: patient.address,
        procedureCode: 1002n,
        claimAmount: 1_000_000n,
      }),
    ),
  );
  await insurer.exchange.approveHospital(hospital.address);
  report(
    "The insurer approves a hospital",
    await hospital.exchange.hospitalIsApproved(hospital.address),
  );
  report(
    "Approving the same hospital again adds nothing",
    (await insurer.exchange.approveHospital(hospital.address)) === false,
  );

  // Policy delivery and resend
  const first = await insurer.exchange.issuePolicy(patient.address);
  report("A policy is registered on first issue", first.newlyRegistered === true);
  const delivered = (await patient.exchange.poll()).find((event) => event.kind === "terms");
  report("The patient receives checked policy terms", Boolean(delivered));
  const terms = delivered.terms;
  const resent = await insurer.exchange.issuePolicy(patient.address);
  report("A resend does not register a second policy", resent.newlyRegistered === false);
  const again = (await patient.exchange.poll()).find((event) => event.kind === "terms");
  report(
    "A resend delivers identical terms",
    again?.commitment === delivered.commitment && again.terms.policySalt === terms.policySalt,
  );

  // Forged messages are stopped before they can be shown
  const fakeTerms = await derivePolicyTerms(
    randomBytes(32),
    patient.address,
    patient.keys.eddsaPublicKey,
  );
  await deliver(stranger, patient, { type: "policy-terms", body: fakeTerms });
  let events = await patient.exchange.poll();
  report(
    "Forged policy terms are rejected",
    events.some((event) => event.kind === "rejected") && !events.some((e) => e.kind === "terms"),
  );

  // Claim request
  const request = await hospital.exchange.requestClaim({
    patient: patient.address,
    procedureCode: 1002n,
    claimAmount: 1_250_000_000n,
  });
  const block = await publicClient.getBlock();
  report(
    "The claim day comes from the latest block",
    BigInt(request.claimDay) === block.timestamp / 86_400n,
  );
  const incoming = (await patient.exchange.poll()).find((event) => event.kind === "request");
  report("The patient receives a checked claim request", Boolean(incoming));
  report("A valid claim has no patient-side problem", claimProblem(incoming.body, terms) === null);

  const forgedRequests = {
    "a bad hospital signature": {
      ...request,
      encounterId: "77",
      hospitalSignature: await eddsaSign(randomBytes(32), 5n),
    },
    "another hospital's key": {
      ...request,
      encounterId: "78",
      hospitalPublicKey: stranger.keys.eddsaPublicKey,
    },
    "a changed amount": { ...request, claimAmount: "1" },
    "a redirected payout": { ...request, payoutAddress: stranger.address.toLowerCase() },
  };
  for (const [label, body] of Object.entries(forgedRequests)) {
    await deliver(stranger, patient, { type: "claim-request", body });
    events = await patient.exchange.poll();
    report(
      `A forged request with ${label} is rejected before it is shown`,
      events.some((event) => event.kind === "rejected") &&
        !events.some((event) => event.kind === "request"),
    );
  }
  const signedByStranger = {
    ...request,
    hospitalPublicKey: stranger.keys.eddsaPublicKey,
    payoutAddress: stranger.address.toLowerCase(),
  };
  await deliver(stranger, patient, { type: "claim-request", body: signedByStranger });
  report(
    "A request from an unapproved hospital is rejected",
    (await rejectedBy(patient)).length === 1,
  );

  report(
    "An uncovered procedure is stopped on the patient side",
    claimProblem(
      { ...request, procedureCode: SAMPLE_UNCOVERED_PROCEDURE.code.toString() },
      terms,
    ) !== null,
  );
  report(
    "An amount over the per-claim limit is stopped on the patient side",
    claimProblem(
      { ...request, claimAmount: (SAMPLE_POLICY.perClaimLimit + 1n).toString() },
      terms,
    ) !== null,
  );
  report(
    "Approval refuses a claim the policy does not cover",
    await refused(() =>
      patient.exchange.approveClaim(
        { ...request, procedureCode: SAMPLE_UNCOVERED_PROCEDURE.code.toString() },
        hospital.address,
        terms,
      ),
    ),
  );

  // Retry and storage
  const retry = await sendRaw(hospital, patient, { type: "claim-request", body: request });
  await retry.post();
  const duplicate = await (await retry.post()).json();
  report("A retried message creates no duplicate", duplicate.duplicate === true);
  if (existsSync(inboxDir)) {
    const file = join(inboxDir, `${retry.envelope.messageId}.json`);
    const stored = existsSync(file) ? readFileSync(file, "utf8") : "";
    report(
      "The server stores only ciphertext and routing data",
      stored.length > 0 &&
        !["encounterId", "procedureCode", "claimAmount", "policySalt", request.encounterId].some(
          (term) => stored.includes(term),
        ),
    );
  } else {
    console.log("SKIP  Stored ciphertext check needs the host laptop");
  }
  await patient.exchange.poll();

  // Forged approvals
  const hospitalRejects = async (body) => {
    await deliver(stranger, hospital, { type: "claim-approval", body });
    return (await rejectedBy(hospital)).length === 1;
  };
  const approvedTerms = { ...terms };
  delete approvedTerms.coveredProcedures;
  report(
    "A forged approval from another wallet is rejected",
    await hospitalRejects({
      encounterId: request.encounterId,
      terms: approvedTerms,
      coveredPath: {
        pathElements: Array(6).fill("1"),
        pathIndices: Array(6).fill(0),
      },
      patientSignature: await eddsaSign(stranger.keys.eddsaSeed, 9n),
    }),
  );

  // Real approval and proof
  await patient.exchange.approveClaim(incoming.body, hospital.address, terms);
  const approval = (await hospital.exchange.poll()).find((event) => event.kind === "approval");
  report("The hospital receives a checked approval", Boolean(approval));
  report("The approval carries no coverage list", !("coveredProcedures" in approval.body.terms));
  const input = await hospital.exchange.buildCircuitInput(approval.body);
  const started = Date.now();
  const { proof, publicSignals } = await groth16.fullProve(
    input,
    join(repoRoot, "app", "public", "zk", "claim.wasm"),
    join(repoRoot, "app", "public", "zk", "claim_final.zkey"),
  );
  console.log(`INFO  Node proof took ${Date.now() - started} ms`);
  const verificationKey = JSON.parse(
    readFileSync(join(repoRoot, "app", "public", "zk", "verification_key.json"), "utf8"),
  );
  report("The real proof verifies", await groth16.verify(verificationKey, publicSignals, proof));
  report(
    "Public signals are the six values in the required order",
    publicSignals.length === 6 &&
      PUBLIC_SIGNALS.every((name, index) => publicSignals[index] === input[name]),
  );
  const [pA, pB, pC, signals] = JSON.parse(
    `[${await groth16.exportSolidityCallData(proof, publicSignals)}]`,
  );
  report(
    "The deployed Solidity verifier accepts the proof",
    await publicClient.readContract({
      address: deployment.contracts.groth16Verifier,
      abi: verifierAbi,
      functionName: "verifyProof",
      args: [pA, pB, pC, signals],
    }),
  );
  const changed = [...signals];
  changed[0] = `0x${(BigInt(signals[0]) + 1n).toString(16)}`;
  report(
    "The verifier rejects a changed claim amount",
    !(await publicClient.readContract({
      address: deployment.contracts.groth16Verifier,
      abi: verifierAbi,
      functionName: "verifyProof",
      args: [pA, pB, pC, changed],
    })),
  );
  if (existsSync(inboxDir)) {
    const stored = readdirSync(inboxDir)
      .filter((name) => name.endsWith(".json"))
      .map((name) => readFileSync(join(inboxDir, name), "utf8"))
      .join("");
    report(
      "No witness value appears in stored inbox data",
      ![input.policySalt, input.encounterId, input.patientS, input.hospitalS].some((value) =>
        stored.includes(value),
      ),
    );
  }
  await globalThis.curve_bn128?.terminate?.();
}

main()
  .catch((error) => {
    failed += 1;
    console.error(`FAIL  check stopped: ${plainRecordError(error)} (${error?.name ?? "error"})`);
  })
  .finally(() => {
    console.log(failed === 0 ? "\nAll checks passed." : `\n${failed} check(s) failed.`);
    process.exit(failed === 0 ? 0 : 1);
  });
