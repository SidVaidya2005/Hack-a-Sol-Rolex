import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  { settings: { next: { rootDir: "app/" } } },
  globalIgnores([
    "**/.next/**",
    "**/.next-e2e/**",
    "**/next-env.d.ts",
    "contracts/artifacts/**",
    "contracts/cache/**",
    "contracts/coverage/**",
    "contracts/ignition/deployments/**",
    "circuits/build/**",
    ".cache/**",
  ]),
]);
