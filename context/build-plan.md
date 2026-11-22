# Build Plan

> **Role:** The four work tracks, 24-hour timeline, work items, and completion checks. **Read the section for the current work item** named in `context/progress-tracker.md`.

## How this file is maintained

- Keep work items in the same order as Progress in `context/progress-tracker.md`.
- When an item is complete, add a dated `**Result:**` line under it with the checks run and any useful reasoning, referencing decision IDs. This is the project's completion history.
- Do not delete completed work descriptions.
- Workflow Decisions holds setup-era records. A changed choice gets a new ID and the old record is marked `Superseded by` that ID with its reason.

## Core Principle

Agree shared interfaces first, build tracks in parallel against sample data, then connect one real claim end to end before adding break-glass. A working Patient → Hospital → Insurer flow always outranks a bonus.

## Tracks

| Track | Owner | Owns | Branch |
| ----- | ----- | ---- | ------ |
| T1 Circuits | Shikhar | Claim circuit, rejection tests, trusted setup, generated verifier | `track/circuits` |
| T2 Contracts | Shreya | Solidity, deployment, seed chain state, contract tests | `track/contracts` |
| T3 App | Siddarth | Role screens, wallet flows, browser proving UI, Public Chain View | `track/app` |
| T4 Storage and Demo | Shreyansh | Encryption library, Pinata, cache, RPC proxy, inbox, escrow, network, rehearsal | `track/storage` |

## Timeline

| Hours | Goal | Work items |
| ----- | ---- | ---------- |
| 0-1 | Agree interfaces and sample data | W01 |
| 1-10 | Build each track | W02-W08 |
| 10-14 | Connect the full claim flow | W09-W11 |
| 14-18 | Break-glass, first to cut | W12 |
| 18-20 | Threat model and architecture diagram | W13 |
| 20-24 | Feature freeze, four-laptop rehearsals, backup video, pitch | W14 |

**Cut rule:** if W11 is not passing by hour 16, stop W12 and put everyone on the claim flow. After hour 20, only demo-breaking fixes are allowed.

## Work Items

### W01 Shared interfaces and sample data

**Owner:** all. Agree the public signal order, Poseidon inputs, contract function signatures, event names, bundle JSON, and sample FHIR records, policy, hospitals, and procedure codes in `packages/shared`.

**Plan:** `packages/shared` holds constants, types, human-readable ABIs, hash input orders, and synthetic sample data. `scripts/generate-claim-vector.mjs` writes one computed valid claim to `packages/shared/vectors/claim-valid.json`. Its keys come from public labels and must never be used for a demo wallet (D-028). This work also settled D-026 to D-034.

**Verify:** all four owners review the shared types. Expected: each track can build against them without further changes.

### W02 Monorepo and tool setup

**Owner:** T4. Create the npm workspaces, install the selected ranges, configure TypeScript, ESLint, and Prettier, and record lockfile versions.

**Verify:** `npm install` and `npm run lint` succeed on all four laptops. Expected: every laptop reports the same Node major version, `circom --version` on Shikhar's Windows laptop reports 2.2.3, and `node scripts/generate-claim-vector.mjs` leaves the committed vector unchanged.

### W03 Claim circuit and rejection tests

**Owner:** T1. Implement the circuit in `circuits/src/claim.circom`, using ZK Claim Circuit in `context/architecture.md` as the specification.

**Verify:** `circuits/src/claim.circom` compiles, the witness in `packages/shared/vectors/claim-valid.json` passes, and its public signals come out in the required order (D-029). Expected failures: unapproved hospital, expired policy, uncovered procedure, over limit, wrong commitment, wrong nullifier, tampered amount, day, or payout, and bad hospital or patient signature.

### W04 Trusted setup and verifier

**Owner:** T1. Compile, run the demo setup, export the Solidity verifier, and place the proving files where the app can load them.

**Verify:** a proof generated from sample inputs verifies with snarkjs and with the generated Solidity verifier. Expected: changing any public signal makes verification fail.

### W05 Smart contracts and tests

**Owner:** T2. Build `MockUSD`, `RecordAccess`, and `ClaimSettlement` with deployment and seed scripts.

**Verify:** contract tests pass and compiled ABIs match `packages/shared/src/abi.ts`. Expected rejections: replayed nullifier, wrong root, unknown policy, payout value above 160 bits, claim day before policy registration, future claim day, claim day older than 30 days, over total cap, invalid proof, unauthorized record actions, and expired access.

### W06 Encryption and key library

**Owner:** T4. Build unlock key derivation, AES-GCM record encryption, X25519 key wrapping, rotation, and inbox message encryption and sender checks in `packages/shared`.

**Verify:** tests show that an approved reader decrypts, a non-reader fails, a rotated key blocks the old reader, and two encryptions use different IVs. Expected inbox failures: changed message ID, sender, or recipient fails decryption, and each forged message type fails its sender check.

### W07 Server routes

**Owner:** T4. Build `/api/rpc`, `/api/pin`, `/api/records/[cid]`, and the `/api/inbox` routes with the encrypted cache, and configure LAN HTTPS.

**Verify:** a second laptop loads the app over HTTPS with `crypto.subtle` available. Expected: `hardhat_*` and `eth_sendTransaction` are refused, a tampered cached bundle is rejected, and records still load with internet off.

**Verify inbox:** run the Private Message Inbox rules from a second laptop. Expected: unregistered senders, wrong recipients, reused nonces, and oversized messages are refused. A retry creates no duplicate, a message survives an app restart, acknowledgement deletes it, an expired message is removed, and server logs contain no message contents.

### W08 Role screens with sample data

**Owner:** T3. Build Patient, Hospital, Responder, Insurer, and Public Chain View with wallet connection and sample data.

**Verify:** each role completes its screen flow using sample data. Expected: the Insurer and Public Chain View have no field for medical data.

### W09 Patient records and permissions

**Owner:** T3 and T4. Connect add record, grant, time-limited access, revoke with rotation, doctor view, and audit timeline.

**Verify:** across L1 and L2, a granted doctor reads a record. Expected: after revoke, the doctor cannot open the current version and the timeline shows each action.

### W10 Hospital claim and browser proving

**Owner:** T1 and T3. Connect insurer policy delivery and resend, the claim request, patient approval, both EdDSA signatures, and proof generation in a web worker, using the inbox message flow.

**Verify:** L3 delivers policy terms to L1, L2 sends a claim request, and L2 generates a valid proof after L1 approves. Expected: a forged claim request is rejected on L1 before it is shown, a retried message creates no duplicate, L2 sends witness data only as inbox ciphertext, and L4's server logs contain no message contents.

### W11 Settlement, insurer view, and end-to-end flow

**Owner:** T2 and T3. Connect `submitClaim`, payout, Insurer view, Public Chain View, and the scripted E2E flow.

**Verify:** the E2E script passes, and the same flow works across all four laptops. Expected: the hospital balance rises by the claim amount and a replay is rejected.

### W12 Break-glass

**Owner:** T2 and T4. Build responder registration, the emergency summary, `/api/escrow/release`, and the timeline entry. This is the first item to cut.

**Verify:** a registered responder gets only the summary after the on-chain event. Expected: requests without the event, from an unregistered wallet, for a full record, or repeated are refused.

### W13 Threat model and architecture diagram

**Owner:** T4 with team review. Show on-chain and off-chain data, trust boundaries, attacks handled, and known limitations.

**Verify:** compare the diagram with `context/architecture.md`. Expected: every data location and listed limitation appears.

### W14 Rehearsal, backup video, and pitch

**Owner:** all. Run the four-laptop setup on venue Wi-Fi, test the hotspot fallback, record a full backup run, and prepare the pitch.

**Verify:** complete two clean rehearsals from a fresh seed. Expected: one rehearsal also succeeds with Pinata unreachable, and the backup video plays on the presenting laptop.

## Workflow Decisions

- **D-021 — Use four track branches merged through quick PRs.** Reason: this keeps `main` safe to demo while four people work in parallel. Source: setup interview.
- **D-022 — Use rejection tests plus one scripted end-to-end flow.** Reason: the most damaging failure is a proof that passes when it should fail, and a demo only shows the valid path. UI is checked by rehearsal. Source: setup interview.
- **D-023 — Use six compact documents, a 15,000-token essential-reading limit, and manual documentation checks.** Reason: four people need clear homes for information without maintaining an extra script during a 24-hour build. Source: setup interview.
