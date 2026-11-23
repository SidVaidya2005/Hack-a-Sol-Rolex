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

**Last completed:** W16 Patient document upload
**Next:** Reseed, verify W17 and W18 through MetaMask, then W14 Rehearsal, backup video, and pitch

**Left to do now:**

- **Host setup:** after a fresh clone, run `node scripts/generate-escrow-key.mjs` once on the host, then restart the app.
- **Before the first W14 rehearsal:** restart the Hardhat node, run the seed, register keys again, approve the hospital, register the policy, add the emergency summary again, and run break-glass once through MetaMask with real Pinata. A chain deployed before PR #31 still lets the insurer appoint responders.
- **W18 reseed:** `RecordAccess` changed, so restart Hardhat and run the seed before using break-glass.
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
- [x] W16 Patient document upload
- [ ] W17 Wallet sign-up, roles, and patient profile
- [ ] W18 Production wording, Add record, and emergency profile

## Key Decisions

- **D-070 — Allow uploaded files up to 5 MB, with a 7 MiB bundle limit and a 64 MiB browser cache.** Reason: the user asked for 5 MB, and encryption and base64 add about a third. Accepted tradeoff: larger files take longer to upload, hash, and open. Source: user request, W18, 2026-11-24.
- **D-069 — Let patients share only with listed providers or insurer-approved hospitals, enforced before any wallet prompt, and never with the insurer.** Reason: the share list offered every wallet, so a patient could give the insurer a full record. Accepted tradeoff: a hospital must be approved before it can receive records. Source: W18 sharing review, user-approved 2026-11-24.
- **D-068 — Require a break-glass reason, encrypted to the responder and patient, with only its record ID on-chain.** Reason: patients should know why, and a public reason would be medical data. Accepted tradeoff: `invokeBreakGlass` changes and needs a reseed. Source: W18, user-approved 2026-11-24.
- **D-067 — Keep one responder and wrap each new patient profile to escrow, replacing the emergency summary button.** Reason: the user wants the responder to have the profile automatically. Accepted tradeoff: the responder can open the whole profile after a logged break-glass. Source: user request, W18, 2026-11-24.
- **D-066 — Let `POST /api/faucet` give an empty wallet 1 local ETH through `hardhat_setBalance`.** Reason: sign-up must register keys, and new wallets have no gas. Accepted tradeoff: any LAN device can fund an empty wallet, limited to 100 wallets per app run on chain 31337. Source: W17 test, user-reported 2026-11-24.
- **D-065 — Send a name-only encrypted card to hospitals, doctors, and responders when a patient saves a profile.** Reason: the user wants them to see `<name> - <wallet>` before any record is opened. Accepted tradeoff: reading a name is not logged and a card cannot be revoked. Source: user request, W17, 2026-11-24.
- **D-064 — Store patient details as one encrypted profile record, shareable only with a listed hospital or doctor or an insurer-approved hospital, and never with the insurer wallet.** Reason: the user asked that the hospital can see these details and the insurer cannot. Accepted tradeoff: the rule is app-level, and profiles cannot be edited in this version. Source: W17, user-approved 2026-11-24.
- **D-063 — Sign in with a wallet only, let wallets choose only Patient or Hospital, and read assigned roles from the chain and directory.** Reason: a password cannot unlock the keys and would make the host store identities, and a free role choice would show screens the contracts reject. Accepted tradeoff: a lost wallet cannot be recovered. Source: W17, user-approved 2026-11-24.
- **D-061 — Share each document whole, only with its category's provider types, and show it on a PDF.js canvas with annotations off and download for the patient only.** Reason: a file cannot be field-filtered, and the viewer parses untrusted files on a page that holds keys. Accepted tradeoff: these are app-level rules, and an approved reader can still screenshot a page. Source: W16 plan, user-approved 2026-11-24.
- **D-060 — Let only patients upload documents, and store each one as its encrypted original of at most 750 KB, with no OCR.** Reason: the patient stays in control of their record, an unchanged original is what clinicians can trust, and OCR errors could misstate a dose. Accepted tradeoff: encrypted size stays visible and text inside a file is not searchable. Source: W16 planning, user-approved 2026-11-24. Size limit superseded by D-070.
## Open Questions

- Library checks that need a real install or the venue network are listed as `TODO:` entries in `context/library-docs.md`.
- Should wagmi keep its default `wagmi.store` entry in `localStorage`? It holds wallet connection state and enables reconnects, but contains no claim or medical data.
- Should threat-model limitations 13 to 17 join Known Limitations in `context/project-overview.md`?
