import type { ClaimCircuitInput } from "@rado/shared";
import { groth16 } from "snarkjs";

/*
 * Runs only in the Hospital browser (Invariant 6). It makes requests only for the public
 * proving files, and it must never log or post the witness.
 */

interface ManifestFile {
  sha256: string;
}

interface Manifest {
  placeholder: boolean;
  publicInputs: number;
  files: { wasm: ManifestFile; zkey: ManifestFile; verificationKey: ManifestFile };
}

async function fetchChecked(url: string, sha256: string): Promise<Uint8Array> {
  const response = await fetch(url, { cache: "force-cache" });
  if (!response.ok) throw new Error("missing-proving-file");
  const bytes = new Uint8Array(await response.arrayBuffer());
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  const hex = Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("");
  if (hex !== sha256) throw new Error("changed-proving-file");
  return bytes;
}

async function prove(input: ClaimCircuitInput) {
  const manifestResponse = await fetch("/zk/manifest.json", { cache: "no-store" });
  if (!manifestResponse.ok) throw new Error("missing-proving-file");
  const manifest = (await manifestResponse.json()) as Manifest;
  // A placeholder proves none of the claim rules, so it is never used here (Invariant 24).
  if (manifest.placeholder !== false || manifest.publicInputs !== 6) {
    throw new Error("placeholder-proving-file");
  }
  const [wasm, zkey, keyBytes] = await Promise.all([
    fetchChecked("/zk/claim.wasm", manifest.files.wasm.sha256),
    fetchChecked("/zk/claim_final.zkey", manifest.files.zkey.sha256),
    fetchChecked("/zk/verification_key.json", manifest.files.verificationKey.sha256),
  ]);
  const started = performance.now();
  const { proof, publicSignals } = await groth16.fullProve(
    input as unknown as Record<string, unknown>,
    wasm,
    zkey,
  );
  const provingMs = Math.round(performance.now() - started);
  const verificationKey: unknown = JSON.parse(new TextDecoder().decode(keyBytes));
  if (!(await groth16.verify(verificationKey, publicSignals, proof))) {
    throw new Error("invalid-proof");
  }
  return { proof, publicSignals, provingMs };
}

self.onmessage = (event: MessageEvent<ClaimCircuitInput>) => {
  prove(event.data)
    .then((result) => self.postMessage({ ok: true, ...result }))
    .catch((error: unknown) => {
      const known = new Set([
        "missing-proving-file",
        "changed-proving-file",
        "placeholder-proving-file",
        "invalid-proof",
      ]);
      const reason = error instanceof Error && known.has(error.message) ? error.message : "failed";
      self.postMessage({ ok: false, reason });
    });
};
