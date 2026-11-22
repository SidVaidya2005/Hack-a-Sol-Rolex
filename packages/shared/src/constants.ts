/** Values every track must share. Import them; never re-declare them. */

export const CHAIN_ID = 31337;
export const MUSD_DECIMALS = 6;
export const SECONDS_PER_DAY = 86_400;
export const MAX_CLAIM_AGE_DAYS = 30;

export const BN254_FIELD_PRIME =
  21888242871839275222246405745257275088548364400416034343698204186575808495617n;

export const HOSPITAL_TREE_DEPTH = 8;
export const COVERED_TREE_DEPTH = 6;
export const EMPTY_LEAF = 0n;

export const DAY_BITS = 32;
export const AMOUNT_BITS = 64;
export const ADDRESS_BITS = 160;

/** keccak256("rado/claim/v1") reduced to the BN254 field. */
export const CLAIM_DOMAIN =
  2470406988103596035215911638302347985942547529518534802120906646518594990167n;

/** keccak256("rado/request/v1") reduced to the BN254 field. */
export const REQUEST_DOMAIN =
  21803472362330635487052715487197964905180888138510215017635477094303959125006n;

/** The circuit must declare these first, in this order, and have no outputs. */
export const PUBLIC_SIGNALS = [
  "claimAmount",
  "policyCommitment",
  "nullifier",
  "hospitalRoot",
  "claimDay",
  "payoutAddress",
] as const;

/** Omits verifyingContract so a redeploy does not change anyone's derived keys. */
export const UNLOCK_TYPED_DATA = {
  domain: { name: "Rado", version: "1", chainId: CHAIN_ID },
  primaryType: "RadoKeyUnlock",
  types: {
    RadoKeyUnlock: [
      { name: "wallet", type: "address" },
      { name: "purpose", type: "string" },
    ],
  },
  purpose: "Unlock Rado keys",
} as const;

export const HKDF_INFO = {
  eddsa: "rado/zk-eddsa/v1",
  x25519: "rado/x25519/v1",
  wrap: "rado/wrap/v1",
  inbox: "rado/inbox/v1",
} as const;

export const INBOX_AAD_TAG = "rado/inbox/v1";
export const INBOX_AUTH_TAG = "rado/inbox-auth/v1";
export const INBOX_MAX_MESSAGE_BYTES = 64 * 1024;
export const INBOX_MAX_PENDING = 50;
export const INBOX_RETENTION_SECONDS = 24 * 60 * 60;
export const INBOX_POLL_MS = 3_000;
export const INBOX_AUTH_MAX_TTL_SECONDS = 60;
export const INBOX_MESSAGE_ID_PATTERN = /^[0-9a-f]{32}$/;

export const AES_KEY_BYTES = 32;
export const AES_IV_BYTES = 12;
export const BUNDLE_VERSION = 1;
