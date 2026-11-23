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

**Last completed:** W13 Threat model and architecture diagram
**Next:** W14 Rehearsal, backup video, and pitch

**Left to do now:**

- **Host setup:** after a fresh clone, run `node scripts/generate-escrow-key.mjs` once on the host, then restart the app.
- **Before the first W14 rehearsal:** restart the Hardhat node, run the seed, register keys again, approve the hospital, register the policy, add the emergency summary again, and run break-glass once through MetaMask with real Pinata. A chain deployed before PR #31 still lets the insurer appoint responders.
- **W15 on `w15/cross-sharing`:** built and passing automated checks. It still needs a reseed and one MetaMask run with real Pinata before it can be ticked.
- **Everyone:** never use the placeholder in a rehearsal or the demo, and never rerun the real setup unless `claim.circom` changes, because each run creates different keys.

## Progress

- [x] W01 Shared interfaces and sample data
- [x] W02 Monorepo and tool setup
- [x] W03 Claim circuit and rejection tests
- [x] W04 Trusted setup and verifier
- [x] W05 Smart contracts and tests
- [x] W06 Encryption and key library
- [x] W07 Server routes
- [x] W08 Role screens with sample data
- [x] W09 Patient records and permissions
- [x] W10 Hospital claim and browser proving
- [x] W11 Settlement, insurer view, and end-to-end flow
- [x] W12 Break-glass
- [x] W13 Threat model and architecture diagram
- [ ] W14 Rehearsal, backup video, and pitch
- [ ] W15 Lab and pharmacy sharing

## Key Decisions

- **D-059 — Keep the provider directory off-chain, built from the seed's deployment file and served by `GET /api/providers`.** Reason: an on-chain label such as a lab or pharmacy would turn public grants into medical hints. Accepted tradeoff: anyone with the directory can still match a public grant to a provider type, but not to its contents. Source: W15 plan, user-approved 2026-11-23.
- **D-058 — Share with labs and pharmacies through separate limited-copy records rebuilt from a field allowlist, and leave the contracts and circuit unchanged.** Reason: one record holds the diagnosis, medication, and procedure together, so a normal grant would show a pharmacy the diagnosis. Accepted tradeoff: a first share takes four wallet confirmations because it reuses the tested add and grant paths, and providers are read-only in this version. Source: W15 plan, user-approved 2026-11-23.
- **D-057 — Make the first wallet to pin a record ID its owner, and release an emergency summary only when that wallet is the on-chain patient.** Reason: `anchorRecord` is open, so a responder could otherwise anchor a pinned summary first and use break-glass with no event against the real patient. Keying on the record ID also stops a copied escrow key being pinned in another bundle. Accepted tradeoff: L4 holds owner markers, and a summary pinned before this change must be added again. Source: W13 code review, user-approved 2026-11-23.
- **D-056 — Give `RecordAccess.setResponder` to a separate responder-admin wallet set at deployment, using `NotResponderAdmin(address caller)`, and use a throwaway seed key that is never saved.** Reason: an insurer that controls the responder list could appoint itself and read emergency summaries, and a saved key would sit in the wallet file operators import from. Accepted tradeoff: this changes a shared ABI error, requires a reseed, and adding a responder later needs another reseed. Source: W13 threat review and code review, user-approved 2026-11-23.
- **D-055 — Store the emergency summary as a separate record wrapped to escrow, and release it once per on-chain break-glass event after a MetaMask `RadoEscrowRelease` signature.** Reason: the chain must not label record types, so an escrow-wrapped key is what separates a summary from a full record, and a per-event marker on disk keeps release single-use across restarts while each new access adds a timeline entry. Accepted tradeoff: a bundle's escrow reader reveals that it is a summary, though not its contents. Source: W12 plan, user-approved 2026-11-23.
- **D-054 — Show only live chain data on the Insurer and Public Chain screens, and leave the labeled sample walkthrough on the Patient and Hospital screens.** Reason: fake rows beside real payouts would undermine the privacy demo, and keeping the walkthrough keeps W11 small. Source: W11 plan, user-approved 2026-11-23.
- **D-053 — Show one data status per screen, and keep "simulated" wording on every proof, payment, and attack outcome.** Reason: repeated sample labels made the product feel fake, while removing the outcome labels would imply a real proof or payment happened (D-044). Accepted tradeoff: W10 and W11 must change each screen's status as its data becomes real. Source: W08 UI polish, user-approved 2026-11-23.
- **D-052 — Add a signed, encrypted `claim-decline` inbox message from the patient to the hospital.** Reason: without it, the Hospital keeps showing Awaiting patient after a decline. The signature stops anyone else from cancelling a claim. Accepted tradeoff: this adds one shared message type, so affected owners must be told. Source: W10 two-laptop test, user-approved 2026-11-23.
- **D-051 — Test W10 with the Insurer in a separate Chrome profile on the host, but leave W10 unticked until a real third laptop runs it.** Reason: the team has two laptops now, and W10's Verify names separate Insurer, Patient, and Hospital laptops. Source: W10 plan, user-approved 2026-11-23.
- **D-050 — Include minimal approve-hospital and register-policy actions on the Insurer screen in W10.** Reason: policy delivery cannot work until a hospital is approved and a policy is registered, and those actions are needed in the demo. Source: W10 plan, user-approved 2026-11-23.
## Open Questions

- Library checks that need a real install or the venue network are listed as `TODO:` entries in `context/library-docs.md`.
- Should wagmi keep its default `wagmi.store` entry in `localStorage`? It holds wallet connection state and enables reconnects, but contains no claim or medical data.
- Should threat-model limitations 13 to 17 join Known Limitations in `context/project-overview.md`?
