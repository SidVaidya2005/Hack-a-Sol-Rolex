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
**Next:** W01 Shared interfaces and sample data

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

- **D-024 — Exchange private policy and claim messages through an encrypted `/api/inbox` on L4.** Reason: the flow needs insurer-to-patient and hospital-to-patient exchanges across laptops, and this adds no on-chain link between a patient and a visit. Accepted tradeoff: L4 can see who messaged whom and when. Source: documentation review, W07 and W10.

## Open Questions

- TODO: choose the allowed claim age for `MAX_CLAIM_AGE_DAYS` before W05. Recommended: 30 days.
- TODO: name the person who owns each track (T1 to T4) in `context/build-plan.md` before W01 ends.
- TODO: choose how the T1 laptop runs Circom before W03. The official macOS release binary is Intel-only, so an Apple Silicon laptop needs Rosetta or a Rust build.
- TODO: confirm the final product name before the pitch. Rado is the working name.
- Library checks that need a real install or the venue network are listed as `TODO:` entries in `context/library-docs.md`.
