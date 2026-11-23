import { deployedProviders } from "@/lib/server/chain";
import { assertSameOrigin, handleRoute } from "@/lib/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The off-chain provider directory, read on each call so a fresh seed needs no rebuild. */
export function GET(request: Request): Promise<Response> {
  return handleRoute("providers", async () => {
    assertSameOrigin(request);
    return Response.json(
      { providers: await deployedProviders() },
      { headers: { "cache-control": "no-store" } },
    );
  });
}
