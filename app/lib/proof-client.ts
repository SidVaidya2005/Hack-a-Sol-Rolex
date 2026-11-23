import type { ClaimCircuitInput, PublicSignals } from "@rado/shared";
import { PUBLIC_SIGNALS } from "@rado/shared";
import type { Groth16Proof } from "snarkjs";

export interface ClaimProof {
  proof: Groth16Proof;
  publicSignals: PublicSignals;
  provingMs: number;
}

const PROOF_ERRORS: Record<string, string> = {
  "missing-proving-file": "The proving files could not be loaded.",
  "changed-proving-file": "The proving files failed their integrity check.",
  "placeholder-proving-file": "Placeholder proving files cannot be used.",
  "invalid-proof": "The generated proof did not verify.",
};

/** Proves in a web worker, then checks the worker returned exactly this claim's public values. */
export function generateClaimProof(input: ClaimCircuitInput): Promise<ClaimProof> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL("./proof.worker.ts", import.meta.url), { type: "module" });
    const finish = (run: () => void) => {
      worker.terminate();
      run();
    };
    worker.onerror = () => finish(() => reject(new Error("The proof could not be generated.")));
    worker.onmessage = ({
      data,
    }: MessageEvent<
      | { ok: true; proof: Groth16Proof; publicSignals: string[]; provingMs: number }
      | { ok: false; reason: string }
    >) => {
      if (!data.ok) {
        const message = PROOF_ERRORS[data.reason] ?? "The proof could not be generated.";
        finish(() => reject(new Error(message)));
        return;
      }
      const expected = PUBLIC_SIGNALS.map((name) => input[name]);
      const matches =
        data.publicSignals.length === expected.length &&
        data.publicSignals.every((value, index) => value === expected[index]);
      if (!matches) {
        finish(() => reject(new Error("The proof does not match this claim.")));
        return;
      }
      finish(() =>
        resolve({
          proof: data.proof,
          publicSignals: data.publicSignals as unknown as PublicSignals,
          provingMs: data.provingMs,
        }),
      );
    };
    worker.postMessage(input);
  });
}
