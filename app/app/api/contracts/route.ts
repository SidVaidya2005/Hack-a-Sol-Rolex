import { claimSettlementAddress, recordAccessAddress } from "@/lib/server/chain";
import { assertSameOrigin, handleRoute } from "@/lib/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Public deployment addresses, read on each call so a fresh seed needs no rebuild (D-047). */
export function GET(request: Request): Promise<Response> {
  return handleRoute("contracts", async () => {
    assertSameOrigin(request);
    const [recordAccess, claimSettlement] = await Promise.all([
      recordAccessAddress(),
      claimSettlementAddress(),
    ]);
    return Response.json(
      { recordAccess, claimSettlement },
      { headers: { "cache-control": "no-store" } },
    );
  });
}
