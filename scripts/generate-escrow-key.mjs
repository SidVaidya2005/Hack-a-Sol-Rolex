// Creates ESCROW_PRIVATE_KEY in the git-ignored app/.env.local on the host laptop.
// Never prints the key and never replaces an existing one, because that would strand
// every emergency summary already wrapped to it.
import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const envFile = join(repoRoot, "app", ".env.local");

try {
  execFileSync("git", ["check-ignore", "-q", envFile], { cwd: repoRoot });
} catch {
  throw new Error("app/.env.local is not git-ignored. Refusing to write a key.");
}

const text = existsSync(envFile) ? readFileSync(envFile, "utf8") : "";
const newline = text.includes("\r\n") ? "\r\n" : "\n";
const lines = text.length ? text.split(/\r?\n/) : [];
const index = lines.findIndex((line) => line.startsWith("ESCROW_PRIVATE_KEY="));

if (index >= 0 && lines[index].slice("ESCROW_PRIVATE_KEY=".length).trim()) {
  console.log("ESCROW_PRIVATE_KEY is already set. Nothing was changed.");
} else {
  const entry = `ESCROW_PRIVATE_KEY=0x${randomBytes(32).toString("hex")}`;
  if (index >= 0) {
    lines[index] = entry;
  } else {
    if (lines.at(-1) === "") lines.pop();
    lines.push(entry, "");
  }
  writeFileSync(envFile, lines.join(newline), { mode: 0o600 });
  console.log("ESCROW_PRIVATE_KEY was created in app/.env.local. Restart the app to load it.");
}
