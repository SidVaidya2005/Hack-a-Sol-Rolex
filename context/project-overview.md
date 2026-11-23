# Project Overview

> **Purpose:** This page explains what Rado is, who uses it, how the demo works, and what the team plans to build. Read it first in every session.

## How an AI Agent Should Use This Page

- Read this page before changing product behavior or user-facing screens.
- Treat the scope, success criteria, limitations, and decisions below as agreed requirements.
- If a requested change conflicts with them, point out the conflict and ask which requirement should take priority.
- Keep the technical names and exact values intact when implementing a requirement.

## Plain-Language Terms

- **Zero-knowledge (ZK) proof:** evidence that a rule is satisfied without revealing the private facts used to prove it. For example, Rado can prove that a procedure is covered without showing the procedure code to the insurer.
- **On-chain:** stored on the blockchain, where participants can inspect it. **Off-chain:** stored elsewhere, such as in an encrypted file.
- **FHIR-shaped:** sample records use the structure of the healthcare FHIR format; this does not mean Rado connects to a real hospital system.
- **Break-glass:** an emergency path that lets a registered responder access only a limited emergency summary.
- **Policy commitment:** a public fingerprint of private policy terms. It lets the contract recognize the policy without publishing its details.
- **Nullifier:** a one-time marker that prevents a claim from being paid twice. It does not reveal the visit identifier.
- **Mock stablecoin:** demo-only tokens that look like money in the app but have no real-world value.

## About the Project

Rado lets a hospital prove that an insurance claim meets the policy rules without showing the insurer the patient's diagnosis, procedure, prescriptions, or records. A smart contract checks the proof and pays the hospital automatically. Patient records stay encrypted outside the blockchain, and the patient chooses which doctors can read them.

This is a working prototype for the Hack-a-Sol hackathon, built by a four-person team in about 24 hours. The original brief is in `problemstatement.md`.

## The Problem It Solves

Today, hospitals often have to show insurers diagnoses, prescriptions, and treatment history to support a claim. Patient records are also held in central systems patients may not control. Manual claim review takes time and can be abused.

## Screens

- **Sign in and sign up** — wallet only. New wallets choose Patient or Hospital; assigned roles are detected (D-063).
- **Patient** — add typed records and PDF, PNG, or JPG files, grant or revoke doctor access, approve a specific claim, read the audit timeline.
- **Hospital** — doctor record view, create a claim, generate the proof in the browser, submit it.
- **Lab & Pharmacy** — read only the limited copy a patient shared with that simulated provider (W15).
- **Emergency Responder** — give a reason, invoke break-glass, and read only the patient's profile.
- **Insurer** — issue policies, fund the payout pool, see verified claims and payouts with no medical data.
- **Public Chain View** — shows exactly what an outsider can read on-chain, on the host laptop's screen.

## Core User Flow

### 1. Patient sets up

The patient unlocks Rado by signing once in MetaMask, adds a FHIR-shaped record that is encrypted in the browser, and gives a doctor access until a chosen expiry time. The blockchain stores only a fingerprint (hash) and file identifier (CID), not the readable record. The insurer sends the policy terms to the patient in an encrypted message.

### 2. Hospital prepares a claim

The doctor reads the record. The hospital prepares a claim for a covered procedure and amount, signs the request, and sends it to the patient in an encrypted message.

### 3. Patient approves

The patient reviews the claim on their own laptop and signs those exact details. The patient sends the approval and policy terms back to the hospital in an encrypted message.

### 4. Hospital proves

The hospital checks the patient's approval, signs the final claim, and creates a zero-knowledge proof in its browser. The private proof inputs stay on that laptop and are not sent to a server.

### 5. Contract settles

The contract checks the proof, rejects a claim that was already submitted, checks that the policy has enough of its total spending cap left, and pays demo-only tokens to the hospital.

### 6. Insurer and public verify

The insurer sees that the claim was verified and paid. The public view shows only the amount, policy fingerprint, one-time claim marker, approved-hospital-list fingerprint, claim day, and payout address.

### 7. Failure cases worth showing

Replaying the same claim is rejected. A revoked doctor can no longer open the current record. A break-glass access appears permanently in the patient's audit timeline.

## Demo Setup

| Laptop | Role | Notes |
| ------ | ---- | ----- |
| L1 | Patient | Own browser profile and MetaMask account |
| L2 | Hospital, Doctor, Responder | Strongest laptop because it generates proofs. Separate MetaMask accounts |
| L3 | Insurer | Own browser profile and MetaMask account |
| L4 | Host and Public Chain View | Runs the chain and app, holds server secrets and the encrypted cache |

When setting up, test whether the laptops can reach one another over venue Wi-Fi. If they cannot, connect them to the phone hotspot.

## Features In Scope

**Must-have features**

- ZK proof of: approved hospital, active policy, covered procedure, amount within the per-claim limit.
- Contract verification, replay rejection by nullifier, automatic payout.
- Encrypted off-chain records on IPFS, hashes on-chain, patient grant and revoke.
- Patient → Hospital → Insurer interface.
- Architecture and privacy threat-model diagram showing on-chain and off-chain data.

**Bonus features (all selected)**

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

Mention these clearly in both the pitch and the threat model.

- A claim amount can hint at the type of treatment.
- The insurer can see which hospital was paid and can link claims made under one policy commitment.
- A doctor can keep anything they already decrypted. Expiry is enforced by the contract and app until the patient rotates the key.
- The app logs doctor views on-chain before decrypting, but a modified client could skip that step.
- The escrow service on L4 is trusted for emergency summaries only, and briefly holds a summary key in memory while re-wrapping it.
- Anyone who can fetch an encrypted bundle can see that it has an escrow reader, so they can tell it is an emergency summary without being able to read it.
- The L4 host cannot read inbox messages, but it can see who messaged whom and when.
- Inbox request signatures do not cover the recipient, message ID, or acknowledged IDs, so L4 or someone altering traffic could misroute or delete messages, but could not read them (D-042).
- The Groth16 trusted setup and all wallets are demo-grade.
- Anyone reading the chain can see which patient wallet granted access to which doctor wallet, and when.
- Public encrypted bundles list their readers' wallet addresses.
- Old bundles stay on IPFS after a key rotation, so a revoked doctor can still open the old version with their old key.
- Anyone with the off-chain provider directory can match public grants to a provider type, such as learning that a patient shared something with a pharmacy, but not what was shared (D-059).
- A pharmacy may infer a condition from a prescription, because field filtering cannot hide what a medicine implies (D-058).
- An uploaded file is shared whole, its encrypted size stays visible, and Rado cannot detect a real document (D-060, D-061).
## Product Decisions

- **D-001 — Use Rado as the product name.** Reason: the team confirmed it as the final name. Source: setup interview and post-setup confirmation.
- **D-002 — Assign L1 Patient, L2 Hospital with Doctor and Responder, L3 Insurer, L4 Host and Public Chain View.** Reason: each main role gets a visible screen, the strongest laptop proves, and the public view demonstrates privacy. Source: setup interview.
- **D-003 — Use venue Wi-Fi with HTTPS.** Reason: not recorded during setup. Accepted tradeoff: venues may block device-to-device traffic, so the on-arrival check and phone hotspot are the fallback. Source: setup interview.
- **D-004 — Include all four bonuses, with break-glass built last and cut first.** Reason: audit events, expiry, and FHIR shape are cheap inside the core, while break-glass must not endanger the main claim flow. Source: setup interview.
- **D-005 — Require both hospital and patient signatures inside the proof.** Reason: a licensed hospital could otherwise invent a treatment that never happened. Source: setup interview.
- **D-006 — Enforce a private per-claim limit in the proof and a public total cap in the contract.** Reason: a per-claim limit alone lets many separate claims drain a policy. The cap is public but contains no medical data. Source: setup interview.
- **D-007 — Reuse the patent's encrypt, IPFS, on-chain anchor, and dashboard pipeline, but replace its key handling and drop sensors, ML, and QKD.** Reason: its storage pipeline fits, but keeping the decryption key beside the file or on-chain would let anyone read patient records. Source: setup interview, `CS.docx`, `Drawings.docx`.
- **D-008 — Keep `CS.docx` and `Drawings.docx` out of git and do not copy their text.** Reason: they appear to be an unfiled patent draft with named applicants, and this repo pushes to GitHub. Source: setup interview.
