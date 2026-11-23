import type { Address } from "@rado/shared";
import { isAddress } from "viem";

import { fundNewWallet } from "@/lib/server/chain";
import { asObject, handleRoute, HttpError, readJsonBody } from "@/lib/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 256;

/** Gives an empty wallet local-chain gas. The admin call never passes through `/api/rpc`. */
export function POST(request: Request): Promise<Response> {
  return handleRoute("faucet", async () => {
    const { wallet } = asObject(await readJsonBody(request, MAX_BODY_BYTES));
    if (typeof wallet !== "string" || !isAddress(wallet, { strict: false })) {
      throw new HttpError(400, "This request has the wrong format.");
    }
    await fundNewWallet(wallet.toLowerCase() as Address);
    return Response.json({ ok: true }, { headers: { "cache-control": "no-store" } });
  });
}
