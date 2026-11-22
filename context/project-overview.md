# Project Overview

> **Role:** The agreed product description for Rado: what it does, who uses it, how the demo runs, and what this build includes. **Read first among the context files every session.**

## About the Project

Rado lets a hospital prove to an insurer that a claim is valid without revealing the patient's diagnosis, procedure, prescriptions, or records. A smart contract verifies the zero-knowledge proof and pays the hospital automatically. Patients keep their records encrypted off-chain and decide which doctors can read them.

This is a working prototype for the Hack-a-Sol hackathon, built by a four-person team in about 24 hours. The original brief is in `problemstatement.md`.

## The Problem It Solves

Insurance claims usually force hospitals to expose diagnoses, prescriptions, and treatment history to insurers. Records also sit in central silos that patients do not control, and manual settlement is slow and open to fraud.

## Screens

- **Patient** — view records, grant or revoke doctor access, approve a specific claim, read the audit timeline.
- **Hospital** — doctor record view, create a claim, generate the proof in the browser, submit it.
- **Emergency Responder** — invoke break-glass and read only the patient's emergency summary.
- **Insurer** — issue policies, fund the payout pool, see verified claims and payouts with no medical data.
- **Public Chain View** — shows exactly what an outsider can read on-chain, on the host laptop's screen.

## Core User Flow

### 1. Patient sets up

The patient unlocks Rado with one MetaMask signature, adds an encrypted FHIR-shaped record, and grants a doctor time-limited access. Only the record's hash and content ID go on-chain. The insurer sends the patient's policy terms as an encrypted message.

### 2. Hospital prepares a claim

The doctor reads the record. The hospital creates a claim for a covered procedure and amount, signs the request, and sends it to the patient as an encrypted message.

### 3. Patient approves

The patient sees the claim details on their own laptop, signs that exact claim, and returns the approval and policy terms to the hospital as an encrypted message.

### 4. Hospital proves

The hospital verifies the approval, signs the final claim, and generates a zero-knowledge proof in its browser. The proof inputs stay on that laptop.

### 5. Contract settles

The contract verifies the proof, rejects any replay, checks the policy's total cap, and pays mock stablecoin to the hospital.

### 6. Insurer and public verify

The insurer sees a paid, verified claim. The public view shows only the amount, policy commitment, nullifier, hospital root, claim day, and payout address.

### 7. Failure moments worth showing

Replaying the same claim is rejected. A revoked doctor can no longer open the current record. A break-glass access appears permanently in the patient's audit timeline.

## Demo Setup

| Laptop | Role | Notes |
| ------ | ---- | ----- |
| L1 | Patient | Own browser profile and MetaMask account |
| L2 | Hospital, Doctor, Responder | Strongest laptop because it generates proofs. Separate MetaMask accounts |
| L3 | Insurer | Own browser profile and MetaMask account |
| L4 | Host and Public Chain View | Runs the chain and app, holds server secrets and the encrypted cache |

On arrival, test laptop-to-laptop access on venue Wi-Fi. If it is blocked, switch all laptops to the phone hotspot.

## Features In Scope

**Must-have**

- ZK proof of: approved hospital, active policy, covered procedure, amount within the per-claim limit.
- Contract verification, replay rejection by nullifier, automatic payout.
- Encrypted off-chain records on IPFS, hashes on-chain, patient grant and revoke.
- Patient → Hospital → Insurer interface.
- Architecture and privacy threat-model diagram showing on-chain and off-chain data.

**Bonus, all selected**

- On-chain audit trail for grants, revokes, views, key rotations, break-glass, and claims.
- Time-bound doctor access.
- FHIR-shaped sample records (data format only).
- Break-glass access to an emergency summary. This is the first feature to cut if the build runs late.

## Features Out of Scope

- Real sensors, machine learning, or quantum key distribution from the reference patent.
- Real lab, pharmacy, or hospital-system integrations.
- Real money, mainnet, or production key custody.
- Email or password accounts.
- A public testnet deployment.
- Hiding the paying hospital from the insurer.

## Target User

Hackathon judges evaluating a credible prototype. The product roles are patients, hospital staff, emergency responders, and insurers.

## Success Criteria

- A valid claim goes from Patient to Hospital to Insurer across separate laptops and pays out on-chain.
- No diagnosis, procedure code, prescription, treatment history, or record content appears in readable form on-chain, in Pinata, in the L4 inbox, or on the Insurer screen.
- Each invalid-claim test is rejected: unapproved hospital, expired policy, uncovered procedure, over limit, over total cap, bad signature, replay.
- Revoking a doctor rotates the key so their old key cannot open the current record.
- All deliverables in `problemstatement.md` are present.

## Known Limitations

State these openly in the pitch and threat model.

- A claim amount can hint at the type of treatment.
- The insurer can see which hospital was paid and can link claims made under one policy commitment.
- A doctor can keep anything they already decrypted. Expiry is enforced by the contract and app until the patient rotates the key.
- The app logs doctor views on-chain before decrypting, but a modified client could skip that step.
- The escrow service on L4 is trusted for emergency summaries only.
- The L4 host cannot read inbox messages, but it can see who messaged whom and when.
- The Groth16 trusted setup and all wallets are demo-grade.

## Product Decisions

- **D-001 — Use Rado as the working product name.** Reason: the team chose it for now and may rename it later. Source: setup interview.
- **D-002 — Assign L1 Patient, L2 Hospital with Doctor and Responder, L3 Insurer, L4 Host and Public Chain View.** Reason: each main role gets a visible screen, the strongest laptop proves, and the public view demonstrates privacy. Source: setup interview.
- **D-003 — Use venue Wi-Fi with HTTPS.** Reason: not recorded during setup. Accepted tradeoff: venues may block device-to-device traffic, so the on-arrival check and phone hotspot are the fallback. Source: setup interview.
- **D-004 — Include all four bonuses, with break-glass built last and cut first.** Reason: audit events, expiry, and FHIR shape are cheap inside the core, while break-glass must not endanger the main claim flow. Source: setup interview.
- **D-005 — Require both hospital and patient signatures inside the proof.** Reason: a licensed hospital could otherwise invent a treatment that never happened. Source: setup interview.
- **D-006 — Enforce a private per-claim limit in the proof and a public total cap in the contract.** Reason: a per-claim limit alone lets many separate claims drain a policy. The cap is public but contains no medical data. Source: setup interview.
- **D-007 — Reuse the patent's encrypt, IPFS, on-chain anchor, and dashboard pipeline, but replace its key handling and drop sensors, ML, and QKD.** Reason: its storage pipeline fits, but keeping the decryption key beside the file or on-chain would let anyone read patient records. Source: setup interview, `CS.docx`, `Drawings.docx`.
- **D-008 — Keep `CS.docx` and `Drawings.docx` out of git and do not copy their text.** Reason: they appear to be an unfiled patent draft with named applicants, and this repo pushes to GitHub. Source: setup interview.
