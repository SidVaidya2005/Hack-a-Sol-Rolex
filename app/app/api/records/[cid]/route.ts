import { assertSameOrigin, handleRoute } from "@/lib/server/http";
import { assertCid, loadVerifiedBundle } from "@/lib/server/records";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(
  request: Request,
  { params }: { params: Promise<{ cid: string }> },
): Promise<Response> {
  return handleRoute("records", async () => {
    assertSameOrigin(request);
    const { cid } = await params;
    assertCid(cid);
    const bytes = await loadVerifiedBundle(cid);
    return new Response(Buffer.from(bytes), {
      headers: {
        "content-type": "application/json",
        "cache-control": "no-store",
        "x-content-type-options": "nosniff",
      },
    });
  });
}
