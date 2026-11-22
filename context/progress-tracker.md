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

**Last completed:** W03 Claim circuit and rejection tests
**Next:** LInep generates and commits the real W04 proving files. W05 to W08 continue in parallel, and W09 to W11 can start on stand-ins when an owner is free.

**Left to do now:**

- **LInep, W04:** on a new `w04/real-setup` branch from `main`, run the real setup once on Linux and open a PR with the proving files, the W04 Result, and the W04 tick. The steps are under W04 in `context/build-plan.md`.
- **W06 owner:** merge the latest `main` into PR #9, resolve its conflict in this file, and merge it after its Verify checks pass.
- **Shreya, W05:** make deployment refuse the placeholder verifier unless `RADO_ALLOW_PLACEHOLDER=1` is set, and deploy the real verifier once W04's files are on `main`.
- **Shreyansh, W07:** finish the server routes against the real W05 and W06 work.
- **Siddarth, W08:** merge the latest `main` into `w08/role-screens`, test a real MetaMask connection and the relative `/api/rpc` URL, and open the PR. W08's D-038 makes eleven Key Decisions, so move D-029 under W03 in that merge.
- **W10 and W11 owners:** switch to the real proving files once W04 merges. The E2E script must refuse placeholders unless run with `--draft`.
- **Everyone:** never use the placeholder in a rehearsal or the demo, and never rerun the real setup unless `claim.circom` changes, because each run creates different keys.

## Progress

- [x] W01 Shared interfaces and sample data
- [x] W02 Monorepo and tool setup
- [x] W03 Claim circuit and rejection tests
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

- **D-039 — Accept the GitHub Actions Windows run as the W03 and W04 Windows check, and generate the committed proving files on LInep's Linux laptop.** Reason: the run passed the required checks on a clean Windows machine, and each setup creates different keys, so the team must commit the output of only one run. Accepted tradeoff: this does not prove the checks pass on a specific team laptop. Source: Windows run 45069101245, user-approved 2026-11-23.
- **D-037 — Use one branch per work item and let items start on stand-ins, ticking them only after their checks pass on real dependencies.** Reason: sequential track branches made later items wait, while the tick rule and placeholder guards keep unproven work out of the demo. Source: team workflow discussion, user-approved 2026-11-22.
- **D-036 — Use Node 26 on all four laptops.** Reason: the team needs one major version, and the app build, Hardhat compile, lint, clean install, and claim vector all passed on it. `engine-strict` makes another version fail at install. Source: W02 plan, user-approved.
- **D-035 — Use ESLint `^9.39.5` instead of `^10.15.0`.** Reason: `eslint-config-next` installs React, import, and accessibility plugins that declare support only up to ESLint 9. Version 9 installs without peer conflicts and caught the same planted problems. Source: W02 plan, user-approved.
- **D-034 — Omit the contract address from the unlock signing domain.** Reason: including it would change every user's derived keys whenever contracts are redeployed. Source: W01 plan, user-approved.
- **D-033 — Take `claimDay` from the latest block's UTC day.** Reason: a laptop clock ahead of UTC could otherwise produce a claim the contract rejects as future-dated. Source: W01 plan, user-approved.
- **D-032 — Send the hospital one covered-procedure path, not the full coverage list.** Reason: the hospital needs only this claim's proof inputs, so the patient's wider coverage stays private. Source: W01 plan, user-approved.
- **D-031 — Update the bundle hash and CID inside `grantAccess` and `revokeAndRotate`.** Reason: a grant changes the bundle, and a single revoke transaction avoids a state where access is revoked but the old key still opens the current record. Source: W01 plan, user-approved.
- **D-030 — Reject payout values above 160 bits in `submitClaim`.** Reason: casting a larger field value to an address would silently change it. Source: W01 plan, user-approved.
- **D-029 — Declare the six public inputs first in `Claim`, with no outputs.** Reason: snarkjs orders public signals by declaration and outputs are also public, so the `public` list alone does not guarantee the required order. W03 must confirm this in a test. Source: W01 plan, Context7 snarkjs and Circom docs.

## Open Questions

- Library checks that need a real install or the venue network are listed as `TODO:` entries in `context/library-docs.md`.
