# Rado

Privacy-preserving health records and zero-knowledge insurance claims: a hospital proves a claim is valid, a contract pays it, and the insurer never sees medical data.

## Project documentation

This project uses six compact documents so a four-person team can find product, privacy, plan, and status information quickly during a 24-hour build. Data model, patterns, constraints, and code standards are combined into `context/architecture.md`, and completion history lives under each work item in `context/build-plan.md`.

### Information locations

| Information | File and section |
| ----------- | ---------------- |
| Product, demo, scope | `context/project-overview.md` |
| Product decisions | `context/project-overview.md`, Product Decisions |
| Architecture and stack | `context/architecture.md`, Stack |
| Data locations | `context/architecture.md`, On-Chain and Off-Chain Data |
| Key handling | `context/architecture.md`, Key Handling |
| ZK circuit specification | `context/architecture.md`, ZK Claim Circuit |
| Contracts and audit events | `context/architecture.md`, Smart Contracts |
| Server routes | `context/architecture.md`, Server Routes |
| Encrypted cross-laptop messages | `context/architecture.md`, Private Message Inbox |
| Invariants | `context/architecture.md`, Invariants |
| Architecture decisions | `context/architecture.md`, Architecture Decisions |
| Standing constraints | `context/architecture.md`, Standing Constraints |
| Code standards | `context/architecture.md`, Code Standards |
| Current status and progress | `context/progress-tracker.md`, Current Status and Progress |
| Recent decisions | `context/progress-tracker.md`, Key Decisions |
| Open questions | `context/progress-tracker.md`, Open Questions |
| Work items, checks, completion history | `context/build-plan.md`, Work Items |
| Workflow decisions | `context/build-plan.md`, Workflow Decisions |
| Parallel work and stand-ins | `context/build-plan.md`, Parallel Work |
| Library versions and API patterns | `context/library-docs.md` |
| Original brief | `problemstatement.md` |

### Always, in this order

1. `context/project-overview.md` — what Rado does and what this build includes.
2. `context/architecture.md` — system design, invariants, standing constraints, and code standards.
3. `context/progress-tracker.md` — current work, recent decisions, and open questions.

Read the complete essential set before task-specific references or code changes. Use Current Status to identify the active work item.

### On demand, by reading condition

| When the task involves | Read |
| ---------------------- | ---- |
| Starting or checking a work item | That `### W..` section in `context/build-plan.md` |
| Assigning tracks or checking the schedule | Tracks and Timeline in `context/build-plan.md` |
| Writing code that uses a library | That library's section in `context/library-docs.md` |
| Installing or updating a dependency | Selected Versions in `context/library-docs.md` |

## Standing rules

- **Read essential context first.** Use the locations and order above.
- **Obey all invariants.** Privacy invariants outrank demo convenience and deadlines.
- **Never commit a secret.** Record variable names, never values. This includes keys, tokens, wallet seeds, private keys, and credential-bearing URLs.
- **Never commit or quote `CS.docx` or `Drawings.docx`.** They are private reference documents.
- **Use only synthetic patient data.** Never enter real medical information into Rado.
- **Follow the agreed code standards and the current work item's scope.**
- **Respect the reading budget.** Essential reading has a 15,000-token maximum. Move growing detail into a reachable reference and never delete useful content to pass the check.
- **Preserve informed user choices.** Follow accepted tradeoffs and keep their reasons in the governing section.
- **Give each consequential decision one stable ID and authoritative record.** Allocate the next unused `D-NNN` ID. Start its record with `- **D-NNN — Choice.** Reason: ... Source: ...`. Never renumber or reuse an ID. Other mentions use the plain ID. A changed choice gets a new ID, and correcting an explanation keeps the existing ID.
- **Classify older decisions before moving them.** Keep ten recent entries, newest first. Follow the rules in `context/progress-tracker.md`. Age alone does not make a decision a standing rule.
- **Keep unresolved choices visible** in Open Questions. Assign decision IDs only after confirmation.
- **Preserve fuller reasoning** in the active work item in `context/build-plan.md`, referencing the decision ID.
- **Check reasoning and verification before marking work complete.** Run the item's Verify checks, add its dated Result line, then tick Progress and update Current Status. Ask about an unavailable reason instead of inventing it.
- **Plan meaningful work items with `/architect` before writing code.** Small, clear edits can use its fast path.
- **Open the session with `/remember restore`, close it with `/remember save`.**
- **Ask before committing.** Create commits only with explicit user approval. Add coauthors only if explicitly requested.

### Project workflow

- **Branches:** use one short-lived branch per work item, named in `prompt.md` (D-037). Merge to `main` through short PRs after relevant checks pass. `main` must stay safe to demo.
- **Parallel work:** an item may start on a stand-in, but is ticked only after its Verify checks pass on the real dependency. Follow Parallel Work in `context/build-plan.md`.
- **Commits:** use focused commits with a short descriptive subject that starts with the work item, such as `W03 add policy expiry check`.
- **Tests:** circuit and contract changes need rejection tests. Integration changes must pass the scripted end-to-end flow once it exists.
- **Freeze:** after hour 20, merge only fixes for demo-breaking problems.
- **Libraries:** use Context7 before writing third-party API calls. Use official sources only for gaps, and record them in `context/library-docs.md`. After install, record exact lockfile versions there.

**Documentation check (manual, at hours 10 and 20).** No script enforces this, so run it deliberately, using Git Bash on Windows:

1. Estimate essential reading: `cat CLAUDE.md context/project-overview.md context/architecture.md context/progress-tracker.md | wc -c`, then divide by 4. It must be at most 15,000.
2. Confirm every file and section in Information locations exists.
3. Confirm each `D-NNN` has exactly one bold record: `grep -rhoE '^- \*\*D-[0-9]{3}' CLAUDE.md context | sort | uniq -d` must print nothing.
4. Confirm every referenced `D-NNN` has a record, and each decision still has its reason.
5. Confirm Progress and Work Items list the same items in the same order, with at most ten Key Decisions.
6. Search for leftover template tokens and credential values before merging.

## Commands

- `claude mcp add --transport http context7 https://mcp.context7.com/mcp` — each teammate runs this once in the repo, then restarts Claude Code, so the Context7 rule works on every laptop.

- `npm ci` — install the exact locked dependencies. Requires Node 26.
- `npm run dev` — start the Next.js app.
- `npm run build` — build the Next.js app.
- `npm run lint` — run ESLint.
- `npm run typecheck` — type-check every workspace.
- `npm test` — run every workspace's tests.
- `npm run format` — format code with Prettier. `npm run format:check` checks it without changing files.
- `npm run seed --workspace @rado/contracts` — rebuild the demo chain on a fresh Hardhat node.
- `node scripts/generate-claim-vector.mjs` — regenerate the claim vector. `git diff --exit-code packages/shared/vectors/claim-valid.json` must then pass.

Server configuration goes in `app/.env.local`, using the names in `app/.env.example`. Library-specific commands are in `context/library-docs.md`.
