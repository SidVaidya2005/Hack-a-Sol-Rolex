import "server-only";

import { mkdir, readdir, rm } from "node:fs/promises";
import path from "node:path";

import {
  INBOX_MAX_PENDING,
  INBOX_MESSAGE_ID_PATTERN,
  INBOX_RETENTION_SECONDS,
  parseInboxEnvelope,
} from "@rado/shared";
import type { Address, InboxEnvelope } from "@rado/shared";

import { cacheRoot, readFileIfPresent, withLock, writeFileAtomic } from "./file-store";
import { HttpError } from "./http";

const inboxDirectory = path.join(cacheRoot, "inbox");
const MESSAGE_FILE = /^[0-9a-f]{32}\.json$/;

/** `storedAt` is the server's clock, so a sender cannot extend retention with `createdAt`. */
interface StoredMessage {
  storedAt: number;
  envelope: InboxEnvelope;
}

function messageFile(messageId: string): string {
  if (!INBOX_MESSAGE_ID_PATTERN.test(messageId)) {
    throw new HttpError(400, "This message ID is not valid.");
  }
  return path.join(inboxDirectory, `${messageId}.json`);
}

function parseStored(bytes: Buffer): StoredMessage | null {
  try {
    const value = JSON.parse(bytes.toString("utf8")) as { storedAt?: unknown; envelope?: unknown };
    if (!Number.isSafeInteger(value.storedAt)) return null;
    return { storedAt: value.storedAt as number, envelope: parseInboxEnvelope(value.envelope) };
  } catch {
    return null;
  }
}

/**
 * Removes expired and unreadable files, then returns what is still pending.
 * Runs inside the inbox lock, so any temp file here was left by a crash.
 */
async function loadPending(now: number): Promise<StoredMessage[]> {
  await mkdir(inboxDirectory, { recursive: true, mode: 0o700 });
  const pending: StoredMessage[] = [];
  for (const name of await readdir(inboxDirectory)) {
    if (name.startsWith(".tmp-")) {
      await rm(path.join(inboxDirectory, name), { force: true });
      continue;
    }
    if (!MESSAGE_FILE.test(name)) continue;
    const file = path.join(inboxDirectory, name);
    const bytes = await readFileIfPresent(file);
    if (!bytes) continue;
    const stored = parseStored(bytes);
    if (
      !stored ||
      `${stored.envelope.messageId}.json` !== name ||
      now - stored.storedAt >= INBOX_RETENTION_SECONDS
    ) {
      await rm(file, { force: true });
      continue;
    }
    pending.push(stored);
  }
  return pending;
}

function sameMessage(a: InboxEnvelope, b: InboxEnvelope): boolean {
  return (
    a.sender.toLowerCase() === b.sender.toLowerCase() &&
    a.recipient.toLowerCase() === b.recipient.toLowerCase() &&
    a.ephemeralPublicKey === b.ephemeralPublicKey &&
    a.iv === b.iv &&
    a.ciphertext === b.ciphertext
  );
}

export function storeMessage(envelope: InboxEnvelope): Promise<{ duplicate: boolean }> {
  return withLock("inbox", async () => {
    const now = Math.floor(Date.now() / 1000);
    const pending = await loadPending(now);
    const existing = pending.find((item) => item.envelope.messageId === envelope.messageId);
    if (existing) {
      if (sameMessage(existing.envelope, envelope)) return { duplicate: true };
      throw new HttpError(409, "This message ID is already in use.");
    }
    const recipient = envelope.recipient.toLowerCase();
    const count = pending.filter(
      (item) => item.envelope.recipient.toLowerCase() === recipient,
    ).length;
    if (count >= INBOX_MAX_PENDING) {
      throw new HttpError(429, "This inbox is full. Try again later.");
    }
    const stored: StoredMessage = { storedAt: now, envelope };
    await writeFileAtomic(messageFile(envelope.messageId), JSON.stringify(stored));
    return { duplicate: false };
  });
}

export function listMessages(wallet: Address): Promise<InboxEnvelope[]> {
  return withLock("inbox", async () => {
    const pending = await loadPending(Math.floor(Date.now() / 1000));
    return pending
      .filter((item) => item.envelope.recipient.toLowerCase() === wallet)
      .sort((a, b) => a.storedAt - b.storedAt)
      .map((item) => item.envelope);
  });
}

/** Deletes only the caller's messages. Another wallet's ID is ignored, revealing nothing. */
export function ackMessages(wallet: Address, messageIds: string[]): Promise<number> {
  return withLock("inbox", async () => {
    const pending = await loadPending(Math.floor(Date.now() / 1000));
    let deleted = 0;
    for (const messageId of new Set(messageIds)) {
      const match = pending.find(
        (item) =>
          item.envelope.messageId === messageId && item.envelope.recipient.toLowerCase() === wallet,
      );
      if (!match) continue;
      await rm(messageFile(messageId), { force: true });
      deleted += 1;
    }
    return deleted;
  });
}
