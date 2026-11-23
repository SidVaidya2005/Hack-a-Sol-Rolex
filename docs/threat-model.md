# Rado Threat Model

This page describes the system as built on `main`. The diagram is [`threat-model.drawio`](threat-model.drawio): page 1 shows the architecture and data, and page 2 shows attacks and limitations.

Rado is a hackathon prototype. It uses synthetic patient data, mock tokens, a local chain, and demo-grade keys. It is not suitable for real patient data, real claims, or real funds.

## What Rado Protects

- **Medical privacy:** diagnosis, procedure, prescriptions, treatment history, and record contents stay out of readable form on-chain, in Pinata, in the L4 cache and inbox, and on the Insurer screen.
- **Claim integrity:** a claim pays only when a valid proof shows an approved hospital, an active policy, a covered procedure, an amount within the limit, and both patient and hospital signatures.
- **Patient control:** patients grant and revoke doctor access, and access events are recorded on-chain.
- **Limited emergency access:** a registered responder can get only an escrow-wrapped emergency summary, after an on-chain break-glass event.

## Roles and Trust

| Party | Can read | Trusted for | Not trusted for |
| ----- | -------- | ----------- | --------------- |
| Patient (L1) | Own records and policy terms | Approving their own claims and access | Inventing a claim alone: the hospital must also sign |
| Hospital and Doctor (L2) | Granted records, claim details, the terms needed for one claim | Honest treatment claims, protecting witness data | Paying itself without patient approval |
| Emergency Responder (L2) | The emergency summary after a logged event | Using break-glass only in a real emergency | Reading full records |
| Insurer (L3) | Policy terms, public claim values, payout hospital | Issuing policies, approving hospitals | Seeing the record or claimed procedure, or appointing responders |
| Responder admin | Public chain data | Approving genuine emergency responders | Reading records or summaries through this role alone |
| L4 Host | Ciphertext, routing metadata, server secrets | Running the app and chain honestly, escrow for summaries | Reading records or inbox messages through its stored data |
| Pinata and IPFS | Encrypted bundles | Availability | Confidentiality |
| Outsider | All on-chain data and any public bundle | Nothing | Everything |

## Data Locations

| Location | Holds | Must never hold |
| -------- | ----- | --------------- |
| Chain | Record hash, CID, grants, expiry, public keys, policy commitment, start day, total cap, roots, approved hospital leaves, nullifiers, six public claim values, audit events | Diagnosis, procedure, prescriptions, treatment history, record contents, resource types, record titles |
| Pinata and L4 cache | Encrypted bundle: ciphertext, IV, per-reader encrypted keys | Plaintext or unwrapped keys |
| L4 inbox | Encrypted messages plus sender, recipient, message ID, and timestamps | Plaintext, message type, or decryption keys |
| Patient browser memory | Derived keys and decrypted records during use | Anything persisted in readable form |
| Hospital browser memory | Claim witness and proof inputs | Anything sent to a server in readable form |
| L4 server environment | Pinata token and escrow private key | Patient plaintext |

## Attacks Handled

| # | Attack | What stops it | Checked by |
| - | ------ | ------------- | ---------- |
| A1 | Claim from an unapproved hospital | Merkle proof against the on-chain hospital root | Circuit tests, E2E |
| A2 | Claim on an expired policy | Circuit requires claim day before expiry | Circuit tests |
| A3 | Uncovered procedure | Merkle proof against the private coverage root | Circuit tests |
| A4 | Amount over the per-claim limit | Range-checked comparison in the circuit | Circuit tests |
| A5 | Many claims draining a policy | Contract enforces the public total cap | Contract tests |
| A6 | Forged hospital or patient approval | Both EdDSA signatures are verified in the circuit | Circuit tests |
| A7 | Replaying a claim | One-time nullifier recorded by the contract | Contract tests, E2E |
| A8 | Changing amount, day, or payout | Values are public proof inputs bound through `claimHash` | Circuit tests, E2E |
| A9 | Backdated or future-dated claim | Contract checks policy start, today, and the 30-day limit | Contract tests |
| A10 | Oversized payout value | Contract rejects values above 160 bits | Contract tests |
| A11 | Fake admin approves a hospital, policy, or responder, or mints tokens | Calls accept only the insurer or responder-admin wallet | Contract tests |
| A12 | Revoked doctor opens the current record | Revocation rotates the key and re-encrypts | Shared tests, `check-patient-records`, W09 run |
| A13 | Tampered bundle from Pinata or the cache | Every read must match the on-chain hash | `check-server-routes` |
| A14 | Moving a wrapped key to another record or reader | AES-GCM AAD binds record and reader | Shared tests |
| A15 | Altered inbox message | AES-GCM AAD binds message ID, sender, and recipient | Shared tests |
| A16 | Forged inbox message | Client sender checks run before showing or acting on it | Shared tests, `check-claim-exchange` |
| A17 | Replayed or unauthorized inbox request | Signed request, single-use nonce, 60-second expiry | `check-server-routes` |
| A18 | LAN device calls Hardhat admin methods | RPC allowlist checks every call in a batch | `check-server-routes` |
| A19 | Path traversal through a CID or message ID | Strict format checks before file access | `check-server-routes` |
| A20 | Escrow release with no event, wrong wallet, or repeat | On-chain event, responder signature, single-use marker | E2E |
| A21 | Escrow release of a full record | Only a bundle wrapped to escrow can be released | E2E |
| A22 | Pointing a new record at another patient's summary, or anchoring a pinned summary first, to avoid the audit log | Escrow requires the bundle's record to match the event and its first pin signer to be the on-chain patient (D-057) | E2E |
| A23 | Insurer appoints itself as a responder to read a summary | `setResponder` accepts only a separate responder-admin wallet (D-056) | Contract tests, E2E |

## Known Limitations

**Already documented:**

1. A claim amount can hint at the type of treatment.
2. The insurer can see which hospital was paid and can link claims made under one policy commitment.
3. A doctor can keep anything they already decrypted. Expiry is enforced by the contract and app until the patient rotates the key.
4. The app logs doctor views on-chain before decrypting, but a modified client could skip that step.
5. The escrow service on L4 is trusted for emergency summaries and briefly holds a summary key in memory while re-wrapping it.
6. Anyone who can fetch a bundle can see that it has an escrow reader, so they can tell it is an emergency summary without reading it.
7. L4 cannot read inbox messages, but it can see who messaged whom and when.
8. Inbox request signatures do not cover the recipient, message ID, or acknowledged IDs, so L4 or someone altering traffic could misroute or delete messages, but could not read them (D-042).
9. The Groth16 trusted setup and all wallets are demo-grade.

**Added during W13:**

10. Anyone reading the chain can see which patient wallet granted access to which doctor wallet, and when.
11. Public encrypted bundles list their readers' wallet addresses.
12. Old bundles stay on IPFS after a key rotation, so a revoked doctor can still open the old version with their old key.

**Found during W13, awaiting team review:**

13. A separate wallet approves responders (D-056). In the demo, whoever runs the seed chooses the responder, and the admin key is discarded afterward. A dishonest seed operator could appoint the wrong wallet, but the access would appear in the patient's timeline.
14. A proof shows that the patient and hospital agreed on a claim, not that the treatment happened. If they collude, they can claim up to the policy's limits.
15. L4 serves the app's code. A malicious host could ship modified code that reads data in users' browsers, so "L4 cannot read" assumes it serves the honest app.
16. L4 runs the local chain. Its operator could reset it, and its audit trail lasts only as long as that node's state.
17. If a patient rotates a key during an emergency release, the responder's retry can log a second access for one actual release. This over-reports access and does not hide it.

**Added by W15, awaiting team review:**

18. Anyone with the off-chain provider directory can match a public grant to a provider type, such as a pharmacy, but cannot read what was shared (D-059).
19. A pharmacy may infer a condition from a prescription, because field filtering cannot hide what a medicine implies (D-058).

**Added by W16, awaiting team review:**

20. An uploaded document is shared whole, so a provider can read everything in that file. Category limits are app-level and a modified client could bypass them (D-061).
21. The PDF viewer parses untrusted files on a page that holds unlocked keys, and the app has no Content Security Policy. File checks, a pinned PDF.js version, and disabled annotations reduce this risk but do not remove it (D-061).
22. A document's encrypted size is visible to anyone who can fetch its bundle, and Rado cannot detect a real medical document (D-060).