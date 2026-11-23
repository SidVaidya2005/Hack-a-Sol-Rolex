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

**Last completed:** W15 Lab and pharmacy sharing
**Next:** W14 Rehearsal, backup video, and pitch

**Left to do now:**

- **Host setup:** after a fresh clone, run `node scripts/generate-escrow-key.mjs` once on the host, then restart the app.
- **Before the first W14 rehearsal:** restart the Hardhat node, run the seed, register keys again, approve the hospital, register the policy, add the emergency summary again, and run break-glass once through MetaMask with real Pinata. A chain deployed before PR #31 still lets the insurer appoint responders.
- **After W15 merges:** every host must reseed so the lab and pharmacy wallets exist. Until then, those wallets appear as Unlisted and a share gives them the full record.
- **W16 on `w16/document-upload`:** built and passing automated and browser-viewer checks. It needs one MetaMask run with real Pinata before it can be ticked.
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
- [x] W15 Lab and pharmacy sharing
- [ ] W16 Patient document upload

## Key Decisions

- **D-061 — Share each document whole, only with its category's provider types, and show it on a PDF.js canvas with annotations off and download for the patient only.** Reason: a file cannot be field-filtered, and the viewer parses untrusted files on a page that holds keys. Accepted tradeoff: these are app-level rules, and an approved reader can still screenshot a page. Source: W16 plan, user-approved 2026-11-24.
- **D-060 — Let only patients upload documents, and store each one as its encrypted original of at most 750 KB, with no OCR.** Reason: the patient stays in control of their record, an unchanged original is what clinicians can trust, and OCR errors could misstate a dose. Accepted tradeoff: encrypted size stays visible and text inside a file is not searchable. Source: W16 planning, user-approved 2026-11-24.
- **D-059 — Keep the provider directory off-chain, built from the seed's deployment file and served by `GET /api/providers`.** Reason: an on-chain label such as a lab or pharmacy would turn public grants into medical hints. Accepted tradeoff: anyone with the directory can still match a public grant to a provider type, but not to its contents. Source: W15 plan, user-approved 2026-11-23.
- **D-058 — Share with labs and pharmacies through separate limited-copy records rebuilt from a field allowlist, and leave the contracts and circuit unchanged.** Reason: one record holds the diagnosis, medication, and procedure together, so a normal grant would show a pharmacy the diagnosis. Accepted tradeoff: a first share takes four wallet confirmations because it reuses the tested add and grant paths, and providers are read-only in this version. Source: W15 plan, user-approved 2026-11-23.
- **D-057 — Make the first wallet to pin a record ID its owner, and release an emergency summary only when that wallet is the on-chain patient.** Reason: `anchorRecord` is open, so a responder could otherwise anchor a pinned summary first and use break-glass with no event against the real patient. Keying on the record ID also stops a copied escrow key being pinned in another bundle. Accepted tradeoff: L4 holds owner markers, and a summary pinned before this change must be added again. Source: W13 code review, user-approved 2026-11-23.
- **D-056 — Give `RecordAccess.setResponder` to a separate responder-admin wallet set at deployment, using `NotResponderAdmin(address caller)`, and use a throwaway seed key that is never saved.** Reason: an insurer that controls the responder list could appoint itself and read emergency summaries, and a saved key would sit in the wallet file operators import from. Accepted tradeoff: this changes a shared ABI error, requires a reseed, and adding a responder later needs another reseed. Source: W13 threat review and code review, user-approved 2026-11-23.
- **D-055 — Store the emergency summary as a separate record wrapped to escrow, and release it once per on-chain break-glass event after a MetaMask `RadoEscrowRelease` signature.** Reason: the chain must not label record types, so an escrow-wrapped key is what separates a summary from a full record, and a per-event marker on disk keeps release single-use across restarts while each new access adds a timeline entry. Accepted tradeoff: a bundle's escrow reader reveals that it is a summary, though not its contents. Source: W12 plan, user-approved 2026-11-23.
- **D-054 — Show only live chain data on the Insurer and Public Chain screens, and leave the labeled sample walkthrough on the Patient and Hospital screens.** Reason: fake rows beside real payouts would undermine the privacy demo, and keeping the walkthrough keeps W11 small. Source: W11 plan, user-approved 2026-11-23.
- **D-053 — Show one data status per screen, and keep "simulated" wording on every proof, payment, and attack outcome.** Reason: repeated sample labels made the product feel fake, while removing the outcome labels would imply a real proof or payment happened (D-044). Accepted tradeoff: W10 and W11 must change each screen's status as its data becomes real. Source: W08 UI polish, user-approved 2026-11-23.
## Open Questions

- Library checks that need a real install or the venue network are listed as `TODO:` entries in `context/library-docs.md`.
- Should wagmi keep its default `wagmi.store` entry in `localStorage`? It holds wallet connection state and enables reconnects, but contains no claim or medical data.
- Should threat-model limitations 13 to 17 join Known Limitations in `context/project-overview.md`?
