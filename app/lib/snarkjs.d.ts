declare module "snarkjs" {
  export interface Groth16Proof {
    pi_a: string[];
    pi_b: string[][];
    pi_c: string[];
    protocol: string;
    curve: string;
  }

  export const groth16: {
    fullProve(
      input: Record<string, unknown>,
      wasm: Uint8Array | string,
      zkey: Uint8Array | string,
    ): Promise<{ proof: Groth16Proof; publicSignals: string[] }>;
    verify(
      verificationKey: unknown,
      publicSignals: string[],
      proof: Groth16Proof,
    ): Promise<boolean>;
  };
}
