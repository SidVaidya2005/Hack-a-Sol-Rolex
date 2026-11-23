import { bytesToHex } from "viem";

import { escrowPublicKey, releaseEmergencyKey } from "@/lib/server/escrow";
import { assertSameOrigin, handleRoute, readJsonBody } from "@/lib/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 2048;

/** The public key patients wrap an emergency summary to. */
export function GET(request: Request): Promise<Response> {
  return handleRoute("escrow", async () => {
    assertSameOrigin(request);
    return Response.json(
      { publicKey: bytesToHex(escrowPublicKey()) },
      { headers: { "cache-control": "no-store" } },
    );
  });
}

export function POST(request: Request): Promise<Response> {
  return handleRoute("escrow", async () => {
    const wrappedKey = await releaseEmergencyKey(await readJsonBody(request, MAX_BODY_BYTES));
    return Response.json({ wrappedKey }, { headers: { "cache-control": "no-store" } });
  });
}
