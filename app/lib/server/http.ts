import "server-only";

export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

/** Blocks other websites. Wallet extensions use their own scheme and are allowed through. */
export function assertSameOrigin(request: Request): void {
  const origin = request.headers.get("origin");
  if (!origin) return;
  let parsed: URL;
  try {
    parsed = new URL(origin);
  } catch {
    throw new HttpError(403, "This request is not allowed.");
  }
  const isWebOrigin = parsed.protocol === "http:" || parsed.protocol === "https:";
  if (isWebOrigin && parsed.host !== request.headers.get("host")) {
    throw new HttpError(403, "This request is not allowed.");
  }
}

/** Enforces the limit while streaming, because Content-Length can be missing or false. */
export async function readLimitedBytes(request: Request, maxBytes: number): Promise<Uint8Array> {
  const declared = Number(request.headers.get("content-length") ?? 0);
  if (Number.isFinite(declared) && declared > maxBytes) {
    throw new HttpError(413, "This request is too large.");
  }
  if (!request.body) return new Uint8Array();

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > maxBytes) {
      await reader.cancel();
      throw new HttpError(413, "This request is too large.");
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return bytes;
}

export async function readJsonBody(request: Request, maxBytes: number): Promise<unknown> {
  assertSameOrigin(request);
  const contentType = request.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase();
  if (contentType !== "application/json") {
    throw new HttpError(415, "This request must be JSON.");
  }
  const bytes = await readLimitedBytes(request, maxBytes);
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    throw new HttpError(400, "This request is not valid JSON.");
  }
}

export function asObject(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new HttpError(400, "This request has the wrong format.");
  }
  return value as Record<string, unknown>;
}

/** Logs only the route and error class, never a body, key, or wallet. */
export async function handleRoute(route: string, run: () => Promise<Response>): Promise<Response> {
  try {
    return await run();
  } catch (error) {
    if (error instanceof HttpError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    console.error(`[${route}] failed: ${error instanceof Error ? error.name : "UnknownError"}`);
    return Response.json({ error: "The server could not complete this." }, { status: 500 });
  }
}
