import { assertSameOrigin, handleRoute } from "@/lib/server/http";
import { assertCid, isCachedBundleLarge, loadVerifiedBundle } from "@/lib/server/records";

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
    if (new URL(request.url).searchParams.has("small") && (await isCachedBundleLarge(cid))) {
      return Response.json({ error: "This record is too large." }, { status: 413 });
    }
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
