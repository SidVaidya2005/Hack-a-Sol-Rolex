# Progress Tracker

> **Purpose:** This page says what is done, what comes next, which recent choices were made, and what is still unresolved. Read it every session after `context/architecture.md`; then open the current work item in `context/build-plan.md`.

## How an AI Agent Should Use This Page

- Start with **Current Status** and work only on the listed **Next** item unless the user asks otherwise.
- Use the unchecked progress list as status, not as proof that a task has passed its checks.
- Before marking work complete, pass the item's checks and add its dated result to `context/build-plan.md`.
- Do not guess at the reason for a decision. Ask the user or leave it unresolved.

**Terms used here:** a **decision** is a choice the team has confirmed; an **open question** is a choice still waiting for an answer; a `TODO:` is a check that still needs to be done.

## How this file is maintained

- **Current Status:** update it whenever work changes. Keep only the latest status.
- **Progress:** check an item only after its Verify checks pass and a `**Result:**` entry is added under that item in `context/build-plan.md`.
- **Key Decisions:** when an important implementation choice is confirmed, add it here, newest first, using the next unused ID: `- **D-NNN — Choice.** Reason: ... Source: ...`. Keep setup decisions D-001 to D-023 in their existing sections.
- **Keep at most ten recent decisions:** when there are more, move each oldest item to the right home. Put an ongoing rule in Standing Constraints in `context/architecture.md`. Put a one-time choice under its work item in `context/build-plan.md`. Keep replaced choices with the replacement ID and reason; keep retired choices with their reason. Remove the old copy from this page.
- **Open Questions:** list decisions that still need an answer, without a decision ID. Once answered, record the decision and remove the question and its related `TODO:`.
- If a decision's reason is missing, ask rather than making one up.

## Current Status

**Last completed:** W06 Encryption and key library
**Next:** W03 and W04 on the placeholder circuit (Shikhar), W05 (Shreya), W07 (Shreyansh), and W08 (Siddarth), in parallel. W09 to W11 can start on stand-ins when an owner is free.

## Progress

- [x] W01 Shared interfaces and sample data
- [x] W02 Monorepo and tool setup
- [ ] W03 Claim circuit and rejection tests
- [ ] W04 Trusted setup and verifier
- [ ] W05 Smart contracts and tests
- [x] W06 Encryption and key library
- [ ] W07 Server routes
- [ ] W08 Role screens with sample data
- [ ] W09 Patient records and permissions
- [ ] W10 Hospital claim and browser proving
- [ ] W11 Settlement, insurer view, and end-to-end flow
- [ ] W12 Break-glass
- [ ] W13 Threat model and architecture diagram
- [ ] W14 Rehearsal, backup video, and pitch

## Key Decisions

- **D-039 — Keep the documented inbox request digest, which does not sign `recipient`, `messageId`, or acknowledged IDs.** Reason: changing it would change a documented crypto rule, and AES-GCM AAD still stops an altered message from being read as genuine. Accepted tradeoff: a party able to alter a request in transit, including L4, could misroute a send or change which messages are deleted, but could not read them. Source: W06 plan, user-approved 2026-11-23.
- **D-038 — Bind each wrapped record key with AAD `rado/wrap/v1 || recordId || reader`.** Reason: the docs did not specify this AAD, and binding it stops a wrapped key being moved to another record or reader without a shared type change. Source: W06 plan, user-approved 2026-11-23.
- **D-037 — Use one branch per work item and let items start on stand-ins, ticking them only after their checks pass on real dependencies.** Reason: sequential track branches made later items wait, while the tick rule and placeholder guards keep unproven work out of the demo. Source: team workflow discussion, user-approved 2026-11-22.
- **D-036 — Use Node 26 on all four laptops.** Reason: the team needs one major version, and the app build, Hardhat compile, lint, clean install, and claim vector all passed on it. `engine-strict` makes another version fail at install. Source: W02 plan, user-approved.
- **D-035 — Use ESLint `^9.39.5` instead of `^10.15.0`.** Reason: `eslint-config-next` installs React, import, and accessibility plugins that declare support only up to ESLint 9. Version 9 installs without peer conflicts and caught the same planted problems. Source: W02 plan, user-approved.
- **D-034 — Omit the contract address from the unlock signing domain.** Reason: including it would change every user's derived keys whenever contracts are redeployed. Source: W01 plan, user-approved.
- **D-033 — Take `claimDay` from the latest block's UTC day.** Reason: a laptop clock ahead of UTC could otherwise produce a claim the contract rejects as future-dated. Source: W01 plan, user-approved.
- **D-032 — Send the hospital one covered-procedure path, not the full coverage list.** Reason: the hospital needs only this claim's proof inputs, so the patient's wider coverage stays private. Source: W01 plan, user-approved.
- **D-031 — Update the bundle hash and CID inside `grantAccess` and `revokeAndRotate`.** Reason: a grant changes the bundle, and a single revoke transaction avoids a state where access is revoked but the old key still opens the current record. Source: W01 plan, user-approved.
- **D-030 — Reject payout values above 160 bits in `submitClaim`.** Reason: casting a larger field value to an address would silently change it. Source: W01 plan, user-approved.

## Open Questions

- Library checks that need a real install or the venue network are listed as `TODO:` entries in `context/library-docs.md`.
