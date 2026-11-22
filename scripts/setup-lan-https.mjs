// Creates a local certificate authority and an HTTPS certificate for the L4 demo host.
// Usage: node scripts/setup-lan-https.mjs <L4-LAN-IP>
// Output stays in the git-ignored app/certificates/. Share only ca.pem with other laptops.
import { execFileSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { isIPv4 } from "node:net";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const directory = join(repoRoot, "app", "certificates");
const ip = process.argv[2];

if (!isIPv4(ip ?? "")) {
  console.error("Usage: node scripts/setup-lan-https.mjs <L4-LAN-IP>");
  process.exit(1);
}

try {
  execFileSync("git", ["check-ignore", "-q", join(directory, "key.pem")], { cwd: repoRoot });
} catch {
  console.error("app/certificates is not git-ignored. Refusing to write keys there.");
  process.exit(1);
}

const file = (name) => join(directory, name);
const openssl = (...args) => execFileSync("openssl", args, { stdio: ["ignore", "ignore", "pipe"] });

mkdirSync(directory, { recursive: true });

// Keep the authority across IP changes, so laptops only have to trust it once.
if (!existsSync(file("ca-key.pem")) || !existsSync(file("ca.pem"))) {
  openssl("ecparam", "-name", "prime256v1", "-genkey", "-noout", "-out", file("ca-key.pem"));
  chmodSync(file("ca-key.pem"), 0o600);
  openssl(
    "req",
    "-x509",
    "-new",
    "-key",
    file("ca-key.pem"),
    "-sha256",
    "-days",
    "30",
    "-subj",
    "/CN=Rado Demo Local CA",
    "-addext",
    "basicConstraints=critical,CA:TRUE,pathlen:0",
    "-addext",
    "keyUsage=critical,keyCertSign,cRLSign",
    "-out",
    file("ca.pem"),
  );
}

const extensions = file("server.ext");
writeFileSync(
  extensions,
  [
    "basicConstraints=critical,CA:FALSE",
    "keyUsage=critical,digitalSignature",
    "extendedKeyUsage=serverAuth",
    `subjectAltName=IP:${ip},IP:127.0.0.1,DNS:localhost`,
    "",
  ].join("\n"),
);

openssl("ecparam", "-name", "prime256v1", "-genkey", "-noout", "-out", file("key.pem"));
chmodSync(file("key.pem"), 0o600);
openssl("req", "-new", "-key", file("key.pem"), "-subj", `/CN=${ip}`, "-out", file("server.csr"));
openssl(
  "x509",
  "-req",
  "-in",
  file("server.csr"),
  "-CA",
  file("ca.pem"),
  "-CAkey",
  file("ca-key.pem"),
  "-CAcreateserial",
  "-days",
  "30",
  "-sha256",
  "-extfile",
  extensions,
  "-out",
  file("cert.pem"),
);
for (const name of ["server.csr", "server.ext", "ca.srl"]) rmSync(file(name), { force: true });

console.log(`[https] certificate ready for ${ip}.`);
console.log("[https] trust app/certificates/ca.pem on each laptop. Never share the key files.");
console.log(`[https] set DEMO_HOST_IP=${ip} in app/.env.local, then run: npm run dev:lan`);
