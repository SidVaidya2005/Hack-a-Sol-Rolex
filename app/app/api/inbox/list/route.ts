import { asObject, handleRoute, readJsonBody } from "@/lib/server/http";
import { authenticateInbox } from "@/lib/server/inbox-auth";
import { listMessages } from "@/lib/server/inbox-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 4096;

export function POST(request: Request): Promise<Response> {
  return handleRoute("inbox/list", async () => {
    const body = asObject(await readJsonBody(request, MAX_BODY_BYTES));
    const wallet = await authenticateInbox(body.auth, "list");
    const messages = await listMessages(wallet);
    return Response.json({ messages }, { headers: { "cache-control": "no-store" } });
  });
}
