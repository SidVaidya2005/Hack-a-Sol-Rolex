# Architecture

> **Purpose:** This page explains how Rado is organized and lists the privacy, proof, and coding rules every change must follow. Read it every session after `context/project-overview.md`.

## How an AI Agent Should Use This Page

- Before changing code, find the relevant system boundary and follow its rules.
- Treat **Invariants** as must-follow safety rules. Do not weaken or bypass one to make a feature work.
- Keep exact names, values, field order, and cryptographic inputs unchanged unless an agreed decision changes them.
- If an implementation choice changes the architecture, update this page in the same change and record the decision in the right decision section.

## Plain-Language Terms

- **CID:** the content identifier used to find a file on IPFS.
- **Merkle root and path:** a compact way to check that an item belongs to an approved list without publishing the whole list.
- **Nullifier:** a one-time claim marker. It lets the contract reject the same claim twice without exposing the visit identifier.
- **Witness:** the private values a person or program supplies to create a proof.
- **Key rotation:** replacing a record's encryption key and encrypting the record again so people with the old key cannot read the new copy.
- **AES-GCM, X25519, HKDF, EdDSA, Poseidon:** named cryptographic methods used by this project. Keep their exact algorithms and input formats; the names are requirements, not interchangeable examples.

## How this file is maintained

- If a change affects the tools, folder responsibilities, data handling, or a must-follow rule, update the matching section in the same change.
- Architecture Decisions holds setup-era records. Each ID has one authoritative record. A changed choice gets a new ID, and the old record is marked `Superseded by` the new ID with its reason.
- Standing Constraints receives only ongoing rules moved from Key Decisions in `context/progress-tracker.md`. Keep each rule's ID, reason, and source when moving it, and remove the source record.
- Exact library versions and API examples belong in `context/library-docs.md`.

## Stack

| Layer | Tool | Version / Range | Purpose |
| ----- | ---- | --------------- | ------- |
| Language | TypeScript, Solidity, Circom | `~5.9.3`, `0.8.34`, `2.2.3` | App, contracts, circuit |
| Runtime | Node.js | `>=26.0.0 <27.0.0` | Same major version on all four laptops (D-036) |
| Package manager | npm workspaces | Bundled with Node | One monorepo install |
| Framework | Next.js App Router, React | `^16.4.6`, `^19.3.1` | Role screens and server routes |
| Backend | Next.js route handlers on L4 | Same as Next.js | Pinata, cache, RPC proxy, encrypted inbox, escrow |
| Database | Not needed | n/a | Chain, IPFS, and encrypted file cache hold all state |
| Authentication | MetaMask wallet plus unlock signature | Current extension | Identity and key derivation. No email login |
| Chain | Hardhat local node, chain ID `31337` | `^3.22.0` | Contracts and settlement |
| Contract libraries | OpenZeppelin Contracts | `^5.6.1` | ERC-20 and access control |
| ZK | circomlib, circomlibjs, snarkjs (Groth16) | `^2.0.5`, `^0.1.7`, `^0.7.6` | Circuit parts, hashing and signing, proving |
| Wallet client | wagmi, viem, TanStack Query | `^3.7.11`, `^2.58.4`, `^5.108.2` | Wallet connection and contract calls |
| Storage | Pinata (IPFS) | `pinata ^2.7.0` | Encrypted record bundles |
| Browser crypto | WebCrypto, `@noble/curves`, `@noble/hashes` | `^2.4.0`, `^2.4.0` | AES-GCM, X25519, HKDF |
| Styling | Tailwind CSS | `^4.3.5` | Interface styling |
| Tests | Hardhat node test runner, circom_tester | Hardhat range, `^0.0.24` | Contract and circuit rejection tests |
| Formatter and linter | Prettier, ESLint, eslint-config-next | `^3.10.1`, `^9.39.5`, `^16.4.6` | Formatting and code checks (D-035) |
| Deployment | L4 laptop on local network over HTTPS | n/a | Demo host |
| AI models, analytics | Not needed | n/a | Not part of this product |

## System Boundaries

| Folder | Responsible for | Must keep elsewhere |
| ------ | --------------- | ------------------- |
| `circuits/` | Claim circuit, circuit tests, trusted-setup scripts | Application logic |
| `contracts/` | Solidity, generated verifier, deployment, contract tests | Any medical data or private keys |
| `app/` | Next.js screens, browser proving, server routes | Reimplemented hashing or encryption |
| `packages/shared/` | Types, ABIs, addresses, Poseidon inputs, encryption, FHIR sample types | React and server secrets |
| `scripts/` | Seed data and the scripted end-to-end flow | Production logic |
| `context/` | Project documentation | Secrets |

## Reused Web3 Design

Rado reuses this pipeline: encrypt in the client, upload ciphertext to IPFS, anchor its content ID on-chain, retrieve and decrypt through a dashboard.

Rado changes the key handling. The decryption key is never stored with the file or on-chain in readable form. Each approved reader gets a separate encrypted copy of the record key.

**Example:** if a patient shares one record with two doctors, the file stays encrypted once, while each doctor receives a separate wrapped copy of the file key. Removing one doctor means creating a new file key and a new encrypted file for future access.

## On-Chain and Off-Chain Data

Use this table as a placement rule: before adding data, identify where it will live and confirm it is allowed in that location. “Encrypted” means the server may hold the bytes but cannot read the medical content.

| Location | Holds | Must never hold |
| -------- | ----- | --------------- |
| Chain | Record hash, CID, grants, expiry, public keys, policy commitment, policy start day, total cap, roots, approved hospital leaves, nullifiers, six public claim values, audit events | Diagnosis, procedure, prescriptions, treatment history, record contents, resource types, record titles |
| Pinata and L4 cache | Encrypted bundle: ciphertext, IV, per-reader encrypted keys | Plaintext or unwrapped keys |
| L4 inbox | Encrypted messages plus sender, recipient, message ID, and timestamps | Plaintext, message type, or decryption keys |
| Patient browser memory | Derived keys and decrypted records during use | Anything persisted in readable form |
| Hospital browser memory | Claim witness and proof inputs | Anything sent to a server in readable form |
| L4 server environment | Pinata token and escrow private key | Patient plaintext |

## Key Handling

1. **Unlock:** the user signs a fixed EIP-712 `RadoKeyUnlock` message once. HKDF-SHA256 with an empty salt derives a BabyJubJub EdDSA seed with info `rado/zk-eddsa/v1` and an X25519 secret with info `rado/x25519/v1`. Its input is the signature's `r||s`, because wallets encode the recovery byte differently. The signing domain omits the contract address, so a redeploy does not change derived keys (D-034).
2. **Register:** each user publishes their EdDSA and X25519 public keys on-chain.
3. **Encrypt:** each record gets a random AES-256-GCM key and a fresh 96-bit IV for every encryption. The on-chain bundle hash is keccak256 of the exact pinned JSON bytes.
4. **Share:** the record key is wrapped separately for each approved reader using an ephemeral X25519 key, HKDF, and AES-GCM, with AAD `rado/wrap/v1 || recordId || reader` (D-041). The record ciphertext uses `recordId` as AAD. A grant adds a wrapped key, so `grantAccess` also updates the bundle hash and CID (D-031).
5. **Revoke:** the patient's browser creates a new key, re-encrypts, re-pins, and re-wraps for remaining readers. One `revokeAndRotate` transaction removes access and updates the on-chain hash and CID (D-031).
6. **Break-glass:** only the emergency summary's key is also wrapped to the escrow public key. Escrow re-wraps it to a registered responder after verifying an on-chain `BreakGlassInvoked` event.

## ZK Claim Circuit

**Public signals, in this exact order:** `claimAmount`, `policyCommitment`, `nullifier`, `hospitalRoot`, `claimDay`, `payoutAddress`. The `Claim` template has no outputs and declares these six inputs first, because snarkjs uses declaration order (D-029).

**Private inputs:** `procedureCode`, `encounterId`, `policySalt`, `expiryDay`, `perClaimLimit`, `coveredRoot`, covered-procedure Merkle path, patient public key and signature, hospital public key and signature, hospital Merkle path.

**The circuit enforces:**

In plain language, the proof checks that the hospital and procedure are approved, the policy is active, the amount is within the private per-claim limit, and both patient and hospital approved the same claim. It reveals only the six public signals above. Keep the equations below as the exact implementation specification.

```text
hospitalLeaf     = Poseidon(hospitalAx, hospitalAy)
hospitalLeaf is in hospitalRoot (depth 8)
coveredLeaf      = Poseidon(procedureCode, policySalt)
coveredLeaf is in coveredRoot (depth 6)
policyCommitment = Poseidon(patientAx, patientAy, expiryDay, perClaimLimit, coveredRoot, policySalt)
claimDay < expiryDay
claimAmount <= perClaimLimit
nullifier        = Poseidon(encounterId, policySalt)
claimHash        = Poseidon(CLAIM_DOMAIN, policyCommitment, encounterId, procedureCode,
                            claimAmount, claimDay, payoutAddress)
hospital EdDSA signature over claimHash is valid
patient EdDSA signature over claimHash is valid
```

- Exact signal names, hash input orders, domain tags, and a computed valid claim are in `packages/shared`.
- Merkle nodes are `Poseidon(left, right)`, empty leaves are `0`, and path index `0` means the current node is the left child.
- `CLAIM_DOMAIN` and `REQUEST_DOMAIN` are keccak256 of `rado/claim/v1` and `rado/request/v1`, reduced to the BN254 field.
- JSON carries field values and amounts as decimal strings and bytes as base64.
- `claimDay` and `expiryDay` are whole days since the Unix epoch, range-checked to 32 bits. Clients take `claimDay` from the latest block's UTC day, not the laptop clock (D-033).
- `claimAmount` and `perClaimLimit` are mUSD base units with 6 decimals, range-checked to 64 bits.
- circomlib comparators are unsafe without these range checks, so apply `Num2Bits` before every comparison.
- Use `EdDSAPoseidonVerifier` with `enabled` set to `1`.
- `encounterId` is a random field element and `policySalt` is derived from the Insurer's secret key (D-049), so a nullifier cannot be guessed or linked to a visit.
- The insurer issues the policy terms to the patient. When approving a claim, the patient shares those private terms with the hospital through the Private Message Inbox.

## Smart Contracts

- **`MockUSD`** — 6-decimal test ERC-20 used for the insurer pool.
- **`RecordAccess`** — key registration, record anchors, time-bound grants, revocation, view logging, responder registry, break-glass.
- **`ClaimSettlement`** — hospital root, policy commitments, start days and total caps, nullifiers, proof verification, payout.
- **`Groth16Verifier`** — generated by snarkjs and never edited by hand.

Function, event, and error signatures are in `packages/shared/src/abi.ts`.

**Hospital approval (D-027):** a hospital registers its key, then the Insurer approves it. `updateHospitalRoot` emits every approved leaf in `HospitalRootUpdated`, so the hospital can rebuild its Merkle path from chain data.

**Insurer-only calls (D-040):** `MockUSD.mint`, `RecordAccess.setResponder`, `ClaimSettlement.registerPolicy`, and `ClaimSettlement.updateHospitalRoot` accept only the insurer wallet set at deployment, and otherwise revert with `NotInsurer`.

`ClaimSettlement.submitClaim` checks, in order: amount above zero, payout address fits 160 bits (D-030), registered policy, current hospital root, unused nullifier, claim day not before the policy's registration day (D-026), not in the future, and at most `MAX_CLAIM_AGE_DAYS` (30) days old, total cap, valid proof. It then records the nullifier and paid total before transferring tokens.

**Audit events:** `KeysRegistered`, `RecordAnchored`, `AccessGranted`, `AccessRevoked`, `RecordKeyRotated`, `RecordViewed`, `BreakGlassInvoked`, `ResponderUpdated`, `PolicyRegistered`, `HospitalRootUpdated`, `ClaimSettled`.

## Server Routes

All routes run on L4 and share the app's HTTPS origin.

| Route | Purpose | Required guard |
| ----- | ------- | -------------- |
| `POST /api/rpc` | Same-origin proxy to Hardhat on `127.0.0.1:8545` | Allow only read methods and `eth_sendRawTransaction` |
| `GET /api/contracts` | Return the public RecordAccess and ClaimSettlement addresses (D-047) | Same origin, read-only |
| `POST /api/pin` | Pin an encrypted bundle and cache it | Valid `RadoPinBundle` signature from a registered wallet (D-043), bundle format and size check |
| `GET /api/records/[cid]` | Return a bundle from Pinata or the cache | Hash must match the on-chain record |
| `POST /api/escrow/release` | Re-wrap an emergency summary key for a responder | Matching on-chain event, registered responder signature, single use |
| `POST /api/inbox` | Store one encrypted message | Registered sender and recipient, fresh request signature, size and pending limits |
| `POST /api/inbox/list` | Return the caller's pending messages | Fresh recipient request signature |
| `POST /api/inbox/ack` | Delete messages after successful decryption | Fresh recipient request signature |

The RPC proxy lets the HTTPS app talk to the local HTTP blockchain. It also prevents other devices on the shared Wi-Fi from calling Hardhat's administrative methods or using its unlocked accounts.

## Private Message Inbox

The inbox carries policy and claim messages between laptops. L4 stores and forwards encrypted bytes plus delivery details; it should not be able to read the message contents.

**Message flow:**

1. **Insurer → Patient, `policy-terms`:** the private policy terms.
2. **Hospital → Patient, `claim-request`:** `encounterId`, `procedureCode`, `claimAmount`, `claimDay`, `payoutAddress`, the hospital public key and Merkle path, and a hospital EdDSA signature over `requestHash = Poseidon(REQUEST_DOMAIN, encounterId, procedureCode, claimAmount, claimDay, payoutAddress)`.
3. **Patient → Hospital, `claim-approval`:** the policy terms without the coverage list, the Merkle path for this one procedure (D-032), and the patient's EdDSA signature over `claimHash`.
4. **Hospital:** verifies the approval, signs `claimHash`, and generates the proof. The hospital signs twice because `claimHash` needs the policy commitment, which it learns from the approval.

**Envelope visible to L4:** `messageId`, `sender`, `recipient`, `createdAt`, `ephemeralPublicKey`, `iv`, `ciphertext`. `messageId` is 32 lowercase hex characters.

**Encryption:** the client encrypts `{ type, body }` to the recipient's registered X25519 key with an ephemeral key, HKDF, and AES-256-GCM. AES-GCM additional data binds `rado/inbox/v1`, `messageId`, `sender`, and `recipient`.

**Sender checks, before a client shows or acts on a message:**

- `policy-terms` must hash to a registered policy commitment and name the recipient's registered patient key.
- `claim-request` must have a valid hospital signature over the recomputed `requestHash`, and the hospital key must be in the current approved root.
- `claim-approval` must have terms that hash to a registered policy commitment and a valid signature from that policy's patient key over the recomputed `claimHash`.

**Request authentication:** clients sign inbox requests with their derived EdDSA key, so polling causes no MetaMask popups. Each request includes the action, wallet, single-use nonce, an expiry at most 60 seconds ahead, and the ciphertext hash when sending. The signed digest is keccak256 of those fields with the tag `rado/inbox-auth/v1`, reduced to the BN254 field. L4 verifies it against the key registered on-chain. The digest does not cover `recipient`, `messageId`, or acknowledged IDs (D-042).

**Exact byte encodings:**

- Inbox AAD, 69 bytes: tag `rado/inbox/v1` (13), `messageId` (16), `sender` (20), `recipient` (20).
- Inbox HKDF salt, 64 bytes: `ephemeralPublicKey || recipientX25519PublicKey`.
- Request digest input, 111 bytes: tag (18), action (1: send `1`, list `2`, ack `3`), wallet (20), nonce (32), `expiresAt` as unsigned big-endian seconds (8), ciphertext hash (32, zeros unless `send`). The ciphertext hash is keccak256 of the decoded ciphertext bytes.

**Delivery and retention:**

- Clients poll `/api/inbox/list` every 3 seconds.
- A retry with the same sender, `messageId`, and ciphertext succeeds without creating a duplicate. The same ID with different ciphertext is refused.
- A message is deleted only after the recipient decrypts and acknowledges it, or after 24 hours.
- Each message is limited to 64 KiB, with at most 50 pending messages per recipient.
- Ciphertext is stored one message per file in the git-ignored `.cache/inbox/`, so an app restart keeps it.
- The inbox is never the only copy of policy terms, because the insurer can resend them.
- Logs contain no message bodies, and inbox URLs contain no wallet addresses.

## Invariants

1. Diagnosis, procedure code, prescriptions, treatment history, and record contents never appear in readable form on-chain, in events, in logs, in URLs, or in server requests.
2. Every record is encrypted in the browser before it leaves the device.
3. Pinata and the L4 cache only ever receive encrypted bundles.
4. A readable record key is never stored on-chain, on IPFS, or on a server.
5. Derived private keys and the unlock signature stay in browser memory and are never persisted or transmitted.
6. Proof generation runs only in the Hospital browser, and witness data never reaches a server in readable form.
7. The circuit's public signals are exactly the six listed values in the listed order.
8. A claim pays out only after the verifier accepts its proof in the same transaction.
9. Each nullifier can be used only once.
10. Total paid for a policy never exceeds its registered cap.
11. A proof is bound to its claim amount, day, and payout address through `claimHash`.
12. Every AES-GCM encryption uses a fresh random IV.
13. Revocation rotates the record key before the app reports it complete.
14. Escrow can release only emergency summary keys, and only after a matching on-chain break-glass event.
15. Every grant, revoke, key rotation, break-glass, and claim emits an audit event.
16. The RPC proxy never forwards `hardhat_*`, `evm_*`, `debug_*`, `personal_*`, or `eth_sendTransaction`.
17. Demo wallets are newly generated accounts funded by the seed script, never Hardhat's public default accounts or a wallet holding real funds.
18. `PINATA_JWT` and `ESCROW_PRIVATE_KEY` are read only in server-only modules.
19. Every inbox message is encrypted to the recipient's registered X25519 key before it leaves the sender's browser.
20. The inbox server stores and returns only ciphertext and routing metadata.
21. Server logs never contain inbox message bodies, and inbox URLs never contain wallet addresses.
22. A client never shows or acts on an inbox message until its sender check passes.
23. Only the authenticated recipient can list or acknowledge its inbox messages.
24. A placeholder circuit, verifier, or proving file is never used in a rehearsal, final E2E run, or the demo.

## Architecture Decisions

- **D-009 — Derive ZK and encryption keys from one MetaMask unlock signature.** Reason: verifying MetaMask signatures in the circuit is too heavy for browser proving, and MetaMask's built-in encryption methods are deprecated. Source: setup interview.
- **D-010 — Use Circom and Groth16.** Reason: circomlib has ready-made parts for these checks, and proofs are small and cheap to verify. The team accepts harder syntax and a demo-only trusted setup. Source: setup interview.
- **D-011 — Run contracts on a local Hardhat chain hosted by L4.** Reason: transactions are free and instant, with no faucet or block waits on stage. Judges cannot use a public explorer, so the Public Chain View fills that role. Source: setup interview.
- **D-012 — Store encrypted bundles on Pinata through a server route.** Reason: not recorded during setup. Accepted tradeoff: this requires a secret, a small backend, and internet access during the demo. Source: setup interview.
- **D-013 — Pre-pin demo records and keep an encrypted cache on L4.** Reason: the demo must survive an internet outage, and hash-checked ciphertext exposes no readable data. Source: setup interview.
- **D-014 — Use Next.js with TypeScript.** Reason: the frontend and secret-holding routes run as one app on L4. Source: setup interview.
- **D-015 — Limit break-glass to an escrowed emergency summary.** Reason: responders need critical data when a patient cannot act, while full records stay outside the trusted service. Source: setup interview.
- **D-016 — Re-encrypt on revoke.** Reason: an on-chain flag alone would leave the doctor's existing key able to decrypt the same file. Source: setup interview.
- **D-017 — Add claim day and payout address to the four required public inputs.** Reason: they stop backdating and proof-copying payment redirects. The insurer can see which hospital was paid. Source: setup interview.
- **D-018 — Pay claims in a mock 6-decimal stablecoin.** Reason: balances read like real insurance amounts and have no real value. Source: setup interview.
- **D-019 — Use an npm workspaces monorepo.** Reason: circuits, contracts, and app share generated files, and npm needs no extra install. Source: setup interview.
- **D-020 — Use Tailwind, wagmi with viem, and ESLint with Prettier.** Reason: these were proposed in the setup plan and confirmed by the team. Source: setup interview.

## Standing Constraints

Ongoing rules move here from Key Decisions using the format `- **D-NNN — Rule.** Reason: ... Source: ...`.

- **D-024 — Exchange private policy and claim messages through an encrypted `/api/inbox` on L4.** Reason: the flow needs insurer-to-patient and hospital-to-patient exchanges across laptops, and this adds no on-chain link between a patient and a visit. Accepted tradeoff: L4 can see who messaged whom and when. Source: documentation review, W07 and W10.
- **D-025 — Set `MAX_CLAIM_AGE_DAYS` to 30.** Reason: the contract needs a fixed window to stop backdated claims (D-017), and the team selected the recommended 30 days. Source: post-setup confirmation, W05.
- **D-026 — Reject claims dated before a policy's on-chain registration day.** Reason: "active policy" needs a start as well as an expiry, and a contract check needs no circuit change. Accepted tradeoff: the start day is public. Source: W01 decision round.
- **D-027 — Have the Insurer approve registered hospitals, with approved leaves emitted on-chain.** Reason: hospital keys come from the MetaMask unlock, so the root cannot be fixed in sample data, and no script needs a hospital private key. Source: W01 decision round.
- **D-030 — Reject payout values above 160 bits in `submitClaim`.** Reason: casting a larger field value to an address would silently change it. Source: W01 plan, user-approved.
- **D-031 — Update the bundle hash and CID inside `grantAccess` and `revokeAndRotate`.** Reason: a grant changes the bundle, and a single revoke transaction avoids a state where access is revoked but the old key still opens the current record. Source: W01 plan, user-approved.
- **D-032 — Send the hospital one covered-procedure path, not the full coverage list.** Reason: the hospital needs only this claim's proof inputs, so the patient's wider coverage stays private. Source: W01 plan, user-approved.
- **D-033 — Take `claimDay` from the latest block's UTC day.** Reason: a laptop clock ahead of UTC could otherwise produce a claim the contract rejects as future-dated. Source: W01 plan, user-approved.
- **D-034 — Omit the contract address from the unlock signing domain.** Reason: including it would change every user's derived keys whenever contracts are redeployed. Source: W01 plan, user-approved.
- **D-035 — Use ESLint `^9.39.5` instead of `^10.15.0`.** Reason: `eslint-config-next` installs React, import, and accessibility plugins that declare support only up to ESLint 9. Version 9 installs without peer conflicts and caught the same planted problems. Source: W02 plan, user-approved.
- **D-036 — Use Node 26 on all four laptops.** Reason: the team needs one major version, and the app build, Hardhat compile, lint, clean install, and claim vector all passed on it. `engine-strict` makes another version fail at install. Source: W02 plan, user-approved.
- **D-037 — Use one branch per work item and let items start on stand-ins, ticking them only after their checks pass on real dependencies.** Reason: sequential track branches made later items wait, while the tick rule and placeholder guards keep unproven work out of the demo. Source: team workflow discussion, user-approved 2026-11-22.
- **D-040 — Restrict `mint`, `setResponder`, `registerPolicy`, and `updateHospitalRoot` to one insurer wallet set at deployment, using `NotInsurer(address caller)`.** Reason: `abi.ts` had no authorization rule, and open calls would let anyone approve a fake hospital and drain the pool. Source: W05 plan, user-approved 2026-11-23.
- **D-041 — Bind each wrapped record key with AAD `rado/wrap/v1 || recordId || reader`.** Reason: the docs did not specify this AAD, and binding it stops a wrapped key being moved to another record or reader without a shared type change. Source: W06 plan, user-approved 2026-11-23.

## Code Standards

**TypeScript**

- Use strict mode and avoid `any`. Validate all data crossing a network or wallet boundary.
- Use `bigint` for chain values, field elements, and amounts.

**Next.js**

- Crypto, wallet, and proving code live in client components or web workers.
- Modules that read secrets start with `import 'server-only'`.
- Only `NEXT_PUBLIC_` variables may reach the browser, and they must never contain secrets.

**Naming and imports**

- Components use `PascalCase.tsx`, utilities use `kebab-case.ts`, contracts use `PascalCase.sol`, and circuits use `kebab-case.circom`.
- Shared constants, ABIs, addresses, and hash input orders are imported from `packages/shared`, never re-declared.

**Errors**

- Users see a plain reason, such as "This claim was already submitted."
- Logs must not contain witness values, keys, plaintext, or full request bodies.

**Solidity**

- Use custom errors, emit an audit event for each state change, and update state before external token transfers.

**Testing**

- Each circuit rule and contract guard needs a test proving invalid input is rejected.
- The scripted end-to-end flow must pass before merging integration work. UI is checked by rehearsal.

**Cross-platform scripts**

- The team uses both Windows and macOS, so repo scripts are written in Node rather than Bash and build file paths with `node:path`.

**Environment variables** (names only)

| Variable | Used in | Visibility |
| -------- | ------- | ---------- |
| `PINATA_JWT` | `/api/pin` | Secret |
| `PINATA_GATEWAY` | Pinata server client | Server config |
| `ESCROW_PRIVATE_KEY` | `/api/escrow/release` | Secret |
| `HARDHAT_RPC_URL` | `/api/rpc` | Server config |
| `DEMO_HOST_IP` | `allowedDevOrigins` in Next.js config | Server config |
| `NEXT_PUBLIC_CHAIN_ID` | Wallet config | Public |
| `RADO_ALLOW_PLACEHOLDER` | Local development deployment only | Development flag |

**Dependencies:** check the package against `context/library-docs.md` and add it there before installing anything new.
