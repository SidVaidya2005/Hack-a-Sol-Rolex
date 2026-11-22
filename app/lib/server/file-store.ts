import "server-only";

import { randomBytes } from "node:crypto";
import { mkdir, open, readdir, readFile, rename, rm } from "node:fs/promises";
import path from "node:path";

const NONCE_FILE = /^[0-9a-f]{64}$/;
const NONCE_PRUNE_MS = 30_000;

export const cacheRoot = path.join(process.cwd(), ".cache");

/** Next.js can load a module once per route, so shared state lives on globalThis. */
const shared = globalThis as typeof globalThis & {
  __radoLocks?: Map<string, Promise<unknown>>;
  __radoNoncePrunedAt?: number;
};

/** Runs one check-then-write at a time for this key. */
export function withLock<T>(key: string, run: () => Promise<T>): Promise<T> {
  const locks = (shared.__radoLocks ??= new Map());
  const previous = locks.get(key) ?? Promise.resolve();
  const next = previous.then(run, run);
  locks.set(
    key,
    next.catch(() => undefined),
  );
  return next;
}

/** A crash leaves either the old file or the whole new file, never a partial one. */
export async function writeFileAtomic(file: string, data: Uint8Array | string): Promise<void> {
  const directory = path.dirname(file);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const temp = path.join(directory, `.tmp-${randomBytes(8).toString("hex")}`);
  try {
    const handle = await open(temp, "wx", 0o600);
    try {
      await handle.writeFile(data);
      await handle.sync();
    } finally {
      await handle.close();
    }
    await rename(temp, file);
  } catch (error) {
    await rm(temp, { force: true });
    throw error;
  }
  // Windows cannot fsync a directory. The rename above is still atomic there.
  try {
    const handle = await open(directory, "r");
    try {
      await handle.sync();
    } finally {
      await handle.close();
    }
  } catch {}
}

export async function readFileIfPresent(file: string): Promise<Buffer | null> {
  try {
    return await readFile(file);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

async function pruneNonces(directory: string, now: number): Promise<void> {
  if (now * 1000 - (shared.__radoNoncePrunedAt ?? 0) < NONCE_PRUNE_MS) return;
  shared.__radoNoncePrunedAt = now * 1000;
  for (const name of await readdir(directory)) {
    if (!NONCE_FILE.test(name)) continue;
    const file = path.join(directory, name);
    const expiresAt = Number((await readFileIfPresent(file))?.toString() ?? 0);
    if (expiresAt <= now) await rm(file, { force: true });
  }
}

/**
 * Stored on disk so a restart cannot reopen a replay window.
 * Exclusive create makes the single-use check atomic.
 */
export async function consumeNonce(nonce: string, expiresAt: number): Promise<boolean> {
  const name = nonce.replace(/^0x/, "").toLowerCase();
  if (!NONCE_FILE.test(name)) return false;
  const directory = path.join(cacheRoot, "nonces");
  await mkdir(directory, { recursive: true, mode: 0o700 });
  await pruneNonces(directory, Math.floor(Date.now() / 1000));
  try {
    const handle = await open(path.join(directory, name), "wx", 0o600);
    try {
      await handle.writeFile(String(expiresAt));
    } finally {
      await handle.close();
    }
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") return false;
    throw error;
  }
}
