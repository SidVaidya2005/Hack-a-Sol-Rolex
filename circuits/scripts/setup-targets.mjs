import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const circuitsDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const repoRoot = resolve(circuitsDir, "..");

export const DEMO_WARNING =
  "DEMO ONLY. One person generated this trusted setup on one laptop, so it must never protect real funds or data.";
export const PLACEHOLDER_WARNING =
  "PLACEHOLDER. This circuit proves none of the claim rules. Never use it in a rehearsal, final E2E run, or the demo.";

/** Where one setup reads its circuit and writes its files. */
export function setupTarget(placeholder) {
  if (placeholder) {
    const dir = join(circuitsDir, "placeholder");
    return {
      name: "placeholder",
      placeholder: true,
      source: join(dir, "placeholder.circom"),
      buildDir: join(circuitsDir, "build", "setup-placeholder"),
      manifest: join(dir, "manifest.json"),
      outputs: {
        wasm: join(dir, "placeholder.wasm"),
        zkey: join(dir, "placeholder_final.zkey"),
        verificationKey: join(dir, "verification_key.json"),
        verifier: join(dir, "Groth16Verifier.sol"),
      },
    };
  }
  const browserDir = join(repoRoot, "app", "public", "zk");
  return {
    name: "claim",
    placeholder: false,
    source: join(circuitsDir, "src", "claim.circom"),
    buildDir: join(circuitsDir, "build", "setup-claim"),
    manifest: join(browserDir, "manifest.json"),
    outputs: {
      wasm: join(browserDir, "claim.wasm"),
      zkey: join(browserDir, "claim_final.zkey"),
      verificationKey: join(browserDir, "verification_key.json"),
      verifier: join(repoRoot, "contracts", "contracts", "Groth16Verifier.sol"),
    },
  };
}

export function sha256File(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}
