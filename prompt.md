# Rado Work Item Prompts

Copy-paste prompts for W02 to W14. Each owner runs their own prompts in Claude Code, on their own laptop and track branch.

The specs stay in `context/`. These prompts say what to read, what to build, what is easy to get wrong, and when to stop. If a prompt and a context document disagree, the context document wins and Claude should raise the conflict.

## Before You Start

1. **All four owners review W01** in `packages/shared`. W01 is merged but stays unticked until this review is done.
2. **Each teammate installs Context7** once in the repo, then restarts Claude Code:

   ```sh
   claude mcp add --transport http context7 https://mcp.context7.com/mcp
   ```

3. **Shikhar installs Circom 2.2.3** using the Windows steps in `context/library-docs.md`.
4. **Check for the `architect` and `remember` skills.** They are not stored in this repo. If a laptop does not have them, the prompts fall back to the same steps by hand.

## How to Use a Prompt

1. Pull `main` and open Claude Code in the repo.
2. Start a new session for each work item.
3. Copy the item's whole text block and paste it.
4. Answer Claude's questions and approve its plan.
5. Review the results, approve the commit, and have a person merge the PR.

## Run Order

| Hours | Items | Who |
| ----- | ----- | --- |
| 1-10, first | W02 | Shreyansh |
| 1-10, parallel | W03 then W04 | Shikhar |
| 1-10, parallel | W05 | Shreya |
| 1-10, parallel | W06 then W07 | Shreyansh |
| 1-10, parallel | W08 | Siddarth |
| 10-14 | W09 and W10, then W11 | Siddarth, Shikhar, then Shreya |
| 14-18 | W12, only after W11 passes | Shreya with Shreyansh |
| 18-20 | W13 | Shreyansh with team review |
| 20-24 | W14, feature freeze | Shreyansh with everyone |

**Cut rule:** if W11 has not passed by hour 16, stop W12 and move everyone to the claim flow. After hour 20, make only fixes that would otherwise break the demo.

For a shared item, the first listed owner leads and runs the prompt. The other owner reviews it and handles their track's part.

## Standard Workflow

Every prompt follows these steps.

1. **Prepare the branch.** Stop if the working tree has uncommitted changes. Switch to the named branch, creating it from `origin/main` if needed, then merge the latest `origin/main`.
2. **Check dependencies.** Confirm each item under Needs is merged to `main`. If one is missing, stop and report it unless the prompt says how to start without it.
3. **Restore context.** Use the `remember` skill with `restore`. If it is unavailable, read the essential documents in the order listed in `CLAUDE.md`.
4. **Plan and wait.** Use the `architect` skill for this work item. If it is unavailable, read the item, raise only decisions that change the build, and present a short plan. Write no code until the owner explicitly approves.
5. **Build only this item.** Follow every invariant. Use Context7 before writing third-party API calls.
6. **Verify.** Run every check in the item's Verify section in `context/build-plan.md` and the prompt's Prove list. Show the results. Report any check you could not run as not run.
7. **Update the docs.** If every check passed, add the dated `**Result:**`, tick Progress, and update Current Status. If a check is waiting on another laptop or person, list it and leave the item unticked. Record confirmed decisions, then use the `remember` skill with `save` if available.
8. **Ask before committing.** Stage files by name. Never stage `CS.docx`, `Drawings.docx`, `.env` files, private keys, wallet seeds, or certificates. Use a subject such as `W05 add claim settlement`. Add coauthors only if the owner asks.
9. **After approval, open a PR to `main`, then stop.** List what changed, the checks run, and anything not run. A person merges it. Never merge the PR or push directly to `main`.

### Rules for Parallel Work

- **This prompt selects the work item,** even if Current Status names a different active item.
- **Decision IDs:** take the next unused ID from the latest `origin/main` just before committing. If another PR takes it first, change your unmerged ID before merging.
- **Tracker conflicts:** keep every tick and every Result. Set Last completed to the newest merged item, and set Next to the unfinished items now in progress.
- **Shared interface changes:** stop and tell the affected owners. Make an agreed change in a small separate PR.

---

## W02 Monorepo and tool setup

**Owner:** Shreyansh | **Branch:** `track/storage` | **Hours:** 1-10, first | **Needs:** W01

```text
Work on W02 Monorepo and tool setup as Shreyansh on track/storage. Follow the Standard Workflow in prompt.md.

First ask whether all four owners have reviewed W01. If yes, add its dated Result and tick it in this PR. If no, stop.

Read: W02 in context/build-plan.md, Stack and Code Standards in context/architecture.md, Selected Versions in context/library-docs.md.

Build only: the root npm workspace, minimal circuits, contracts, and app workspaces, TypeScript, ESLint, Prettier, npm scripts, and .env.example with variable names only. Include no feature code.

Get right:
- Use the selected version ranges exactly. Record lockfile versions and remove that TODO.
- Choose one even Node major for all laptops. scripts/generate-claim-vector.mjs imports TypeScript directly, so confirm it runs on that version without NODE_PATH.
- Add .gitattributes with LF line endings so Windows checkouts do not change generated or vector files.
- Write repo scripts in Node, not Bash, and build paths with node:path.
- Native packages differ by OS, so test a clean npm ci on Shikhar's Windows laptop before merging.
- @rado/shared exports TypeScript. Prove the Next.js app can import it.
- Add install, dev, test, and lint commands to Commands in CLAUDE.md.

Prove: every laptop passes npm ci and npm run lint on the same Node major, and regenerating the claim vector leaves it byte-identical.

Stop and ask if: a selected range conflicts, or the vector changes.
```

## W03 Claim circuit and rejection tests

**Owner:** Shikhar | **Branch:** `track/circuits` | **Hours:** 1-10 | **Needs:** W02

```text
Work on W03 Claim circuit and rejection tests as Shikhar on track/circuits. Follow the Standard Workflow in prompt.md.

Read: W03 in context/build-plan.md, ZK Claim Circuit and Invariants in context/architecture.md, Circom and circomlib sections in context/library-docs.md, packages/shared/src/constants.ts, packages/shared/src/hash-inputs.ts, and packages/shared/vectors/claim-valid.json.

Build only: circuits/src/claim.circom with Claim(8, 6), plus circuit tests.

Get right:
- Declare the six public inputs first, in order, with no outputs (D-029). Input names must match ClaimCircuitInput.
- Apply Num2Bits before every comparator: 32 bits for days and 64 bits for amounts.
- Constrain every Merkle path index to 0 or 1.
- Set EdDSAPoseidonVerifier enabled to 1 for both signatures.
- Make each rejection test break exactly one rule. Recompute hashes and re-sign where needed, so a bad signature cannot hide a missing check.
- Resolve the circom_tester Windows TODO in library-docs.md.

Prove: the committed vector passes, public signals come out in the required order, every expected failure in Verify fails for its intended rule, and the constraint count is printed for W04.

Stop and ask if: the committed vector fails. Never edit the vector or shared hash order just to make a test pass.
```

## W04 Trusted setup and verifier

**Owner:** Shikhar | **Branch:** `track/circuits` | **Hours:** 1-10 | **Needs:** W03

```text
Work on W04 Trusted setup and verifier as Shikhar on track/circuits. Follow the Standard Workflow in prompt.md.

Read: W04 in context/build-plan.md, ZK Claim Circuit in context/architecture.md, Circom and snarkjs in context/library-docs.md.

Build only: a cross-platform Node setup script, the demo proving files, the verification key, and the generated Groth16Verifier.

Get right:
- Choose the Powers of Tau size from W03's constraint count and resolve that TODO.
- Produce the wasm, zkey, verification key, and verifier from one run of the final circuit. Any later circuit change requires regenerating all of them.
- Never edit Groth16Verifier by hand.
- Do not save or commit contribution entropy. Keep *.ptau and circuits/build/ ignored.
- Put the wasm and zkey where the browser can load them, and check their sizes against GitHub's 100 MB limit.
- Label this setup demo-only.

Prove: the sample proof verifies with snarkjs and the generated Solidity verifier, and changing each of the six public signals makes verification fail.

Stop and ask if: a proving file is too large to commit, or the circuit must change.
```

## W05 Smart contracts and tests

**Owner:** Shreya | **Branch:** `track/contracts` | **Hours:** 1-10 | **Needs:** W02. W04 for the final proof checks.

```text
Work on W05 Smart contracts and tests as Shreya on track/contracts. Follow the Standard Workflow in prompt.md.

If W04 is not merged, start with a test-only mock verifier. Do not tick W05 until the real Groth16Verifier passes the proof tests.

Read: W05 in context/build-plan.md, Smart Contracts, On-Chain and Off-Chain Data, Invariants, and Code Standards in context/architecture.md, Hardhat in context/library-docs.md, and packages/shared/src/abi.ts.

Build only: MockUSD, RecordAccess, ClaimSettlement, deployment, seed script, and contract tests.

Get right:
- Implement submitClaim's checks in the documented order, and update state before transferring tokens.
- Follow D-026, D-027, D-030, and D-031.
- Add a test proving compiled ABIs match packages/shared/src/abi.ts.
- Keep the mock verifier out of deployment and seed paths.
- Seed newly generated wallets and fund the pool. Never use Hardhat's default accounts or commit a wallet key.
- Hospital approval and policy registration need keys from MetaMask unlock, so do not fake them in the seed.
- Hardhat state is lost on restart, so the seed must rebuild the demo from zero.

Prove: every expected rejection in Verify, replay rejection, the cap, payout, and an audit event for each state change.

Stop and ask if: abi.ts or a documented check must change.
```

## W06 Encryption and key library

**Owner:** Shreyansh | **Branch:** `track/storage` | **Hours:** 1-10 | **Needs:** W02

```text
Work on W06 Encryption and key library as Shreyansh on track/storage. Follow the Standard Workflow in prompt.md.

Read: W06 in context/build-plan.md, Key Handling, Private Message Inbox, Invariants, and Code Standards in context/architecture.md, Browser Crypto and circomlibjs in context/library-docs.md, and packages/shared/src.

Build only: packages/shared modules for unlock key derivation, record encryption, X25519 key wrapping, key rotation, inbox encryption, request authentication, and sender checks, plus tests.

Get right:
- Use the shared HKDF labels, tags, and limits. Never re-declare them.
- The same unlock signature must always derive the same keys. Derived keys stay in memory.
- Use a fresh random 96-bit IV for every AES-GCM encryption.
- Bind inbox AAD to rado/inbox/v1, messageId, sender, and recipient.
- Define one exact byte encoding for the inbox request digest so client and server cannot disagree.
- If wrapped-key AAD is not specified, raise it as a plan decision.
- Keep this code free of React, server secrets, and logging of keys or plaintext.

Prove: every Verify check, including all inbox failures and each forged message type.

Stop and ask if: a shared type or documented crypto rule must change.
```

## W07 Server routes

**Owner:** Shreyansh | **Branch:** `track/storage` | **Hours:** 1-10 | **Needs:** W02, W06. W05 for the on-chain guard checks.

```text
Work on W07 Server routes as Shreyansh on track/storage. Follow the Standard Workflow in prompt.md.

If W05 is not merged, build the routes first. Do not tick W07 until the on-chain guards pass against deployed contracts.

Read: W07 in context/build-plan.md, Server Routes, Private Message Inbox, Invariants, and Code Standards in context/architecture.md, Next.js and Pinata in context/library-docs.md.

Build only: /api/rpc, /api/pin, /api/records/[cid], the /api/inbox routes, the encrypted cache, and LAN HTTPS setup.

Get right:
- Check every method in a JSON-RPC batch, not only the first.
- Validate CIDs and message IDs before using them in file paths.
- Limit request sizes before parsing them.
- Check cached bundles against the on-chain hash on every read.
- Write inbox files atomically, so a crash cannot leave a partial message.
- Keep secrets in server-only modules. Never commit .env files or certificates.
- Never log bodies, ciphertext, keys, or wallet addresses in URLs.

Prove: every Verify and Verify inbox check from a second laptop, including batch requests containing a blocked method and path-traversal attempts.

Stop and ask if: a route needs readable medical data, or an invariant blocks the design.
```

## W08 Role screens with sample data

**Owner:** Siddarth | **Branch:** `track/app` | **Hours:** 1-10 | **Needs:** W02

```text
Work on W08 Role screens with sample data as Siddarth on track/app. Follow the Standard Workflow in prompt.md.

Read: W08 in context/build-plan.md, Screens and Core User Flow in context/project-overview.md, System Boundaries, Invariants, and Code Standards in context/architecture.md, Next.js, wagmi and viem, and Tailwind CSS in context/library-docs.md.

Build only: Patient, Hospital, Responder, Insurer, and Public Chain View screens with wallet connection and sample data from @rado/shared.

Get right:
- Keep sample data behind a small data layer for each role, so W09 to W11 can replace it without rewriting screens.
- Resolve the relative /api/rpc TODO in library-docs.md.
- The Insurer and Public Chain View must have no medical data fields.
- Do not store records, keys, or claim inputs in localStorage or sessionStorage.
- Show plain errors, such as "This claim was already submitted."
- Do not fake a successful proof, payment, or revocation without clearly labelling it as sample data.

Prove: each role completes its screen flow on sample data, and a search of Insurer and Public Chain View code finds no medical fields.

Stop and ask if: a screen needs a shared interface change.
```

## W09 Patient records and permissions

**Owner:** Siddarth, with Shreyansh | **Branch:** `track/app` | **Hours:** 10-14 | **Needs:** W05, W06, W07, W08

```text
Work on W09 Patient records and permissions as Siddarth on track/app, with Shreyansh reviewing storage and crypto. Follow the Standard Workflow in prompt.md.

Read: W09 in context/build-plan.md, Core User Flow in context/project-overview.md, Key Handling, Smart Contracts, Server Routes, and Invariants in context/architecture.md.

Build only: the real add-record, grant, time-limited access, revoke with rotation, doctor view, and audit timeline flows.

Get right:
- Encrypt in the browser before any upload.
- A grant adds a wrapped key, so it must pin the new bundle and update the hash and CID (D-031).
- Revoke in this order: new key, re-encrypt, re-wrap for remaining readers, pin, revokeAndRotate. Report success only after the transaction confirms.
- If a pin or transaction fails, keep the old state and show a plain error.
- Log a doctor's view on-chain before decrypting.
- Build the timeline from chain events, with no record titles or resource types.

Prove: across L1 and L2, a granted doctor reads a record. After revoke or expiry, they cannot open the current version, and the timeline shows each action.

Stop and ask if: a flow would put readable medical data on-chain, on a server, or in a URL.
```

## W10 Hospital claim and browser proving

**Owner:** Shikhar, with Siddarth | **Branch:** `track/circuits` | **Hours:** 10-14 | **Needs:** W04, W05, W06, W07, W08

```text
Work on W10 Hospital claim and browser proving as Shikhar on track/circuits, with Siddarth reviewing the app flow. Follow the Standard Workflow in prompt.md.

Read: W10 in context/build-plan.md, ZK Claim Circuit, Private Message Inbox, and Invariants in context/architecture.md, Circom and snarkjs and wagmi and viem in context/library-docs.md.

Build only: insurer policy delivery and resend, claim request, patient approval, both EdDSA signatures, and proof generation in a web worker.

Get right:
- Run each sender check before showing or acting on a message.
- Take claimDay from the latest block's UTC day (D-033).
- Send the hospital one covered-procedure path, not the coverage list (D-032).
- Rebuild the hospital Merkle path from HospitalRootUpdated (D-027).
- Keep the witness in Hospital browser memory. It may leave only as inbox ciphertext.
- Never log witness values.
- Resolve the snarkjs Turbopack TODO in library-docs.md.
- Measure proof time on L2.

Prove: L3 delivers terms to L1, L2 requests a claim, L1 approves, and L2 generates a valid proof. Also prove every expected failure in Verify.

Stop and ask if: proving is too slow for the demo, or the circuit or shared hash inputs must change.
```

## W11 Settlement, insurer view, and end-to-end flow

**Owner:** Shreya, with Siddarth | **Branch:** `track/contracts` | **Hours:** 10-14 | **Needs:** W05, W08, W10

```text
Work on W11 Settlement, insurer view, and end-to-end flow as Shreya on track/contracts, with Siddarth reviewing the app flow. Follow the Standard Workflow in prompt.md.

Read: W11 in context/build-plan.md, Core User Flow and Success Criteria in context/project-overview.md, Smart Contracts and Invariants in context/architecture.md, Circom and snarkjs in context/library-docs.md.

Build only: real submitClaim from the Hospital screen, token payout, Insurer view, Public Chain View data, and the scripted E2E flow in scripts/.

Get right:
- The E2E flow must use a real proof and the real verifier, never a mock.
- Use newly generated wallets, not Hardhat's default accounts.
- Show each contract rejection as a plain reason.
- Insurer and public views may show only allowed chain data.
- Write the E2E script in Node so it runs on Windows and macOS.

Prove: the E2E script passes from a fresh seed, the same flow works across all four laptops, the hospital balance rises by the claim amount, and a replay is rejected.

Report W11's status to the team by hour 16. If it is not passing, W12 stops.

Stop and ask if: the fix needs a circuit, ABI, or invariant change.
```

## W12 Break-glass

**Owner:** Shreya, with Shreyansh | **Branch:** `track/contracts` | **Hours:** 14-18 | **Needs:** W09, W11

```text
Work on W12 Break-glass as Shreya on track/contracts, with Shreyansh reviewing escrow and crypto. Follow the Standard Workflow in prompt.md.

First confirm W11 has passed. If not, or if it is past hour 16 without W11 passing, stop. This is the first feature to cut.

Read: W12 in context/build-plan.md, Key Handling, Smart Contracts, Server Routes, Invariants, and Known Limitations in the context docs.

Build only: responder registration, emergency summary wrapping, /api/escrow/release, the Responder flow, and the timeline entry.

Get right:
- Wrap only the emergency summary key to escrow, never a full record key.
- Require a matching on-chain BreakGlassInvoked event and a registered responder's signature.
- Make release single-use, including after a server restart.
- Keep ESCROW_PRIVATE_KEY in a server-only module, and log no keys or summary data.
- Do not weaken or slow down the main claim flow.

Prove: a registered responder gets only the summary after the event. Requests with no event, from an unregistered wallet, for a full record, or repeated are refused. The timeline shows the access, and the W11 E2E flow still passes.

Stop and ask if: W12 is not passing by hour 18. Do not merge a partial feature.
```

## W13 Threat model and architecture diagram

**Owner:** Shreyansh, with team review | **Branch:** `track/storage` | **Hours:** 18-20 | **Needs:** W11, and W12 merged or cut

```text
Work on W13 Threat model and architecture diagram as Shreyansh on track/storage. Follow the Standard Workflow in prompt.md.

Read: W13 in context/build-plan.md, problemstatement.md, Known Limitations in context/project-overview.md, System Boundaries, On-Chain and Off-Chain Data, Key Handling, Server Routes, Private Message Inbox, and Invariants in context/architecture.md. Check the built code where a claim depends on it.

Build only: the required architecture and privacy threat-model diagram. Ask where it should live and what format the judges need.

Get right:
- Show every data location, trust boundary, and role.
- List attacks handled and what stops each one.
- Include every known limitation in plain language.
- Show break-glass only if W12 shipped. If it was cut, say so.
- Describe what was built, not what was planned, and do not overstate privacy.
- Never quote or use content from CS.docx or Drawings.docx.

Prove: compare the diagram line by line with context/architecture.md. Every data location and limitation appears, and all four owners review it.

Stop and ask if: the built system differs from the documented architecture.
```

## W14 Rehearsal, backup video, and pitch

**Owner:** Shreyansh, with everyone | **Branch:** `track/storage` | **Hours:** 20-24, freeze | **Needs:** W11, W13

```text
Work on W14 Rehearsal, backup video, and pitch as Shreyansh on track/storage, with all four owners. Follow the Standard Workflow in prompt.md.

Feature freeze is active. Make only fixes that would otherwise break the demo, and keep each one in a small PR.

Read: W14 in context/build-plan.md, Demo Setup, Success Criteria, and Known Limitations in context/project-overview.md, the deliverables in problemstatement.md, and the remaining TODOs in context/library-docs.md.

Build only: a four-laptop run checklist, a timed demo script, backup video steps, and pitch notes.

Get right:
- Test laptop-to-laptop access on venue Wi-Fi first, then the phone hotspot fallback.
- Resolve the MetaMask HTTPS RPC TODO on the venue network.
- Start each rehearsal from a fresh seed.
- Run one rehearsal with Pinata unreachable.
- Use only synthetic data. Keep .env files, wallet seeds, and private keys off screen and out of the video.
- State the known limitations honestly in the pitch.
- Check every deliverable in problemstatement.md.

Prove: two clean rehearsals from a fresh seed, one succeeding with Pinata unreachable, and the backup video playing on the presenting laptop.

Stop and ask if: a proposed change is not demo-breaking, or a rehearsal fails for an unclear reason.
```
