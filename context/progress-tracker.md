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

**Last completed:** W10 Hospital claim and browser proving
**Next:** W11 is built and its E2E script passes. It stays unticked until the flow passes across all four laptops, including the Mac.

**Left to do now:**

- **W11 owners:** run the four-laptop MetaMask flow from a fresh seed, then record the result.
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
- [ ] W11 Settlement, insurer view, and end-to-end flow
- [ ] W12 Break-glass
- [ ] W13 Threat model and architecture diagram
- [ ] W14 Rehearsal, backup video, and pitch

## Key Decisions

- **D-054 — Show only live chain data on the Insurer and Public Chain screens, and leave the labeled sample walkthrough on the Patient and Hospital screens.** Reason: fake rows beside real payouts would undermine the privacy demo, and keeping the walkthrough keeps W11 small. Source: W11 plan, user-approved 2026-11-23.
- **D-052 — Add a signed, encrypted `claim-decline` inbox message from the patient to the hospital.** Reason: without it, the Hospital keeps showing Awaiting patient after a decline. The signature stops anyone else from cancelling a claim. Accepted tradeoff: this adds one shared message type, so affected owners must be told. Source: W10 two-laptop test, user-approved 2026-11-23.
- **D-051 — Test W10 with the Insurer in a separate Chrome profile on the host, but leave W10 unticked until a real third laptop runs it.** Reason: the team has two laptops now, and W10's Verify names separate Insurer, Patient, and Hospital laptops. Source: W10 plan, user-approved 2026-11-23.
- **D-050 — Include minimal approve-hospital and register-policy actions on the Insurer screen in W10.** Reason: policy delivery cannot work until a hospital is approved and a policy is registered, and those actions are needed in the demo. Source: W10 plan, user-approved 2026-11-23.
- **D-049 — Derive each policy salt from the Insurer's unlocked EdDSA seed and the patient wallet with keccak256 and the tag `rado/policy-salt/v1`.** Reason: private terms cannot be stored in readable form, and this lets the Insurer rebuild and resend them after a refresh. Accepted tradeoff: each patient has one demo policy per insurer key. Source: W10 plan, user-approved 2026-11-23.
- **D-048 — Let patients choose a doctor from wallets registered on-chain.** Reason: this avoids copying addresses between laptops during the demo. Accepted tradeoff: the list shows short addresses without names, so the patient must confirm the right wallet. Source: W09 plan, user-approved 2026-11-23.
- **D-047 — Give the browser contract addresses through a read-only `GET /api/contracts` route.** Reason: the addresses live in a git-ignored server file and are already public on-chain, and a route lets a fresh seed work without a rebuild. Source: W09 plan, user-approved 2026-11-23.
- **D-046 — Display mock token amounts in INR at 1 token = ₹1, without changing contracts or shared token names.** Reason: the user asked for rupees, the token has no real value so no exchange rate is needed, and `MockUSD` and `mUSD` are shared interfaces owned by other work items. Accepted tradeoff: the UI says INR while code and contracts still say mUSD until the team chooses to rename them. Source: user request, W08, 2026-11-23.
- **D-045 — Keep coverage and per-claim limit checks on the Patient screen, and show the Hospital the limit only after approval.** Reason: the hospital must not learn the patient's wider coverage (D-032), and it receives policy terms only in the approval message. Accepted tradeoff: an invalid request reaches the patient before it is stopped, and the patient must decline it. Source: W08 interactive pass, Slice 3, user-approved direction 2026-11-23.
- **D-044 — Link W08 role screens through one labeled, in-memory claim simulation whose state holds no medical data.** Reason: judges can follow the whole claim across roles now, Insurer and Public Chain cannot read private fields from it, and W09 to W11 can replace its named actions with real logic. Accepted tradeoff: it syncs only inside one browser and must not stand in for the four-laptop demo (Invariant 24). Source: W08 interactive plan, user-approved 2026-11-23.

## Open Questions

- Library checks that need a real install or the venue network are listed as `TODO:` entries in `context/library-docs.md`.
- Should wagmi keep its default `wagmi.store` entry in `localStorage`? It holds wallet connection state and enables reconnects, but contains no claim or medical data.
