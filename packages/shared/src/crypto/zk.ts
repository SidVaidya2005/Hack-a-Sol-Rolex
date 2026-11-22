// circomlibjs ships no types, and an ambient module can only be pulled in by a reference.
// eslint-disable-next-line @typescript-eslint/triple-slash-reference
/// <reference path="../circomlibjs.d.ts" />
import type { CircomEddsa } from "circomlibjs";

import { EMPTY_LEAF } from "../constants.ts";
import { merkleNodeInputs } from "../hash-inputs.ts";
import type { EddsaPublicKey, EddsaSignature, MerklePath } from "../types.ts";

let eddsaPromise: Promise<CircomEddsa> | undefined;

/** Loaded on first use because circomlibjs builds WebAssembly at startup. */
function loadEddsa(): Promise<CircomEddsa> {
  eddsaPromise ??= import("circomlibjs")
    .then(({ buildEddsa }) => buildEddsa())
    .catch((error: unknown) => {
      eddsaPromise = undefined;
      throw error;
    });
  return eddsaPromise;
}

export async function poseidonHash(inputs: bigint[]): Promise<bigint> {
  const eddsa = await loadEddsa();
  return eddsa.F.toObject(eddsa.poseidon(inputs));
}

export async function eddsaPublicKey(seed: Uint8Array): Promise<EddsaPublicKey> {
  const eddsa = await loadEddsa();
  const [ax, ay] = eddsa.prv2pub(seed);
  return { Ax: eddsa.F.toObject(ax).toString(), Ay: eddsa.F.toObject(ay).toString() };
}

export async function eddsaSign(seed: Uint8Array, message: bigint): Promise<EddsaSignature> {
  const eddsa = await loadEddsa();
  const signature = eddsa.signPoseidon(seed, eddsa.F.e(message));
  return {
    R8x: eddsa.F.toObject(signature.R8[0]).toString(),
    R8y: eddsa.F.toObject(signature.R8[1]).toString(),
    S: signature.S.toString(),
  };
}

export async function eddsaVerify(
  message: bigint,
  signature: EddsaSignature,
  publicKey: EddsaPublicKey,
): Promise<boolean> {
  const eddsa = await loadEddsa();
  const { F } = eddsa;
  try {
    return eddsa.verifyPoseidon(
      F.e(message),
      { R8: [F.e(BigInt(signature.R8x)), F.e(BigInt(signature.R8y))], S: BigInt(signature.S) },
      [F.e(BigInt(publicKey.Ax)), F.e(BigInt(publicKey.Ay))],
    );
  } catch {
    return false;
  }
}

export async function merkleRootFromPath(leaf: bigint, path: MerklePath): Promise<bigint> {
  let node = leaf;
  for (const [level, element] of path.pathElements.entries()) {
    const sibling = BigInt(element);
    node = await poseidonHash(
      path.pathIndices[level] === 0
        ? merkleNodeInputs(node, sibling)
        : merkleNodeInputs(sibling, node),
    );
  }
  return node;
}

export async function merkleRootFromLeaves(leaves: bigint[], depth: number): Promise<bigint> {
  if (leaves.length > 2 ** depth) throw new Error("Too many Merkle leaves");
  let level = leaves;
  let empty = EMPTY_LEAF;
  for (let height = 0; height < depth; height += 1) {
    const next: bigint[] = [];
    for (let i = 0; i < level.length; i += 2) {
      next.push(await poseidonHash(merkleNodeInputs(level[i] as bigint, level[i + 1] ?? empty)));
    }
    level = next;
    empty = await poseidonHash(merkleNodeInputs(empty, empty));
  }
  return level[0] ?? empty;
}
