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

**Last completed:** W08 Role screens with sample data
**Next:** W07 and W09 wait for their second-laptop checks, and W10 and W11 can start when an owner is free.

**Left to do now:**

- **Shreyansh, W07:** routes, cache, and LAN HTTPS are built and pass `scripts/check-server-routes.mjs` on L4 against deployed contracts, with Pinata stubbed, including on Windows with Node 26 (2026-11-23). On one laptop, a real Pinata upload and gateway read matched the on-chain hash, and the same record loaded from the encrypted cache with the internet off (2026-11-23). No second laptop is available yet, so W07 stays unticked. Still to run: the same script from a real second laptop and `crypto.subtle` in that laptop's browser.
- **Siddarth with Shreyansh, W09:** real add-record, grant, expiry, revoke with rotation, doctor view, and audit timeline are built on `w09/patient-records` and pass `scripts/check-patient-records.mjs` against the real contracts and routes, with Pinata stubbed. The full flow also passed through MetaMask on one laptop with real Pinata (2026-11-23). Still to run: the same flow with the patient on L1 and the doctor on L2. W09 stays unticked until then.
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
- [x] W08 Role screens with sample data
- [ ] W09 Patient records and permissions
- [ ] W10 Hospital claim and browser proving
- [ ] W11 Settlement, insurer view, and end-to-end flow
- [ ] W12 Break-glass
- [ ] W13 Threat model and architecture diagram
- [ ] W14 Rehearsal, backup video, and pitch

## Key Decisions

- **D-048 — Let patients choose a doctor from wallets registered on-chain.** Reason: this avoids copying addresses between laptops during the demo. Accepted tradeoff: the list shows short addresses without names, so the patient must confirm the right wallet. Source: W09 plan, user-approved 2026-11-23.
- **D-047 — Give the browser contract addresses through a read-only `GET /api/contracts` route.** Reason: the addresses live in a git-ignored server file and are already public on-chain, and a route lets a fresh seed work without a rebuild. Source: W09 plan, user-approved 2026-11-23.
- **D-046 — Display mock token amounts in INR at 1 token = ₹1, without changing contracts or shared token names.** Reason: the user asked for rupees, the token has no real value so no exchange rate is needed, and `MockUSD` and `mUSD` are shared interfaces owned by other work items. Accepted tradeoff: the UI says INR while code and contracts still say mUSD until the team chooses to rename them. Source: user request, W08, 2026-11-23.
- **D-045 — Keep coverage and per-claim limit checks on the Patient screen, and show the Hospital the limit only after approval.** Reason: the hospital must not learn the patient's wider coverage (D-032), and it receives policy terms only in the approval message. Accepted tradeoff: an invalid request reaches the patient before it is stopped, and the patient must decline it. Source: W08 interactive pass, Slice 3, user-approved direction 2026-11-23.
- **D-044 — Link W08 role screens through one labeled, in-memory claim simulation whose state holds no medical data.** Reason: judges can follow the whole claim across roles now, Insurer and Public Chain cannot read private fields from it, and W09 to W11 can replace its named actions with real logic. Accepted tradeoff: it syncs only inside one browser and must not stand in for the four-laptop demo (Invariant 24). Source: W08 interactive plan, user-approved 2026-11-23.
- **D-043 — Authorize `/api/pin` with a MetaMask EIP-712 `RadoPinBundle` signature over the wallet, bundle hash, nonce, and expiry.** Reason: the docs require a registered wallet's signature without defining its format, and this needs no change to the shared inbox digest. Accepted tradeoff: one MetaMask prompt per pin. Source: W07 review, user-approved 2026-11-23.
- **D-042 — Keep the documented inbox request digest, which does not sign `recipient`, `messageId`, or acknowledged IDs.** Reason: changing it would change a documented crypto rule, and AES-GCM AAD still stops an altered message from being read as genuine. Accepted tradeoff: a party able to alter a request in transit, including L4, could misroute a send or change which messages are deleted, but could not read them. Source: W06 plan, user-approved 2026-11-23.
- **D-041 — Bind each wrapped record key with AAD `rado/wrap/v1 || recordId || reader`.** Reason: the docs did not specify this AAD, and binding it stops a wrapped key being moved to another record or reader without a shared type change. Source: W06 plan, user-approved 2026-11-23.
- **D-040 — Restrict `mint`, `setResponder`, `registerPolicy`, and `updateHospitalRoot` to one insurer wallet set at deployment, using `NotInsurer(address caller)`.** Reason: `abi.ts` had no authorization rule, and open calls would let anyone approve a fake hospital and drain the pool. Source: W05 plan, user-approved 2026-11-23.
- **D-039 — Accept the GitHub Actions Windows run as the W03 and W04 Windows check, and generate the committed proving files on LInep's Linux laptop.** Reason: the run passed the required checks on a clean Windows machine, and each setup creates different keys, so the team must commit the output of only one run. Accepted tradeoff: this does not prove the checks pass on a specific team laptop. Source: Windows run 45069101245, user-approved 2026-11-23.

## Open Questions

- Library checks that need a real install or the venue network are listed as `TODO:` entries in `context/library-docs.md`.
- Should wagmi keep its default `wagmi.store` entry in `localStorage`? It holds wallet connection state and enables reconnects, but contains no claim or medical data.
