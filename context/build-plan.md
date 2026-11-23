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

| Track | Owner | Owns | Lead on |
| ----- | ----- | ---- | ------ |
| T1 Circuits | Shikhar | Claim circuit, rejection tests, trusted setup, generated verifier | W03, W04, W10 |
| T2 Contracts | Shreya | Solidity, deployment, seed chain state, contract tests | W05, W11, W12 |
| T3 App | Siddarth | Role screens, wallet flows, browser proving UI, Public Chain View | W08, W09 |
| T4 Storage and Demo | Shreyansh | Encryption library, Pinata, cache, RPC proxy, inbox, escrow, network, rehearsal | W02, W06, W07, W13, W14 |

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

## Parallel Work

An item can **start** before its dependencies are finished by building against a stand-in. It can be **ticked** only when its original Verify checks pass against the real dependency (D-037).

| Item | Needs to start | Stand-in until ready | Needs to finish |
| ---- | -------------- | -------------------- | --------------- |
| W03 | W02 | None | W02 |
| W04 | W02 | Placeholder circuit | W03 |
| W05 | W02 | Placeholder verifier or test-only mock | W04 |
| W06 | W02 | None | W02 |
| W07 | W02 | `abi.ts`, agreed W06 signatures | W05, W06 |
| W08 | W02 | Sample data | W02 |
| W09 | W02, W06 signatures, W08 data layer | Labelled fakes behind the data layer | W05, W06, W07, W08 |
| W10 | W02, W04 placeholder files | Placeholder proving files, committed claim vector, labelled fakes | W04, W05, W06, W07, W08 |
| W11 | W02, W05 interfaces | Draft E2E script on placeholder files | W05, W08, W10 |
| W12 to W14 | As listed in `prompt.md` | None | As listed in `prompt.md` |

**Branches:** each item uses its own short-lived branch, named in `prompt.md`, such as `w04/trusted-setup`. W02 was completed on `track/storage`.

**Placeholder rules:**

- `circuits/placeholder/placeholder.circom` declares the same six public inputs, with the same names and order, as `Claim`. It proves none of the claim rules.
- Its generated files stay in `circuits/placeholder/` with a `manifest.json` containing `"placeholder": true`. Real proving files never go there.
- Deployment refuses the placeholder verifier unless `RADO_ALLOW_PLACEHOLDER=1` is set.
- The E2E script refuses placeholders unless run with `--draft`, and a draft run never counts as a pass.
- Rehearsals, the final E2E run, and the demo never use a placeholder (Invariant 24).

**Interfaces:** changes to `packages/shared` go through a small PR agreed by the affected owners.

## Work Items

### W01 Shared interfaces and sample data

**Owner:** all. Agree on the exact shared data shapes before tracks split up: the proof's public values and their order, Poseidon hash inputs, contract function signatures, event names, bundle JSON, and sample FHIR records, policies, hospitals, and procedure codes. Put these shared definitions in `packages/shared`.

**Plan:** `packages/shared` holds constants, types, human-readable ABIs, hash input orders, and synthetic sample data. `scripts/generate-claim-vector.mjs` writes one computed valid claim to `packages/shared/vectors/claim-valid.json`. Its keys come from public labels and must never be used for a demo wallet (D-028). This work also settled D-026 to D-034.

- **D-028 — Commit one computed valid claim using test keys derived from public labels.** Reason: tracks can detect hash and encoding mismatches at hour 1 instead of during integration, and no private key is stored. Source: W01 decision round.

**Verify:** all four owners review the shared types. Expected: each track can build against them without further changes.

**Result:** 2026-11-22. All four owners reviewed the shared types, confirmed by the team during W02 planning. Checks passed: strict TypeScript, ABI parsing with viem, 35 claim-vector checks, identical regeneration, and a clean secret scan. The vector still needs its real circuit and contract checks in W03 and W05. Decisions: D-026 to D-034.

### W02 Monorepo and tool setup

**Owner:** T4. Create the npm workspaces, install the selected ranges, configure TypeScript, ESLint, and Prettier, and record lockfile versions.

**Plan:** the root workspace holds `app`, `circuits`, `contracts`, and `packages/shared`, with no feature code. Node 26 is enforced at install (D-036), and ESLint stays on 9 because the plugins from `eslint-config-next` do not yet declare support for 10 (D-035). `.gitattributes` forces LF and Prettier skips the vector so it stays byte-identical across operating systems. `.env.example` lives in `app/` because Next.js loads environment files from its project folder.

**Verify:** `npm install` and `npm run lint` succeed on all four laptops. Expected: every laptop reports the same Node major version, `circom --version` on Shikhar's Windows laptop reports 2.2.3, and `node scripts/generate-claim-vector.mjs` leaves the committed vector unchanged.

**Result:** 2026-11-23. All four laptops passed on Node 26, as confirmed by the team and ticked in PR #5: `npm ci`, `npm run lint`, and byte-identical claim-vector regeneration, with `circom --version` reporting 2.2.3 on Shikhar's Windows laptop. One macOS laptop also passed these checks on 2026-11-22 with Node 26.13.0, from a clean copy of the tracked files: no peer conflicts, a planted lint failure, typecheck, format check, app build importing `@rado/shared`, Hardhat compile with OpenZeppelin, Node 24 refused at install, and Windows native packages present in the lockfile. Decisions: D-035, D-036.

### W03 Claim circuit and rejection tests

**Owner:** T1. Build the proof rules in `circuits/src/claim.circom`. Follow the exact specification in **ZK Claim Circuit** in `context/architecture.md`.

**Verify:** `circuits/src/claim.circom` compiles, the witness in `packages/shared/vectors/claim-valid.json` passes, and its public signals come out in the required order (D-029). Expected failures: unapproved hospital, expired policy, uncovered procedure, over limit, wrong commitment, wrong nullifier, tampered amount, day, or payout, and bad hospital or patient signature.

**Result:** 2026-11-23. Passed on Linux and on the GitHub Actions Windows runner (D-039, run 45069101245), both with Node 26.13.1 and Circom 2.2.3: 28 circuit tests passed and 0 failed, including each expected failure at its intended rule, and `Claim(8, 6)` has 27,352 constraints on both. The claim vector regenerated byte-identically on both. Lint, typecheck, and format check passed on Linux.

- **D-029 — Declare the six public inputs first in `Claim`, with no outputs.** Reason: snarkjs orders public signals by declaration and outputs are also public, so the `public` list alone does not guarantee the required order. W03 must confirm this in a test. Source: W01 plan, Context7 snarkjs and Circom docs.

**Not covered by W03 (later items must prove these):**

- **W04, real proofs:** W03 checks witnesses and constraints but generates no Groth16 proof. W04 must confirm that `groth16.fullProve` returns `publicSignals` in the required order (D-029), that the proof verifies with snarkjs and the Solidity verifier, and that changing each public signal fails verification.
- **W04, setup size:** 27,352 constraints fits a Powers of Tau file of power 15 (32,768). Confirm this when running setup. Any change to `claim.circom` requires regenerating the wasm, zkey, verification key, and verifier.
- **W05, contract-only rules:** the circuit does not range-check `payoutAddress`, so `submitClaim` must reject values above 160 bits (D-030). The contract also owns replay rejection, the total cap, the policy start day, and future or too-old claim days.
- **W10, browser proving:** proof time on L2 and snarkjs bundling are unmeasured.

**Build notes:** the third-party calls in W03 were checked against the locked circomlib and `circom_tester` source because Context7 was not signed in on the build laptop. The tests need `circom` on `PATH`.

### W04 Trusted setup and verifier

**Owner:** T1. Compile the circuit, create the demo proving keys, export the Solidity contract that checks proofs, and put the proving files where the app can load them. This setup is for the demo, not production use.

**Verify:** a proof generated from sample inputs verifies with snarkjs and with the generated Solidity verifier. Expected: changing any public signal makes verification fail.

**Status:** 2026-11-23. The setup script and placeholder files are merged through PR #8, and the placeholder passes every proof check on Linux with Node 26.13.1 and Circom 2.2.3. A rehearsal on the unmerged W03 circuit also passed: 27,352 constraints at power 15, `claim.wasm` 4.50 MB, `claim_final.zkey` 12.64 MB, and the sample proof accepted by snarkjs and Solidity with all six changed signals rejected. The rehearsal's real files were discarded and are not committed. The GitHub Actions Windows run 45069101245 also passed the real setup and proof checks at 27,352 constraints and power 15 (D-039). Its keys were discarded.

**Left to verify for W04 (blocks the tick):**

- [x] Merge W03 (PR #7).
- [x] Run the setup and proof checks on Windows through GitHub Actions (D-039, run 45069101245).
- [x] On LInep's Linux laptop, on a new `w04/real-setup` branch from the latest `main`, run `npm ci`, `npm run setup --workspace @rado/circuits`, and `npm run verify:setup --workspace @rado/circuits`. The setup takes about 4 minutes on the Linux build laptop.
- [x] Confirm 27,352 constraints, power 15, and `all checks passed`. Commit `app/public/zk/` and `contracts/contracts/Groth16Verifier.sol` together from that one run.
- [x] Confirm that run reports the sample proof accepted by snarkjs and Solidity, and each of the six changed public signals rejected by both. Stop and ask if a proving file reaches 100 MB or the circuit must change.
- [x] Before committing, confirm `git status` shows no `*.ptau` or `circuits/build/` files, and that `app/public/zk/manifest.json` has `"placeholder": false` and `"demoOnly": true`.
- [x] Add the dated `**Result:**`, tick W04 in Progress, update Current Status, and open the PR. Do not rerun setup after committing.

**Result:** 2026-11-23. One real setup ran on the Linux build laptop with Node 26.13.1 and Circom 2.2.3: 27,352 constraints, power 15, `claim.wasm` 4.50 MB, and `claim_final.zkey` 12.64 MB. The sample proof was accepted by snarkjs and the generated Solidity verifier, and each of the six changed public signals was rejected by both. All 28 circuit, 33 contract, and 56 shared tests passed, with the contract proof test using the REAL verifier. A fresh seed without `RADO_ALLOW_PLACEHOLDER` deployed with `placeholder: false`. Typecheck, format check, app build, lint with no errors, and byte-identical vector regeneration also passed.

**Not covered by W04 (later items must prove these):**

- **Team Windows laptops:** the Windows checks ran on a clean GitHub runner, not on a team laptop (D-039).
- **W05, deployment guard:** deployment must refuse the placeholder verifier unless `RADO_ALLOW_PLACEHOLDER=1` is set. W05 must also deploy the real `contracts/contracts/Groth16Verifier.sol` once it exists.
- **W10, browser proving:** loading `/zk/claim.wasm` and `/zk/claim_final.zkey` in a web worker, snarkjs bundling, and proof time on L2 are untested.
- **W11, final flow:** the E2E script must refuse placeholders unless run with `--draft`, and a draft run never counts as a pass (Invariant 24).

**Build notes:** the setup is demo-only and each run creates different keys, so rerun it after any `claim.circom` change and commit every output together. Contribution entropy stays in memory and is never saved. The third-party calls were checked against locked source because Context7 was not signed in on the build laptop.

### W05 Smart contracts and tests

**Owner:** T2. Build `MockUSD`, `RecordAccess`, and `ClaimSettlement` with deployment and seed scripts.

**Verify:** contract tests pass and compiled ABIs match `packages/shared/src/abi.ts`. Expected rejections: replayed nullifier, wrong root, unknown policy, payout value above 160 bits, claim day before policy registration, future claim day, claim day older than 30 days, over total cap, invalid proof, unauthorized record actions, and expired access.

**Plan:** `ClaimSettlement` runs the documented checks in order and updates state before paying. A single insurer wallet, fixed at deployment, controls the four admin calls (D-040). `npm run seed --workspace @rado/contracts` rebuilds a fresh node using newly generated wallets kept in the git-ignored `contracts/.env.demo-wallets`. It does not register keys, policies, or hospitals, because those need MetaMask unlock keys (D-027).

**Status:** 2026-11-23. On Linux with Node 26.13.1, 33 contract tests passed, including the ABI match, every expected rejection, replay, the cap, payout, and audit events. A real Groth16 proof settled through the **placeholder** verifier. The seed refused to run without `RADO_ALLOW_PLACEHOLDER=1` and rebuilt identical addresses after a node restart.

**Verification for the W05 tick:**

- [x] After W04 merges, merge `main` and confirm `npm test --workspace @rado/contracts` names the REAL verifier and passes.
- [x] Run the seed on a fresh node without `RADO_ALLOW_PLACEHOLDER` and confirm `placeholder` is `false` in `contracts/deployments/localhost.json`.
- [x] Add the dated `**Result:**`, tick W05 in Progress, and update Current Status.

**Result:** 2026-11-23. On the latest `main`, on Linux with Node 26.13.1, all 33 contract tests passed, including the ABI match, every expected rejection, and a Groth16 settlement through the REAL verifier. A fresh seed without `RADO_ALLOW_PLACEHOLDER` deployed with `placeholder: false`. All 28 circuit and 56 shared tests, typecheck, format check, app build, lint with no errors, and byte-identical vector regeneration also passed. Windows and macOS were not run. Decision: D-040.

**Build notes:** third-party calls were checked against locked package source because Context7 was not signed in on the build laptop.

### W06 Encryption and key library

**Owner:** T4. In `packages/shared`, build the key creation from the user's unlock signature, AES-GCM record encryption, X25519 wrapping of record keys for readers, key rotation, and inbox encryption and sender verification.

**Verify:** tests show that an approved reader decrypts, a non-reader fails, a rotated key blocks the old reader, and two encryptions use different IVs. Expected inbox failures: changed message ID, sender, or recipient fails decryption, and each forged message type fails its sender check.

**Plan:** `packages/shared/src/crypto` holds key derivation, record encryption and rotation, inbox encryption, request authentication, and sender checks. Wrapped-key AAD follows D-041, and the request digest keeps its documented fields (D-042). Sender checks also require the signing hospital or patient key to match the envelope sender's registered key, because anyone can encrypt to a public key and claim any sender address. The policy check also confirms the coverage list rebuilds `coveredRoot`.

**Result:** 2026-11-23. On Node 26.13.1, all 56 `@rado/shared` tests passed, covering every Verify check, all inbox failures, and forgeries of each message type against the committed claim vector. Typecheck, lint with no errors, format check, app build, a Next.js client-bundle probe, and byte-identical vector regeneration also passed. The library has not yet run in a real browser, so W09 and W10 exercise it there. Decisions: D-041, D-042.

### W07 Server routes

**Owner:** T4. Build the `/api/rpc`, `/api/pin`, `/api/records/[cid]`, and `/api/inbox` routes. Add the encrypted file cache and configure HTTPS so other laptops can safely reach the demo over the local network.

**Verify:** a second laptop loads the app over HTTPS with `crypto.subtle` available. Expected: `hardhat_*` and `eth_sendTransaction` are refused, a tampered cached bundle is rejected, and records still load with internet off.

**Verify inbox:** run the Private Message Inbox rules from a second laptop. Expected: unregistered senders, wrong recipients, reused nonces, and oversized messages are refused. A retry creates no duplicate, a message survives an app restart, acknowledgement deletes it, an expired message is removed, and server logs contain no message contents.

### W08 Role screens with sample data

**Owner:** T3. Build Patient, Hospital, Responder, Insurer, and Public Chain View with wallet connection and sample data.

**Verify:** each role completes its screen flow using sample data. Expected: the Insurer and Public Chain View have no field for medical data.

**Result:** 2026-11-23 — Patient record/access/claim-approval actions, Hospital sample claim and duplicate rejection, Responder summary request, Insurer policy view, and Public Chain View filtering all passed in a browser using sample data. Insurer/Public Chain View source search found no medical data fields; app source has no localStorage or sessionStorage references. Typecheck and production build passed; lint had no errors and one existing PostCSS config warning. The injected-wallet button and wagmi configuration are present, but a successful account connection was not exercised because the test browser had no injected wallet. The relative viem RPC URL resolved to the app origin; `/api/rpc` returned 404 because W07 has not added the route yet.

**Design pass (D-038):** the three-zone top nav replaces the sidebar. Patient, Hospital, Responder, and Insurer each use one dark focal band, and Public Chain View is fully dark. Sample data and actions are unchanged. Alternatives not chosen: a restyled sidebar, a role-locked header, color by role, a landing page, and the Lucide package.

**Result:** 2026-11-23 — Design pass passed typecheck, production build, and lint with no errors and the existing PostCSS warning. Browser checks at 390, 768, and 1440px found no horizontal scroll, page errors, or external requests. All sample actions, duplicate rejection, filtering, visible keyboard focus, and font loading passed. Insurer and Public Chain View showed no medical terms. A real MetaMask connection is still untested.

**Interactive pass, Slice 1 (D-044):** one simulated claim moves through Hospital request, Patient approval, simulated proof, submission, Insurer payout, and a Public Chain event. Remaining approved slices: (2) privacy lens, attack simulator, revoke and rotate; (3) Patient access controls, Hospital claim builder, Insurer details, live chain explorer.

**Result:** 2026-11-23 — Slice 1 passed typecheck, production build, and lint with no errors and the existing PostCSS warning. A browser run at 390, 768, and 1440px, plus reduced motion, passed the full story, blocked out-of-order actions, replay rejection, restart, proof continuation while switching roles, no horizontal scroll, no page errors, and no story network requests. Insurer and Public Chain showed no medical terms at any tested stage. The simulation stores nothing; wagmi's default `wagmi.store` connection entry remains in `localStorage`. Cross-laptop sync and real proofs are not part of this slice.

**Interactive pass, Slice 2 (D-044):** Patient and Hospital gain a privacy lens that omits hidden values from the page. Hospital gains a simulator for the seven invalid-claim cases. Patient gains a simulated revoke and rotate flow that reports revocation only after rotation finishes and adds both events to the Public Chain View in one block. Slice 3 remains: Patient access controls, Hospital claim builder, Insurer details, and live chain explorer.

**Result:** 2026-11-23 — Slice 2 passed typecheck, production build, and lint with no errors and the existing PostCSS warning. Browser runs at 390, 768, and 1440px, plus reduced motion, passed the Slice 1 story and all Slice 2 checks: lens visibility for each viewer, seven blocked attacks with no funds or chain changes, old-key failure after rotation, restart during rotation, no horizontal scroll, no page errors, no network requests, and no new browser storage. Attack outcomes are simulated and do not replace the circuit and contract rejection tests in W03 and W05.

**Interactive pass, Slice 3 (D-044, D-045):** Patient gains doctor grants with expiry, per-doctor revoke with rotation, decline, and audit filters. Hospital gains a claim builder that checks only the amount and public cap. Insurer gains claim filtering, sorting, and a details drawer with no medical fields. Public Chain View gains event filters, expandable rows, and copyable IDs. Private claim details stay in a separate draft context used only by Patient and Hospital.

**Result:** 2026-11-23 — Slice 3 passed typecheck, production build, and lint with no errors and the existing PostCSS warning. Browser runs at 390, 768, and 1440px, plus reduced motion, passed the Slice 1 and Slice 2 suites and all Slice 3 checks, including invalid amounts, patient decline of uncovered and over-limit claims, the Hospital not seeing the limit before approval, custom amounts reaching Insurer and Public Chain, drawer keyboard close, re-grant after rotation, copy, restart, no horizontal scroll, no page errors, no network requests, and no new browser storage. Real wallet, proof, chain, and cross-laptop behavior remain untested.

**Result:** 2026-11-23 — INR display (D-046) passed typecheck, production build, lint with the existing PostCSS warning, and all three browser suites at 390, 768, and 1440px plus reduced motion. No role screen shows dollar text. W08 was unticked until one real MetaMask connection is tested.

**Result:** 2026-11-23 — On Windows with Node 26 against a seeded local chain, MetaMask connected with an imported demo Patient wallet, added Rado Local through `http://127.0.0.1:3000/api/rpc`, showed the connected state, and read the wallet's 100 ETH balance. Chrome connected to the app and not directly to Hardhat, and the app log showed no RPC or route failures. Typecheck, production build, and lint passed with the existing PostCSS warning. A manual desktop click-through passed record, access, claim, replay, seven attacks, Responder, Insurer, and Public Chain flows, with no medical data on the Insurer or Public Chain screens. Phone and tablet widths were not rerun in this pass. Real proofs, payments, and cross-laptop behavior belong to W09 to W11.

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

- **D-021 — Use four track branches merged through quick PRs.** Reason: this keeps `main` safe to demo while four people work in parallel. Source: setup interview. Superseded by D-037: one branch per track prevented dependent items from merging separately.
- **D-022 — Use rejection tests plus one scripted end-to-end flow.** Reason: the most damaging failure is a proof that passes when it should fail, and a demo only shows the valid path. UI is checked by rehearsal. Source: setup interview.
- **D-023 — Use six compact documents, a 15,000-token essential-reading limit, and manual documentation checks.** Reason: four people need clear homes for information without maintaining an extra script during a 24-hour build. Source: setup interview.
