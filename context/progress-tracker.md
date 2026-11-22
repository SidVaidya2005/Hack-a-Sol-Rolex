# Progress Tracker

> **Role:** Current work, progress, recent decisions, and open questions for Rado. **Read every session**, after `context/architecture.md` and before opening the active work item in `context/build-plan.md`.

## How this file is maintained

- **Current Status:** replace it whenever work changes, keeping only the latest state.
- **Progress:** tick an item in place only after its Verify checks pass and its `**Result:**` line is added in `context/build-plan.md`.
- **Key Decisions:** record each consequential implementation decision when confirmed, newest first, using the next unused ID as `- **D-NNN — Choice.** Reason: ... Source: ...`. Setup decisions D-001 to D-023 stay in their governing sections.
- **Recent limit:** keep ten entries. When exceeded, classify the oldest. Move an ongoing rule to Standing Constraints in `context/architecture.md`. Move a historical choice to its work item in `context/build-plan.md`. Keep superseded choices there with their replacement ID and reason, and retired choices with their reason. Remove the source record after moving it.
- **Open Questions:** keep unresolved choices here until answered, with no decision ID. When answered, record the decision and remove the question and its related `TODO:`.
- Ask about a missing reason instead of inventing one.

## Current Status

**Last completed:** Nothing yet — build not started
**Next:** W01 Shared interfaces and sample data. Built on `w01/shared-interfaces`, waiting for review by all four owners.

## Progress

- [ ] W01 Shared interfaces and sample data
- [ ] W02 Monorepo and tool setup
- [ ] W03 Claim circuit and rejection tests
- [ ] W04 Trusted setup and verifier
- [ ] W05 Smart contracts and tests
- [ ] W06 Encryption and key library
- [ ] W07 Server routes
- [ ] W08 Role screens with sample data
- [ ] W09 Patient records and permissions
- [ ] W10 Hospital claim and browser proving
- [ ] W11 Settlement, insurer view, and end-to-end flow
- [ ] W12 Break-glass
- [ ] W13 Threat model and architecture diagram
- [ ] W14 Rehearsal, backup video, and pitch

## Key Decisions

- **D-034 — Omit the contract address from the unlock signing domain.** Reason: including it would change every user's derived keys whenever contracts are redeployed. Source: W01 plan, user-approved.
- **D-033 — Take `claimDay` from the latest block's UTC day.** Reason: a laptop clock ahead of UTC could otherwise produce a claim the contract rejects as future-dated. Source: W01 plan, user-approved.
- **D-032 — Send the hospital one covered-procedure path, not the full coverage list.** Reason: the hospital needs only this claim's proof inputs, so the patient's wider coverage stays private. Source: W01 plan, user-approved.
- **D-031 — Update the bundle hash and CID inside `grantAccess` and `revokeAndRotate`.** Reason: a grant changes the bundle, and a single revoke transaction avoids a state where access is revoked but the old key still opens the current record. Source: W01 plan, user-approved.
- **D-030 — Reject payout values above 160 bits in `submitClaim`.** Reason: casting a larger field value to an address would silently change it. Source: W01 plan, user-approved.
- **D-029 — Declare the six public inputs first in `Claim`, with no outputs.** Reason: snarkjs orders public signals by declaration and outputs are also public, so the `public` list alone does not guarantee the required order. W03 must confirm this in a test. Source: W01 plan, Context7 snarkjs and Circom docs.
- **D-028 — Commit one computed valid claim using test keys derived from public labels.** Reason: tracks can detect hash and encoding mismatches at hour 1 instead of during integration, and no private key is stored. Source: W01 decision round.
- **D-027 — Have the Insurer approve registered hospitals, with approved leaves emitted on-chain.** Reason: hospital keys come from the MetaMask unlock, so the root cannot be fixed in sample data, and no script needs a hospital private key. Source: W01 decision round.
- **D-026 — Reject claims dated before a policy's on-chain registration day.** Reason: "active policy" needs a start as well as an expiry, and a contract check needs no circuit change. Accepted tradeoff: the start day is public. Source: W01 decision round.
- **D-025 — Set `MAX_CLAIM_AGE_DAYS` to 30.** Reason: the contract needs a fixed window to stop backdated claims (D-017), and the team selected the recommended 30 days. Source: post-setup confirmation, W05.

## Open Questions

- Library checks that need a real install or the venue network are listed as `TODO:` entries in `context/library-docs.md`.
