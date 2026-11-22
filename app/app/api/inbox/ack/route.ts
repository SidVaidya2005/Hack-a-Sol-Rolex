import { INBOX_MAX_PENDING, INBOX_MESSAGE_ID_PATTERN } from "@rado/shared";

import { asObject, handleRoute, HttpError, readJsonBody } from "@/lib/server/http";
import { authenticateInbox } from "@/lib/server/inbox-auth";
import { ackMessages } from "@/lib/server/inbox-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 8192;

export function POST(request: Request): Promise<Response> {
  return handleRoute("inbox/ack", async () => {
    const body = asObject(await readJsonBody(request, MAX_BODY_BYTES));
    const { messageIds } = body;
    if (
      !Array.isArray(messageIds) ||
      messageIds.length === 0 ||
      messageIds.length > INBOX_MAX_PENDING ||
      !messageIds.every((id) => typeof id === "string" && INBOX_MESSAGE_ID_PATTERN.test(id))
    ) {
      throw new HttpError(400, "These message IDs are not valid.");
    }
    const wallet = await authenticateInbox(body.auth, "ack");
    const deleted = await ackMessages(wallet, messageIds as string[]);
    return Response.json({ deleted });
  });
}
