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

**Last completed:** W05 Smart contracts and tests
**Next:** W07 and W08 continue in parallel, and W09 to W11 can start on stand-ins when an owner is free.

**Left to do now:**

- **Shreyansh, W07:** routes, cache, and LAN HTTPS are built and pass `scripts/check-server-routes.mjs` on L4 against deployed contracts, with Pinata stubbed. Still unticked until these run: the same script from a real second laptop, `crypto.subtle` in that laptop's browser, a real Pinata upload and gateway read, and a real internet-off record load.
- **Siddarth, W08:** merge the latest `main` into `w08/role-screens`, test a real MetaMask connection and the relative `/api/rpc` URL, and open the PR. W08's D-038 makes eleven Key Decisions, so move D-033 to its right home in that merge.
- **W10 and W11 owners:** switch to the real proving files once W04 merges. The E2E script must refuse placeholders unless run with `--draft`.
- **Everyone:** never use the placeholder in a rehearsal or the demo, and never rerun the real setup unless `claim.circom` changes, because each run creates different keys.

## Progress

- [x] W01 Shared interfaces and sample data
- [x] W02 Monorepo and tool setup
- [x] W03 Claim circuit and rejection tests
- [x] W04 Trusted setup and verifier
- [x] W05 Smart contracts and tests
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

- **D-043 — Authorize `/api/pin` with a MetaMask EIP-712 `RadoPinBundle` signature over the wallet, bundle hash, nonce, and expiry.** Reason: the docs require a registered wallet's signature without defining its format, and this needs no change to the shared inbox digest. Accepted tradeoff: one MetaMask prompt per pin. Source: W07 review, user-approved 2026-11-23.
- **D-042 — Keep the documented inbox request digest, which does not sign `recipient`, `messageId`, or acknowledged IDs.** Reason: changing it would change a documented crypto rule, and AES-GCM AAD still stops an altered message from being read as genuine. Accepted tradeoff: a party able to alter a request in transit, including L4, could misroute a send or change which messages are deleted, but could not read them. Source: W06 plan, user-approved 2026-11-23.
- **D-041 — Bind each wrapped record key with AAD `rado/wrap/v1 || recordId || reader`.** Reason: the docs did not specify this AAD, and binding it stops a wrapped key being moved to another record or reader without a shared type change. Source: W06 plan, user-approved 2026-11-23.
- **D-040 — Restrict `mint`, `setResponder`, `registerPolicy`, and `updateHospitalRoot` to one insurer wallet set at deployment, using `NotInsurer(address caller)`.** Reason: `abi.ts` had no authorization rule, and open calls would let anyone approve a fake hospital and drain the pool. Source: W05 plan, user-approved 2026-11-23.
- **D-039 — Accept the GitHub Actions Windows run as the W03 and W04 Windows check, and generate the committed proving files on LInep's Linux laptop.** Reason: the run passed the required checks on a clean Windows machine, and each setup creates different keys, so the team must commit the output of only one run. Accepted tradeoff: this does not prove the checks pass on a specific team laptop. Source: Windows run 45069101245, user-approved 2026-11-23.
- **D-037 — Use one branch per work item and let items start on stand-ins, ticking them only after their checks pass on real dependencies.** Reason: sequential track branches made later items wait, while the tick rule and placeholder guards keep unproven work out of the demo. Source: team workflow discussion, user-approved 2026-11-22.
- **D-036 — Use Node 26 on all four laptops.** Reason: the team needs one major version, and the app build, Hardhat compile, lint, clean install, and claim vector all passed on it. `engine-strict` makes another version fail at install. Source: W02 plan, user-approved.
- **D-035 — Use ESLint `^9.39.5` instead of `^10.15.0`.** Reason: `eslint-config-next` installs React, import, and accessibility plugins that declare support only up to ESLint 9. Version 9 installs without peer conflicts and caught the same planted problems. Source: W02 plan, user-approved.
- **D-034 — Omit the contract address from the unlock signing domain.** Reason: including it would change every user's derived keys whenever contracts are redeployed. Source: W01 plan, user-approved.
- **D-033 — Take `claimDay` from the latest block's UTC day.** Reason: a laptop clock ahead of UTC could otherwise produce a claim the contract rejects as future-dated. Source: W01 plan, user-approved.

## Open Questions

- Library checks that need a real install or the venue network are listed as `TODO:` entries in `context/library-docs.md`.