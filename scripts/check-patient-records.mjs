// Proves the W09 record flows against a running, seeded chain and app, with throwaway wallets.
// Usage: node scripts/check-patient-records.mjs [app-url]   (default http://127.0.0.1:3000)
// The expiry check moves chain time, so run it only on a disposable local chain.
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { x25519 } from "@noble/curves/ed25519.js";
import { createPublicClient, createWalletClient, http, parseEther } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { hardhat } from "viem/chains";
import {
  addRecordReader,
  decryptRecord,
  eddsaPublicKey,
  encodeBundle,
  SAMPLE_RECORD,
  unwrapRecordKey,
  utf8Encode,
} from "../packages/shared/src/index.ts";
import {
  createRecordService,
  describeRecord,
  plainRecordError,
} from "../app/lib/record-service.ts";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const base = process.argv[2] ?? "http://127.0.0.1:3000";
const adminRpc = "http://127.0.0.1:8545";
const MEDICAL_TERMS = ["Condition", "MedicationRequest", "Procedure", "resourceType", "diagnosis"];

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

async function adminCall(method, params = []) {
  const response = await fetch(adminRpc, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  const body = await response.json();
  if (body.error) throw new Error(`${method} failed`);
  return body.result;
}

async function main() {
  const transport = http(`${base}/api/rpc`, { timeout: 60_000 });
  const publicClient = createPublicClient({ chain: hardhat, transport, pollingInterval: 100 });
  const { recordAccess } = await (await fetch(`${base}/api/contracts`)).json();
  report(
    "The contracts route returns the deployed address",
    /^0x[0-9a-fA-F]{40}$/.test(recordAccess),
  );
  const keys = Object.fromEntries(
    readFileSync(join(repoRoot, "contracts", ".env.demo-wallets"), "utf8")
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => line.split("=")),
  );
  const funder = createWalletClient({
    account: privateKeyToAccount(keys.RADO_DEMO_DEPLOYER_KEY),
    chain: hardhat,
    transport,
  });

  // These throwaway doctors are not in the seeded directory, so the check approves them here.
  const approvedReaders = new Set();
  const profileAccess = {
    hospitalIsApproved: async (wallet) => approvedReaders.has(wallet.toLowerCase()),
    walletIsInsurer: async () => false,
  };

  async function newUser() {
    const account = privateKeyToAccount(generatePrivateKey());
    await publicClient.waitForTransactionReceipt({
      hash: await funder.sendTransaction({ to: account.address, value: parseEther("1") }),
    });
    const eddsaSeed = randomBytes(32);
    const x25519Key = x25519.keygen();
    const unlocked = {
      eddsaSeed,
      eddsaPublicKey: await eddsaPublicKey(eddsaSeed),
      x25519SecretKey: x25519Key.secretKey,
      x25519PublicKey: x25519Key.publicKey,
    };
    const walletClient = createWalletClient({ account, chain: hardhat, transport });
    const service = createRecordService({
      publicClient,
      walletClient,
      recordAccess,
      baseUrl: base,
      profileAccess,
    });
    await service.ensureRegistered(unlocked);
    return { address: account.address, keys: unlocked, service, walletClient };
  }

  const patient = await newUser();
  const doctor = await newUser();
  const secondDoctor = await newUser();
  const stranger = await newUser();
  approvedReaders.add(doctor.address.toLowerCase());
  approvedReaders.add(secondDoctor.address.toLowerCase());
  const plaintext = utf8Encode(JSON.stringify(SAMPLE_RECORD));

  // Add record
  const recordId = await patient.service.addRecord(patient.keys, plaintext);
  const first = await patient.service.loadBundle(recordId);
  const firstText = new TextDecoder().decode(encodeBundle(first.bundle));
  report("A record is anchored on-chain", first.keyVersion === 1n);
  report(
    "The stored bundle holds no readable medical data",
    MEDICAL_TERMS.every((term) => !firstText.includes(term)),
  );
  const patientView = await patient.service.open(patient.keys, recordId);
  report("The patient opens their record", patientView.length === SAMPLE_RECORD.entry.length);

  // Before a grant
  report(
    "A wallet with no grant cannot log a view or open it",
    await refused(() => stranger.service.open(stranger.keys, recordId)),
  );
  report(
    "A non-patient cannot grant access",
    await refused(() => stranger.service.grant(stranger.keys, recordId, stranger.address, 1)),
  );

  // Grant
  await patient.service.grant(patient.keys, recordId, doctor.address, 7);
  const granted = await patient.service.loadBundle(recordId);
  report("A grant changes the on-chain hash and CID", granted.cid !== first.cid);
  report("A grant keeps the same record key version", granted.keyVersion === 1n);
  const doctorView = await doctor.service.open(doctor.keys, recordId);
  report("A granted doctor reads the record", doctorView.length === SAMPLE_RECORD.entry.length);
  const views = await doctor.service.timeline(patient.address);
  report(
    "The doctor's view is logged on-chain",
    views.some((entry) => entry.title === "Record viewed" && entry.actor === doctor.address),
  );
  report(
    "The doctor sees the shared record as active",
    (await doctor.service.listSharedRecords()).some(
      (record) => record.recordId === recordId && record.status === "Active",
    ),
  );
  await patient.service.grant(patient.keys, recordId, secondDoctor.address, 7);

  // Failed steps keep the old state
  const beforeFailure = await patient.service.loadBundle(recordId);
  const cancelledWallet = {
    ...patient.walletClient,
    writeContract: async () => {
      throw Object.assign(new Error("rejected"), { code: 4001 });
    },
  };
  const cancelled = createRecordService({
    publicClient,
    walletClient: cancelledWallet,
    recordAccess,
    baseUrl: base,
  });
  let cancelMessage = "";
  try {
    await cancelled.revoke(patient.keys, recordId, doctor.address);
  } catch (error) {
    cancelMessage = plainRecordError(error);
  }
  const afterFailure = await patient.service.loadBundle(recordId);
  report(
    "A cancelled revoke keeps the old state",
    afterFailure.cid === beforeFailure.cid && afterFailure.keyVersion === beforeFailure.keyVersion,
  );
  report("A cancelled revoke shows a plain error", cancelMessage.startsWith("You cancelled"));
  report(
    "The doctor keeps access after a cancelled revoke",
    (await doctor.service.open(doctor.keys, recordId)).length > 0,
  );

  // Revoke with rotation
  const oldWrapped = beforeFailure.bundle.wrappedKeys.find(
    (entry) => entry.reader.toLowerCase() === doctor.address.toLowerCase(),
  );
  const oldKey = await unwrapRecordKey(oldWrapped, recordId, doctor.keys.x25519SecretKey);
  await patient.service.revoke(patient.keys, recordId, doctor.address);
  const rotated = await patient.service.loadBundle(recordId);
  report("Revoke increases the key version", rotated.keyVersion === 2n);
  report(
    "Revoke replaces the ciphertext",
    rotated.bundle.ciphertext !== beforeFailure.bundle.ciphertext,
  );
  report(
    "The revoked doctor has no wrapped key in the new bundle",
    !rotated.bundle.wrappedKeys.some(
      (entry) => entry.reader.toLowerCase() === doctor.address.toLowerCase(),
    ),
  );
  report(
    "The revoked doctor cannot open the current record in the app",
    await refused(() => doctor.service.open(doctor.keys, recordId)),
  );
  report(
    "The revoked doctor's key cannot decrypt the current bundle directly",
    await refused(() => decryptRecord(rotated.bundle, doctor.address, doctor.keys.x25519SecretKey)),
  );
  report(
    "The doctor's old record key cannot open the new ciphertext",
    await refused(() =>
      addRecordReader(rotated.bundle, oldKey, {
        address: stranger.address,
        x25519PublicKey: stranger.keys.x25519PublicKey,
      }),
    ),
  );
  report(
    "A remaining doctor still reads the record",
    (await secondDoctor.service.open(secondDoctor.keys, recordId)).length > 0,
  );
  report(
    "The patient still reads the record",
    (await patient.service.open(patient.keys, recordId)).length > 0,
  );
  report(
    "The revoked doctor shows as revoked",
    (await doctor.service.listSharedRecords()).some(
      (record) => record.recordId === recordId && record.status === "Revoked",
    ),
  );

  // Re-grant after a revoke
  await patient.service.grant(patient.keys, recordId, doctor.address, 1);
  report(
    "A revoked doctor can be granted access again",
    (await doctor.service.open(doctor.keys, recordId)).length > 0,
  );

  // Expiry
  await adminCall("evm_increaseTime", [2 * 86_400]);
  await adminCall("evm_mine");
  report(
    "An expired doctor cannot open the record",
    await refused(() => doctor.service.open(doctor.keys, recordId)),
  );
  report(
    "An expired doctor shows as expired",
    (await doctor.service.listSharedRecords()).some(
      (record) => record.recordId === recordId && record.status === "Expired",
    ),
  );
  report(
    "A doctor still inside their window keeps access",
    (await secondDoctor.service.open(secondDoctor.keys, recordId)).length > 0,
  );
  await patient.service.grant(patient.keys, recordId, doctor.address, 1);
  report(
    "An expired doctor can be renewed",
    (await doctor.service.open(doctor.keys, recordId)).length > 0,
  );
  await adminCall("evm_increaseTime", [2 * 86_400]);
  await adminCall("evm_mine");
  await patient.service.revoke(patient.keys, recordId, secondDoctor.address);
  const afterExpiredRotation = await patient.service.loadBundle(recordId);
  report(
    "Rotation gives no new key to a reader whose grant has expired",
    afterExpiredRotation.bundle.wrappedKeys.length === 1,
  );

  // Timeline
  const timeline = await patient.service.timeline();
  const titles = new Set(timeline.map((entry) => entry.title));
  for (const title of [
    "Record added",
    "Access granted",
    "Record viewed",
    "Access revoked",
    "Record key rotated",
  ]) {
    report(`The timeline shows "${title}"`, titles.has(title));
  }
  const timelineText = JSON.stringify(timeline, (_, value) =>
    typeof value === "bigint" ? value.toString() : value,
  );
  report(
    "The timeline holds no record titles or resource types",
    MEDICAL_TERMS.every((term) => !timelineText.includes(term)),
  );
  report(
    "Displayed items come only from decrypted data",
    describeRecord(plaintext).length === SAMPLE_RECORD.entry.length,
  );
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
