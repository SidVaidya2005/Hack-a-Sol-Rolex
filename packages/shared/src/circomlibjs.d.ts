declare module "circomlibjs" {
  export interface CircomField {
    e(value: bigint): Uint8Array;
    toObject(value: Uint8Array): bigint;
  }

  export interface CircomSignature {
    R8: [Uint8Array, Uint8Array];
    S: bigint;
  }

  export interface CircomEddsa {
    F: CircomField;
    poseidon(inputs: bigint[]): Uint8Array;
    prv2pub(seed: Uint8Array): [Uint8Array, Uint8Array];
    signPoseidon(seed: Uint8Array, message: Uint8Array): CircomSignature;
    verifyPoseidon(
      message: Uint8Array,
      signature: CircomSignature,
      publicKey: [Uint8Array, Uint8Array],
    ): boolean;
  }

  export function buildEddsa(): Promise<CircomEddsa>;
}
