# Library Docs

> **Purpose:** This page records which software libraries Rado plans to use, where their documentation lives, and examples of the APIs. Read the relevant section before using or changing a library.

## How an AI Agent Should Use This Page

- Before using a library, compare the version range here with the project's manifest. If they differ, re-check the official documentation and update this page.
- Add a library here before installing it. Keep code examples consistent with the selected version.
- After installing, record the exact version from the lockfile; a version range is only the allowed family, not the version actually installed.
- Treat every `TODO:` below as an unverified check. Resolve it when its named work item is reached and remove the TODO once the result is recorded.
- Never send readable patient data to a public storage service. For example, upload only an encrypted record bundle to Pinata.

**Version example:** `^2.7.0` is an allowed version range, not a promise that exactly `2.7.0` was installed. Use the lockfile to find the exact installed version.

## How this file is maintained

- Compare the selected range with the manifest before using a library. If they differ, re-check current documentation and update this file.
- After first install, replace the resolved-version TODO with exact lockfile versions.
- Add a library here before installing it.

## Selected Versions

All entries were checked on 2026-11-22 using Context7 and the npm registry. Locked versions come from `package-lock.json`, installed during W02 on Node 26.13.0.

| Package | Range | Locked | Context7 ID or source |
| ------- | ----- | ------ | --------------------- |
| `hardhat` | `^3.22.0` | `3.22.0` | `/websites/hardhat` |
| `@nomicfoundation/hardhat-toolbox-viem` | `^5.0.7` | `5.0.7` | `/websites/hardhat` |
| `@openzeppelin/contracts` | `^5.6.1` | `5.6.1` | npm registry |
| Circom compiler | `2.2.3` | Not an npm package | `/iden3/circom`, GitHub release |
| `circomlib` | `^2.0.5` | `2.0.5` | GitHub source, `iden3/circomlib` |
| `circomlibjs` | `^0.1.7` | `0.1.7` | `/iden3/circomlibjs` |
| `circom_tester` | `^0.0.24` | `0.0.24` | npm registry |
| `snarkjs` | `^0.7.6` | `0.7.6` | `/iden3/snarkjs` |
| `next` | `^16.4.6` | `16.4.6` | `/vercel/next.js` |
| `react`, `react-dom` | `^19.3.1` | `19.3.1` | npm registry |
| `wagmi` | `^3.7.11` | `3.7.11` | `/websites/wagmi_sh_react` |
| `viem` | `^2.58.4` | `2.58.4` | `/websites/viem_sh` |
| `@tanstack/react-query` | `^5.108.2` | `5.108.2` | Wagmi docs |
| `pinata` | `^2.7.0` | `2.7.0` | `/pinatacloud/pinata` |
| `@noble/curves` | `^2.4.0` | `2.4.0` | `/paulmillr/noble-curves` |
| `@noble/hashes` | `^2.4.0` | `2.4.0` | `/paulmillr/noble-hashes` |
| `tailwindcss`, `@tailwindcss/postcss` | `^4.3.5` | `4.3.5` | `/tailwindlabs/tailwindcss.com` |
| `typescript` | `~5.9.3` | `5.9.3` | npm registry, wagmi peer range |
| `eslint` | `^9.39.5` | `9.39.5` | npm registry, D-035 |
| `eslint-config-next` | `^16.4.6` | `16.4.6` | npm registry |
| `prettier` | `^3.10.1` | `3.10.1` | npm registry |
| `server-only` | `^0.0.1` | `0.0.1` | Next.js docs |
| `@types/node` | `^26.6.6` | `26.6.6` | npm registry |
| `@types/react`, `@types/react-dom` | `^19.3.0` | `19.3.0` | npm registry |

TypeScript stays on 5.9 rather than the newer 7.x because this project's tools have not been checked for compatibility with 7.x.

npm may print an `install-scripts` notice for `blake-hash` and `esbuild`. Do not approve them: W02's install, build, and vector checks passed with those scripts not run.

## Hardhat

Hardhat 3 supports Node `22.13.0` or later on maintained even major versions. Source: https://hardhat.org/docs/reference/nodejs-support

```ts
// contracts/hardhat.config.ts
import hardhatToolboxViemPlugin from "@nomicfoundation/hardhat-toolbox-viem";
import { defineConfig } from "hardhat/config";

export default defineConfig({
  plugins: [hardhatToolboxViemPlugin],
  solidity: { version: "0.8.34" },
});
```

```sh
npx hardhat node
npx hardhat ignition deploy ignition/modules/Rado.ts --network localhost
npx hardhat test nodejs
```

**Rules:** keep the node on its default `127.0.0.1` and reach it through `/api/rpc`. Hardhat node state is lost when it stops, so the seed script must rebuild the demo.

## Circom and snarkjs

**Install on Shikhar's Windows laptop (T1).** Run this in PowerShell, then open a new terminal and run `circom --version`:

```powershell
New-Item -ItemType Directory -Force "$HOME\bin" | Out-Null
Invoke-WebRequest "https://github.com/iden3/circom/releases/download/v2.2.3/circom-windows-amd64.exe" -OutFile "$HOME\bin\circom.exe"
$userPath = [Environment]::GetEnvironmentVariable("Path", "User")
[Environment]::SetEnvironmentVariable("Path", "$userPath;$HOME\bin", "User")
```

Hardhat on Windows also needs the Microsoft C++ redistributable: https://learn.microsoft.com/en-us/cpp/windows/latest-supported-vc-redist

TODO: verify `circom_tester` runs the claim circuit tests on Shikhar's Windows laptop during W03, using `npm test --workspace @rado/circuits`. They pass on Linux.

**`circom_tester` notes:** it builds an unquoted shell command, so pass relative paths. A witness calculator keeps earlier error text, so use a fresh one for each rejection test. snarkjs leaves curve worker threads open, so terminate `globalThis.curve_bn128` after tests or the process will not exit.

```circom
component main {public [claimAmount, policyCommitment, nullifier, hospitalRoot, claimDay, payoutAddress]} = Claim(8, 6);
```

```sh
circom circuits/src/claim.circom --r1cs --wasm --sym -l node_modules -o circuits/build
snarkjs groth16 setup claim.r1cs pot_final.ptau claim_0000.zkey
snarkjs zkey contribute claim_0000.zkey claim_final.zkey --name="Rado demo" -v
snarkjs zkey export verificationkey claim_final.zkey verification_key.json
snarkjs zkey export solidityverifier claim_final.zkey Groth16Verifier.sol
```

```ts
import { groth16 } from "snarkjs";

const { proof, publicSignals } = await groth16.fullProve(input, wasmUrl, zkeyUrl);
const callData = await groth16.exportSolidityCallData(proof, publicSignals);
```

**Rules:** snarkjs returns public signals in declaration order and Circom outputs are public, so declare the six public inputs first, use no outputs, and assert the `publicSignals` order in a test. Only the T1 laptop needs the Circom compiler if the final `.wasm`, `.zkey`, and verifier are shared through the repo.

TODO: verify snarkjs browser bundling under Next.js Turbopack in W10. If it fails, test `next dev --webpack`.

TODO: choose the Powers of Tau file size in W04. W03 printed 27,352 constraints on Linux, which fits power 15 (32,768). Confirm this when running setup.

## circomlib and circomlibjs

Use `Poseidon(n)`, `LessThan(n)`, `LessEqThan(n)`, and `EdDSAPoseidonVerifier()` from circomlib.

```ts
import { buildEddsa } from "circomlibjs";

const eddsa = await buildEddsa();
const publicKey = eddsa.prv2pub(seed);
const signature = eddsa.signPoseidon(seed, eddsa.babyJub.F.e(claimHash));
const valid = eddsa.verifyPoseidon(eddsa.babyJub.F.e(claimHash), signature, publicKey);
```

Convert results with `poseidon.F.toObject(poseidon(inputs))` and `eddsa.F.toObject(point)`. `scripts/generate-claim-vector.mjs` is a working example.

**Rule:** `LessThan(n)` and `LessEqThan(n)` require inputs already constrained to `n` bits.

## Next.js

Run the LAN demo server with a certificate trusted by all four laptops:

```sh
next dev --hostname 0.0.0.0 --experimental-https --experimental-https-key certificates/key.pem --experimental-https-cert certificates/cert.pem
```

```js
// app/next.config.js
module.exports = {
  allowedDevOrigins: [process.env.DEMO_HOST_IP],
};
```

`DEMO_HOST_IP` is L4's LAN address, written without a scheme or port. Next.js documents `--experimental-https` for development use, which fits this local demo.

```ts
import "server-only";

export async function POST(request: Request) {
  const formData = await request.formData();
  const bundle = formData.get("file");
  return Response.json({ received: bundle instanceof File });
}
```

TODO: verify on the venue network that MetaMask accepts the L4 HTTPS RPC URL once the local certificate authority is trusted.

## wagmi and viem

```ts
import { createConfig, http } from "wagmi";
import { injected } from "wagmi/connectors";
import { defineChain } from "viem";

export const radoChain = defineChain({
  id: 31337,
  name: "Rado Local",
  nativeCurrency: { decimals: 18, name: "Ether", symbol: "ETH" },
  rpcUrls: { default: { http: ["/api/rpc"] } },
});

export const config = createConfig({
  chains: [radoChain],
  connectors: [injected()],
  ssr: true,
  transports: { [radoChain.id]: http("/api/rpc") },
});
```

Wrap the app in `WagmiProvider` and `QueryClientProvider`. Use `useSignTypedData` for unlock and `useWriteContract` with `useWaitForTransactionReceipt` for transactions.

Shared ABIs are human-readable lists. Convert them with viem:

```ts
import { parseAbi } from "viem";
import { claimSettlementAbi } from "@rado/shared";

const abi = parseAbi(claimSettlementAbi);
```

TODO: verify that the relative `/api/rpc` URL works in viem's HTTP transport during W08. If it does not, build the absolute URL from `window.location.origin`.

## Pinata

```ts
import "server-only";
import { PinataSDK } from "pinata";

const pinata = new PinataSDK({
  pinataJwt: process.env.PINATA_JWT!,
  pinataGateway: process.env.PINATA_GATEWAY!,
});

const upload = await pinata.upload.public.file(encryptedBundleFile);
const stored = await pinata.gateways.public.get(upload.cid);
```

**Rule:** public uploads are readable by anyone with the CID, so pass only encrypted bundles.

## Browser Crypto

```ts
import { x25519 } from "@noble/curves/ed25519.js";
import { hkdf } from "@noble/hashes/hkdf.js";
import { sha256 } from "@noble/hashes/sha2.js";

const shared = x25519.getSharedSecret(ephemeral.secretKey, readerPublicKey);
const wrapKey = hkdf(sha256, shared, salt, new TextEncoder().encode("rado/wrap/v1"), 32);
```

Use WebCrypto `AES-GCM` for record encryption and key wrapping. `crypto.subtle` is available only on a secure origin such as HTTPS.

## Tailwind CSS

```js
// app/postcss.config.mjs
export default { plugins: { "@tailwindcss/postcss": {} } };
```

```css
@import "tailwindcss";
```
