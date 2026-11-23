// Proves the W07 route guards against a running, seeded chain.
// On L4:           node scripts/check-server-routes.mjs --host <L4-LAN-IP>
//                  Starts the app itself, so it can also test restart, tamper, expiry, and logs.
// Second laptop:   node scripts/check-server-routes.mjs https://<L4-LAN-IP>:3000 --wallets <file>
//                  Set NODE_EXTRA_CA_CERTS to the copied ca.pem. Uses throwaway test wallets.
import { spawn, spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { x25519 } from "@noble/curves/ed25519.js";
import { createPublicClient, createWalletClient, http, parseAbi, parseEther } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { hardhat } from "viem/chains";
import {
  bytesToBase64,
  eddsaPublicKey,
  encodeBundle,
  encryptRecord,
  hashBundleBytes,
  inboxCiphertextHash,
  INBOX_MAX_MESSAGE_BYTES,
  INBOX_MAX_PENDING,
  INBOX_RETENTION_SECONDS,
  recordAccessAbi,
  signInboxRequest,
} from "../packages/shared/src/index.ts";
import { pinTypedData } from "../app/lib/pin-auth.ts";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const appDir = join(repoRoot, "app");
const args = process.argv.slice(2);
const option = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined);
const hostIp = option("--host");
const port = 3443;
const isWindows = process.platform === "win32";
const base = hostIp ? `https://${hostIp}:${port}` : args.find((arg) => arg.startsWith("https://"));
const walletFile = option("--wallets") ?? join(repoRoot, "contracts", ".env.demo-wallets");
const deployment = join(repoRoot, "contracts", "deployments", "localhost.json");
const abi = parseAbi(recordAccessAbi);

if (!base) {
  console.error("Usage: check-server-routes.mjs --host <ip> | <https-url> --wallets <file>");
  process.exit(1);
}

let failed = 0;
let serverLog = "";
let server;

function report(name, passed) {
  if (!passed) failed += 1;
  console.log(`${passed ? "PASS" : "FAIL"}  ${name}`);
}

const post = (path, body, headers = {}) =>
  fetch(`${base}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
const rpc = (body) => post("/api/rpc", body);
const call = (method, params = [], id = 1) => ({ jsonrpc: "2.0", id, method, params });

async function startServer() {
  server = spawn(
    // Run Next's entry file with Node, because Windows cannot spawn the .bin shim directly.
    process.execPath,
    [
      join(repoRoot, "node_modules", "next", "dist", "bin", "next"),
      "dev",
      "--hostname",
      hostIp,
      "--port",
      String(port),
      "--experimental-https",
      "--experimental-https-key",
      "certificates/key.pem",
      "--experimental-https-cert",
      "certificates/cert.pem",
    ],
    { cwd: appDir, detached: !isWindows, stdio: ["ignore", "pipe", "pipe"] },
  );
  server.stdout.on("data", (chunk) => (serverLog += chunk));
  server.stderr.on("data", (chunk) => (serverLog += chunk));
  for (let attempt = 0; attempt < 120; attempt += 1) {
    try {
      const response = await rpc(call("eth_chainId"));
      if (response.ok) return;
    } catch {}
    await new Promise((done) => setTimeout(done, 500));
  }
  throw new Error("The app did not start.");
}

async function stopServer() {
  if (!server) return;
  const exited = new Promise((done) => server.once("exit", done));
  // Windows has no process groups, so taskkill stops Next and its child workers.
  if (isWindows) {
    spawnSync("taskkill", ["/PID", String(server.pid), "/T", "/F"], { stdio: "ignore" });
  } else {
    process.kill(-server.pid, "SIGTERM");
  }
  await exited;
  server = undefined;
}

function randomEnvelope(sender, recipient, overrides = {}) {
  return {
    messageId: randomBytes(16).toString("hex"),
    sender: sender.address.toLowerCase(),
    recipient: recipient.address.toLowerCase(),
    createdAt: Math.floor(Date.now() / 1000),
    ephemeralPublicKey: randomBytes(32).toString("base64"),
    iv: randomBytes(12).toString("base64"),
    ciphertext: randomBytes(256).toString("base64"),
    ...overrides,
  };
}

const sendAuth = (user, envelope) =>
  signInboxRequest({
    action: "send",
    wallet: user.address,
    eddsaSeed: user.seed,
    ciphertextHash: inboxCiphertextHash(envelope.ciphertext),
  });
const auth = (user, action) =>
  signInboxRequest({ action, wallet: user.address, eddsaSeed: user.seed });
const send = async (user, envelope) =>
  post("/api/inbox", { envelope, auth: await sendAuth(user, envelope) });
const list = async (user) => {
  const response = await post("/api/inbox/list", { auth: await auth(user, "list") });
  return (await response.json()).messages ?? [];
};
const ack = async (user, messageIds) =>
  post("/api/inbox/ack", { auth: await auth(user, "ack"), messageIds });

async function main() {
  if (hostIp) await startServer();
  const transport = http(`${base}/api/rpc`, { timeout: 60_000 });
  const chain = createPublicClient({ chain: hardhat, transport });
  const keys = Object.fromEntries(
    readFileSync(walletFile, "utf8")
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => line.split("=")),
  );
  const funder = createWalletClient({
    account: privateKeyToAccount(keys.RADO_DEMO_DEPLOYER_KEY),
    chain: hardhat,
    transport,
  });
  const recordAccess = JSON.parse(readFileSync(deployment, "utf8")).contracts.recordAccess;

  async function newUser(register = true) {
    const account = privateKeyToAccount(generatePrivateKey());
    const seed = randomBytes(32);
    const user = { account, address: account.address, seed };
    await chain.waitForTransactionReceipt({
      hash: await funder.sendTransaction({ to: account.address, value: parseEther("1") }),
    });
    if (register) {
      const { Ax, Ay } = await eddsaPublicKey(seed);
      const x25519Key = x25519.keygen();
      user.x25519PublicKey = x25519Key.publicKey;
      const wallet = createWalletClient({ account, chain: hardhat, transport });
      await chain.waitForTransactionReceipt({
        hash: await wallet.writeContract({
          address: recordAccess,
          abi,
          functionName: "registerKeys",
          args: [BigInt(Ax), BigInt(Ay), `0x${Buffer.from(x25519Key.publicKey).toString("hex")}`],
        }),
      });
      user.wallet = wallet;
    }
    return user;
  }

  const alice = await newUser();
  const bob = await newUser();
  const carol = await newUser();
  const stranger = await newUser(false);
  report("HTTPS app and allowed RPC methods work, including raw transactions", true);

  // RPC guard
  for (const method of [
    "hardhat_setBalance",
    "hardhat_impersonateAccount",
    "evm_mine",
    "debug_traceTransaction",
    "personal_sign",
    "eth_sendTransaction",
    "eth_accounts",
    "HARDHAT_mine",
  ]) {
    report(`RPC refuses ${method}`, (await rpc(call(method))).status === 403);
  }
  const before = await chain.getBalance({ address: stranger.address });
  const setBalance = call("hardhat_setBalance", [stranger.address, "0xffffffffffffffff"], 3);
  report(
    "RPC batch with a blocked method last is refused",
    (await rpc([call("eth_chainId"), call("eth_blockNumber", [], 2), setBalance])).status === 403,
  );
  report(
    "RPC batch with eth_sendTransaction in the middle is refused",
    (
      await rpc([
        call("eth_chainId"),
        call("eth_sendTransaction", [{ from: alice.address }], 2),
        call("eth_blockNumber", [], 3),
      ])
    ).status === 403,
  );
  report(
    "A refused batch forwards nothing",
    (await chain.getBalance({ address: stranger.address })) === before,
  );
  const allowed = await rpc([call("eth_chainId"), call("eth_blockNumber", [], 2)]);
  report("RPC batch of allowed methods works", allowed.ok && (await allowed.json()).length === 2);
  report(
    "RPC refuses a batch over the size limit",
    (await rpc(Array.from({ length: 51 }, (_, id) => call("eth_chainId", [], id)))).status === 400,
  );
  report(
    "RPC refuses an oversized body before parsing",
    (await rpc(`[${" ".repeat(300 * 1024)}]`)).status === 413,
  );
  report(
    "RPC refuses a non-JSON content type",
    (await post("/api/rpc", call("eth_chainId"), { "content-type": "text/plain" })).status === 415,
  );
  report(
    "RPC refuses another website's origin",
    (await post("/api/rpc", call("eth_chainId"), { origin: "https://evil.example" })).status ===
      403,
  );

  // Path traversal
  for (const path of [
    "..%2F..%2Fpackage",
    "%2e%2e%2f%2e%2e%2fpackage",
    "..%5C..%5Cpackage",
    "QmEvil",
    `b${"a".repeat(58)}%00`,
  ]) {
    const response = await fetch(`${base}/api/records/${path}`);
    const text = await response.text();
    report(
      `Records refuses path ${path.slice(0, 24)}`,
      [400, 404].includes(response.status) && !text.includes('"workspaces"'),
    );
  }
  for (const messageId of ["../../../package", "..\\..\\x", `${"a".repeat(31)}/`, "A".repeat(32)]) {
    const envelope = randomEnvelope(alice, bob, { messageId });
    report(
      `Inbox send refuses ID ${messageId.slice(0, 16)}`,
      (await send(alice, envelope)).status === 400,
    );
    report(
      `Inbox ack refuses ID ${messageId.slice(0, 16)}`,
      (await ack(bob, [messageId])).status === 400,
    );
  }

  // Inbox authentication
  const first = randomEnvelope(alice, bob);
  report(
    "Unregistered sender is refused",
    (await send(stranger, randomEnvelope(stranger, bob))).status === 403,
  );
  report(
    "Unregistered recipient is refused",
    (await send(alice, randomEnvelope(alice, stranger))).status === 403,
  );
  report(
    "Sender that does not match the signer is refused",
    (await send(alice, randomEnvelope(bob, carol))).status === 403,
  );
  const forged = await sendAuth({ ...alice, seed: randomBytes(32) }, first);
  report(
    "Signature from the wrong key is refused",
    (await post("/api/inbox", { envelope: first, auth: forged })).status === 401,
  );
  const changed = { ...first, ciphertext: randomBytes(256).toString("base64") };
  report(
    "Ciphertext changed after signing is refused",
    (await post("/api/inbox", { envelope: changed, auth: await sendAuth(alice, first) })).status ===
      401,
  );
  const expired = await signInboxRequest({
    action: "list",
    wallet: bob.address,
    eddsaSeed: bob.seed,
    now: Math.floor(Date.now() / 1000) - 120,
  });
  report(
    "Expired request is refused",
    (await post("/api/inbox/list", { auth: expired })).status === 401,
  );

  const firstAuth = await sendAuth(alice, first);
  report(
    "A valid encrypted message is stored",
    (await post("/api/inbox", { envelope: first, auth: firstAuth })).status === 200,
  );
  report(
    "A reused nonce is refused",
    (await post("/api/inbox", { envelope: first, auth: firstAuth })).status === 401,
  );
  const retry = await (await send(alice, first)).json();
  report("A retry succeeds as a duplicate", retry.duplicate === true);
  report("A retry creates no second copy", (await list(bob)).length === 1);
  report(
    "Same ID with different ciphertext is refused",
    (await send(alice, { ...first, ciphertext: randomBytes(256).toString("base64") })).status ===
      409,
  );
  report("Another wallet cannot list the message", (await list(carol)).length === 0);
  await ack(carol, [first.messageId]);
  report("Another wallet cannot acknowledge the message", (await list(bob)).length === 1);
  const stolen = await auth(carol, "list");
  report(
    "A list signature cannot be used as an acknowledgement",
    (await post("/api/inbox/ack", { auth: stolen, messageIds: [first.messageId] })).status === 401,
  );

  const oversized = randomEnvelope(alice, bob, {
    ciphertext: randomBytes(INBOX_MAX_MESSAGE_BYTES + 1).toString("base64"),
  });
  report("A message over 64 KiB is refused", (await send(alice, oversized)).status === 400);
  report(
    "A huge inbox body is refused before parsing",
    (await post("/api/inbox", `{"x":"${"a".repeat(200 * 1024)}"}`)).status === 413,
  );

  const fillIds = [];
  for (let index = 0; index < INBOX_MAX_PENDING; index += 1) {
    const envelope = randomEnvelope(alice, carol);
    fillIds.push(envelope.messageId);
    await send(alice, envelope);
  }
  report(
    `Message ${INBOX_MAX_PENDING + 1} to one recipient is refused`,
    (await send(alice, randomEnvelope(alice, carol))).status === 429,
  );
  await ack(carol, fillIds);

  // Record pinning. Success needs Pinata, or a stubbed Pinata for a local run.
  const { bundle } = await encryptRecord({
    recordId: `0x${randomBytes(32).toString("hex")}`,
    plaintext: new TextEncoder().encode('{"resourceType":"Bundle","synthetic":true}'),
    readers: [{ address: alice.address, x25519PublicKey: alice.x25519PublicKey }],
  });
  const bundleBytes = encodeBundle(bundle);
  const bundleHash = hashBundleBytes(bundleBytes);
  const pinAuth = async (user, hash = bundleHash) => {
    const nonce = `0x${randomBytes(32).toString("hex")}`;
    const expiresAt = Math.floor(Date.now() / 1000) + 120;
    const signature = await user.account.signTypedData(
      pinTypedData({
        wallet: user.address,
        bundleHash: hash,
        nonce,
        expiresAt: BigInt(expiresAt),
      }),
    );
    return { wallet: user.address, nonce, expiresAt, signature };
  };
  const encoded = bytesToBase64(bundleBytes);
  report(
    "Pin refuses plaintext that is not a bundle",
    (
      await post("/api/pin", {
        bundle: Buffer.from('{"diagnosis":"synthetic"}').toString("base64"),
        auth: await pinAuth(alice),
      })
    ).status === 400,
  );
  report(
    "Pin refuses an unregistered wallet",
    (await post("/api/pin", { bundle: encoded, auth: await pinAuth(stranger) })).status === 403,
  );
  const wrongHash = await pinAuth(alice, `0x${"11".repeat(32)}`);
  report(
    "Pin refuses a signature over another bundle",
    (await post("/api/pin", { bundle: encoded, auth: wrongHash })).status === 401,
  );

  if (hostIp) {
    const pinned = await post("/api/pin", { bundle: encoded, auth: await pinAuth(alice) });
    report("Pin stores a valid encrypted bundle", pinned.status === 200);
    const { cid } = await pinned.json();
    const cacheFile = join(appDir, ".cache", "records", `${cid}.json`);
    report(
      "An unanchored bundle is not served",
      (await fetch(`${base}/api/records/${cid}`)).status === 409,
    );
    report("Reading an unanchored bundle keeps its cache entry", existsSync(cacheFile));
    await chain.waitForTransactionReceipt({
      hash: await alice.wallet.writeContract({
        address: recordAccess,
        abi,
        functionName: "anchorRecord",
        args: [bundle.recordId, bundleHash, cid],
      }),
    });
    const loaded = await fetch(`${base}/api/records/${cid}`);
    report(
      "Record loads from cache with the gateway unreachable",
      loaded.ok && Buffer.compare(Buffer.from(await loaded.arrayBuffer()), bundleBytes) === 0,
    );
    const tampered = Buffer.from(bundleBytes);
    const ivStart = tampered.indexOf('"ciphertext":"') + 14;
    tampered[ivStart] = tampered[ivStart] === 65 ? 66 : 65;
    writeFileSync(cacheFile, tampered);
    report(
      "A tampered cached bundle is rejected",
      (await fetch(`${base}/api/records/${cid}`)).status === 409,
    );
    report("The tampered cache file is removed", !existsSync(cacheFile));

    // Restart, expiry, and log checks
    const survivor = randomEnvelope(alice, bob);
    await send(alice, survivor);
    await stopServer();
    await startServer();
    const afterRestart = (await list(bob)).map((message) => message.messageId);
    report("A message survives an app restart", afterRestart.includes(survivor.messageId));
    const replay = await sendAuth(alice, first);
    await post("/api/inbox", { envelope: first, auth: replay });
    await stopServer();
    await startServer();
    report(
      "A nonce stays used after a restart",
      (await post("/api/inbox", { envelope: first, auth: replay })).status === 401,
    );
    const deleted = await (await ack(bob, [first.messageId])).json();
    report("Acknowledgement deletes the message", deleted.deleted === 1);
    report(
      "The acknowledged message is gone",
      !(await list(bob)).some((message) => message.messageId === first.messageId),
    );
    const file = join(appDir, ".cache", "inbox", `${survivor.messageId}.json`);
    const stored = JSON.parse(readFileSync(file, "utf8"));
    stored.storedAt -= INBOX_RETENTION_SECONDS;
    writeFileSync(file, JSON.stringify(stored));
    report("An expired message is not returned", (await list(bob)).length === 0);
    report("An expired message is removed from disk", !existsSync(file));
    const partial = join(appDir, ".cache", "inbox", ".tmp-crashed");
    writeFileSync(partial, "partial");
    report("A partial write is never listed", (await list(bob)).length === 0);
    report("A partial write left by a crash is removed", !existsSync(partial));

    const lowerLog = serverLog.toLowerCase();
    const secrets = [
      first.ciphertext,
      first.iv,
      survivor.ciphertext,
      encoded.slice(0, 64),
      alice.address,
      bob.address,
      carol.address,
    ];
    report(
      "Server logs contain no ciphertext, bodies, or wallet addresses",
      secrets.every((value) => !lowerLog.includes(value.toLowerCase())),
    );
  } else {
    console.log("SKIP  Pin success, tamper, restart, expiry, and logs need --host on L4");
  }
}

main()
  .catch((error) => {
    failed += 1;
    console.error(`FAIL  check stopped: ${error instanceof Error ? error.message : "error"}`);
  })
  .finally(async () => {
    await stopServer().catch(() => undefined);
    console.log(failed === 0 ? "\nAll checks passed." : `\n${failed} check(s) failed.`);
    process.exit(failed === 0 ? 0 : 1);
  });
