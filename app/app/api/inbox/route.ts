import { INBOX_MAX_MESSAGE_BYTES, inboxCiphertextHash, parseInboxEnvelope } from "@rado/shared";
import type { Address, InboxEnvelope } from "@rado/shared";

import { registeredEddsaKey } from "@/lib/server/chain";
import { asObject, handleRoute, HttpError, readJsonBody } from "@/lib/server/http";
import { authenticateInbox } from "@/lib/server/inbox-auth";
import { storeMessage } from "@/lib/server/inbox-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Base64 ciphertext plus the envelope and signature fields. */
const MAX_BODY_BYTES = Math.ceil((INBOX_MAX_MESSAGE_BYTES * 4) / 3) + 4096;

export function POST(request: Request): Promise<Response> {
  return handleRoute("inbox", async () => {
    const body = asObject(await readJsonBody(request, MAX_BODY_BYTES));
    let envelope: InboxEnvelope;
    try {
      envelope = parseInboxEnvelope(body.envelope);
    } catch {
      throw new HttpError(400, "This message has the wrong format.");
    }
    const wallet = await authenticateInbox(
      body.auth,
      "send",
      inboxCiphertextHash(envelope.ciphertext),
    );
    if (envelope.sender.toLowerCase() !== wallet) {
      throw new HttpError(403, "The sender does not match this wallet.");
    }
    const recipient = envelope.recipient.toLowerCase() as Address;
    if (!(await registeredEddsaKey(recipient))) {
      throw new HttpError(403, "The recipient is not registered.");
    }
    const { duplicate } = await storeMessage(envelope);
    return Response.json({ messageId: envelope.messageId, duplicate });
  });
}
