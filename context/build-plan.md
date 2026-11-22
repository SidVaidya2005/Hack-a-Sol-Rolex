# Build Plan

> **Purpose:** This page assigns the four work tracks, sets the 24-hour schedule, and lists each task and how to check it. Read the task named as **Next** in `context/progress-tracker.md`.

## How an AI Agent Should Use This Page

- Work from the current item in `context/progress-tracker.md`; do not skip ahead without direction.
- Check both the task description and its **Verify** section before coding. They define the expected result.
- Keep shared interfaces and privacy requirements aligned with `context/architecture.md`.
- After completing a task, record the date, checks performed, outcome, and relevant decision IDs under its **Result** heading. Then update the tracker.
- If a check cannot be run, say so plainly; do not mark the task complete.

**Example:** if a task says “reject a replay,” submit the same claim twice and confirm the second submission fails. A successful normal claim alone does not prove replay protection works.

**Terms used here:** a **track** is one person's area of responsibility; a **work item** is a numbered task; and **Verify** lists the evidence needed before that task counts as complete.

## How this file is maintained

- Keep work items in the same order as the Progress list in `context/progress-tracker.md`.
- When an item is complete, add a dated `**Result:**` entry under it. Record the checks run, the outcome, useful reasoning, and relevant decision IDs. This becomes the project history.
- Do not delete completed work descriptions.
- Workflow Decisions holds setup-era records. A changed choice gets a new ID and the old record is marked `Superseded by` that ID with its reason.

## Core Principle

First agree on how the parts connect. Then let each track build against the same sample data. Next, make one complete claim work from patient to hospital to insurer. Only then add break-glass. A working claim flow matters more than any bonus feature.

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

**When to cut work:** if W11 has not passed by hour 16, stop W12 and move everyone to the claim flow. After hour 20, work only on fixes that would otherwise break the demo.

## Work Items

### W01 Shared interfaces and sample data

**Owner:** all. Agree on the exact shared data shapes before tracks split up: the proof's public values and their order, Poseidon hash inputs, contract function signatures, event names, bundle JSON, and sample FHIR records, policies, hospitals, and procedure codes. Put these shared definitions in `packages/shared`.

**Plan:** `packages/shared` holds constants, types, human-readable ABIs, hash input orders, and synthetic sample data. `scripts/generate-claim-vector.mjs` writes one computed valid claim to `packages/shared/vectors/claim-valid.json`. Its keys come from public labels and must never be used for a demo wallet (D-028). This work also settled D-026 to D-034.

**Verify:** all four owners review the shared types. Expected: each track can build against them without further changes.

**Result:** 2026-11-22. All four owners reviewed the shared types, confirmed by the team during W02 planning. Checks passed: strict TypeScript, ABI parsing with viem, 35 claim-vector checks, identical regeneration, and a clean secret scan. The vector still needs its real circuit and contract checks in W03 and W05. Decisions: D-026 to D-034.

### W02 Monorepo and tool setup

**Owner:** T4. Create the npm workspaces, install the selected ranges, configure TypeScript, ESLint, and Prettier, and record lockfile versions.

**Plan:** the root workspace holds `app`, `circuits`, `contracts`, and `packages/shared`, with no feature code. Node 26 is enforced at install (D-036), and ESLint stays on 9 because the plugins from `eslint-config-next` do not yet declare support for 10 (D-035). `.gitattributes` forces LF and Prettier skips the vector so it stays byte-identical across operating systems. `.env.example` lives in `app/` because Next.js loads environment files from its project folder.

**Verify:** `npm install` and `npm run lint` succeed on all four laptops. Expected: every laptop reports the same Node major version, `circom --version` on Shikhar's Windows laptop reports 2.2.3, and `node scripts/generate-claim-vector.mjs` leaves the committed vector unchanged.

**Checks so far:** 2026-11-22, one macOS laptop on Node 26.13.0, from a clean copy of the tracked files. Passed: `npm ci` with no peer conflicts, lint, a planted lint failure, typecheck, format check, app build importing `@rado/shared`, Hardhat compile with OpenZeppelin, byte-identical vector, Node 24 refused at install, and Windows native packages present in the lockfile. **Not yet run:** the other three laptops and `circom --version` on Windows. Add the dated Result and tick W02 after they pass.

### W03 Claim circuit and rejection tests

**Owner:** T1. Build the proof rules in `circuits/src/claim.circom`. Follow the exact specification in **ZK Claim Circuit** in `context/architecture.md`.

**Verify:** `circuits/src/claim.circom` compiles, the witness in `packages/shared/vectors/claim-valid.json` passes, and its public signals come out in the required order (D-029). Expected failures: unapproved hospital, expired policy, uncovered procedure, over limit, wrong commitment, wrong nullifier, tampered amount, day, or payout, and bad hospital or patient signature.

### W04 Trusted setup and verifier

**Owner:** T1. Compile the circuit, create the demo proving keys, export the Solidity contract that checks proofs, and put the proving files where the app can load them. This setup is for the demo, not production use.

**Verify:** a proof generated from sample inputs verifies with snarkjs and with the generated Solidity verifier. Expected: changing any public signal makes verification fail.

### W05 Smart contracts and tests

**Owner:** T2. Build `MockUSD`, `RecordAccess`, and `ClaimSettlement` with deployment and seed scripts.

**Verify:** contract tests pass and compiled ABIs match `packages/shared/src/abi.ts`. Expected rejections: replayed nullifier, wrong root, unknown policy, payout value above 160 bits, claim day before policy registration, future claim day, claim day older than 30 days, over total cap, invalid proof, unauthorized record actions, and expired access.

### W06 Encryption and key library

**Owner:** T4. In `packages/shared`, build the key creation from the user's unlock signature, AES-GCM record encryption, X25519 wrapping of record keys for readers, key rotation, and inbox encryption and sender verification.

**Verify:** tests show that an approved reader decrypts, a non-reader fails, a rotated key blocks the old reader, and two encryptions use different IVs. Expected inbox failures: changed message ID, sender, or recipient fails decryption, and each forged message type fails its sender check.

### W07 Server routes

**Owner:** T4. Build the `/api/rpc`, `/api/pin`, `/api/records/[cid]`, and `/api/inbox` routes. Add the encrypted file cache and configure HTTPS so other laptops can safely reach the demo over the local network.

**Verify:** a second laptop loads the app over HTTPS with `crypto.subtle` available. Expected: `hardhat_*` and `eth_sendTransaction` are refused, a tampered cached bundle is rejected, and records still load with internet off.

**Verify inbox:** run the Private Message Inbox rules from a second laptop. Expected: unregistered senders, wrong recipients, reused nonces, and oversized messages are refused. A retry creates no duplicate, a message survives an app restart, acknowledgement deletes it, an expired message is removed, and server logs contain no message contents.

### W08 Role screens with sample data

**Owner:** T3. Build Patient, Hospital, Responder, Insurer, and Public Chain View with wallet connection and sample data.

**Verify:** each role completes its screen flow using sample data. Expected: the Insurer and Public Chain View have no field for medical data.

### W09 Patient records and permissions

**Owner:** T3 and T4. Connect add record, grant, time-limited access, revoke with rotation, doctor view, and audit timeline.

**Verify:** across L1 and L2, a granted doctor reads a record. Expected: after revoke, the doctor cannot open the current version and the timeline shows each action.

### W10 Hospital claim and browser proving

**Owner:** T1 and T3. Connect the full private claim exchange: insurer sends or resends policy terms, hospital sends a claim request, patient approves it, both parties provide their EdDSA signatures, and the hospital browser creates the proof in a web worker. Use the inbox for messages.

**Verify:** L3 delivers policy terms to L1, L2 sends a claim request, and L2 generates a valid proof after L1 approves. Expected: a forged claim request is rejected on L1 before it is shown, a retried message creates no duplicate, L2 sends witness data only as inbox ciphertext, and L4's server logs contain no message contents.

### W11 Settlement, insurer view, and end-to-end flow

**Owner:** T2 and T3. Connect the contract's `submitClaim` function, token payout, Insurer screen, Public Chain View, and the scripted end-to-end (E2E) run.

**Verify:** the E2E script passes, and the same flow works across all four laptops. Expected: the hospital balance rises by the claim amount and a replay is rejected.

### W12 Break-glass

**Owner:** T2 and T4. Add responder registration, the limited emergency summary, `/api/escrow/release`, and the audit timeline entry. This is the first feature to drop if time is short.

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
