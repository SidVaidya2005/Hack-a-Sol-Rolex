# Rado

**Private health records. Verifiable insurance claims.**

Rado is a hackathon prototype showing how a hospital can prove an insurance claim meets policy rules without revealing a patient's diagnosis, procedure, prescriptions, or records to the insurer. A zero-knowledge proof is checked by a smart contract, which pays the hospital in demo tokens when the claim is valid. Patient records are encrypted in the browser, and patients manage doctor access.

> **Project status:** working prototype in active development. The core patient, hospital, and browser proving work is in place; settlement, insurer view, end-to-end flow, break-glass, and final rehearsals are still being completed. This is a demo, not a production health or insurance system.

## Demo flow

1. The patient adds a synthetic health record. Rado encrypts it in the browser and anchors its hash and file identifier on a local blockchain. The patient can grant or revoke time-bound doctor access.
2. The insurer sends private policy terms to the patient. The hospital sends a signed claim request for the patient to review.
3. If approved, the patient sends the needed policy information to the hospital through an encrypted inbox. The hospital generates a proof in its browser.
4. The contract checks the proof, rejects duplicate claims, and pays demo tokens. The insurer and public chain view show claim information without the medical record.

The demo is designed for separate Patient, Hospital/Doctor/Responder, Insurer, and Host laptops. The Host runs the local chain and app. See [context/project-overview.md](context/project-overview.md) for the complete workflow and [context/progress-tracker.md](context/progress-tracker.md) for current progress.

## What it demonstrates

- A Groth16 proof for an approved hospital, active policy, covered procedure, and per-claim limit, with patient and hospital signatures.
- Contract verification, one-time claim nullifiers, policy spending caps, and automatic settlement in mock tokens.
- Browser-side record encryption, IPFS storage, on-chain record fingerprints, and patient-controlled access with key rotation on revoke.
- Encrypted policy and claim messages between laptops, plus an audit trail for access and claims.
- A Public Chain View that makes visible what an outside observer can learn.

FHIR-shaped records are synthetic examples; Rado does not connect to hospital systems. Emergency break-glass access to a limited summary is an additional feature under development.

## Architecture

```text
Patient browser ── encrypt records ──> Pinata / encrypted cache
      │                                   │
      ├── permissions and hashes ──> Local Hardhat chain
      │                                   ▲
Hospital browser ── ZK proof + claim ─────┤
      │                                   │
      └── encrypted inbox ──> Host app ───┘
Insurer browser ── policy and pool ───────┘
```

The app is a Next.js/TypeScript workspace; contracts are Solidity, and the claim circuit uses Circom and Groth16. Medical data and proof inputs stay in browser memory. The chain holds record fingerprints, policy commitments, claim signals, and audit events. Pinata and the Host cache hold encrypted bundles; the Host inbox holds encrypted messages and routing metadata. More detail is in [context/architecture.md](context/architecture.md).

## Privacy limits

- The insurer can see the claim amount and paid hospital, and can link claims made under one policy commitment. Amounts can hint at treatment type.
- A doctor may keep information they already decrypted. Revocation protects the newly encrypted record after key rotation.
- A modified client can bypass the app's on-chain view logging.
- The Host can see who exchanged inbox messages and when, though it cannot read their contents. The Host's escrow service is trusted for emergency summaries.
- The trusted setup and wallets are demo-grade. Tokens have no real value; the prototype is not for real patient data, real claims, or production key custody.

## Run locally

### App and sample screens

Requirements: Node.js 26 and npm. From the repository root:

```sh
npm ci
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). This starts the app for local development; the full multi-laptop claim demo also needs the local chain and demo setup below.

### Multi-laptop demo host

On the Host laptop, start a local Hardhat chain in one terminal:

```sh
cd contracts
npx hardhat node
```

In a second terminal, from the repository root, seed and deploy the local demo contracts:

```sh
npm run seed --workspace @rado/contracts
```

This creates demo wallets in an ignored local file. Keep that file and all wallet keys private. The node is ephemeral; restart it and seed again to reset the demo.

For HTTPS access from other laptops on the same network, install OpenSSL and create a local certificate for the Host's LAN IP:

```sh
node scripts/setup-lan-https.mjs <HOST-LAN-IP>
```

Trust `app/certificates/ca.pem` on the demo laptops. Copy `app/.env.example` to `app/.env.local`, set `HARDHAT_RPC_URL=http://127.0.0.1:8545`, `DEMO_HOST_IP=<HOST-LAN-IP>`, and `NEXT_PUBLIC_CHAIN_ID=31337`. Add Pinata and escrow settings only if the demo needs those services. Then start the LAN app from the repository root:

```sh
npm run dev:lan
```

Open `https://<HOST-LAN-IP>:3000` on the other laptops after trusting the certificate.

Do not use real patient records, real wallets, or funds. Never commit `.env.local`, generated certificates, or demo wallet files. More demo details and known setup constraints are in [context/project-overview.md](context/project-overview.md) and [context/architecture.md](context/architecture.md).

## Repository guide

- `app/` — role screens, browser proving, and server routes
- `circuits/` — claim circuit and proof setup
- `contracts/` — Solidity contracts, deployment, and tests
- `packages/shared/` — shared types, ABIs, sample data, and claim inputs
- `context/` — project scope, build plan, architecture, and progress

The project uses a local chain (chain ID `31337`) for its demo. It does not deploy to mainnet or a public testnet.
