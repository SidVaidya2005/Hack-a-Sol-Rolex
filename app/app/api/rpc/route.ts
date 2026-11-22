import { hardhatRpcUrl } from "@/lib/server/chain";
import { handleRoute, HttpError, readJsonBody } from "@/lib/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 256 * 1024;
const MAX_BATCH = 50;
const UPSTREAM_TIMEOUT_MS = 15_000;

/** An allowlist, so a new Hardhat admin method is blocked by default (Invariant 16). */
const ALLOWED_METHODS = new Set([
  "eth_blockNumber",
  "eth_call",
  "eth_chainId",
  "eth_estimateGas",
  "eth_feeHistory",
  "eth_gasPrice",
  "eth_getBalance",
  "eth_getBlockByHash",
  "eth_getBlockByNumber",
  "eth_getCode",
  "eth_getLogs",
  "eth_getStorageAt",
  "eth_getTransactionByHash",
  "eth_getTransactionCount",
  "eth_getTransactionReceipt",
  "eth_maxPriorityFeePerGas",
  "eth_sendRawTransaction",
  "eth_syncing",
  "net_version",
  "web3_clientVersion",
]);

function assertAllowed(call: unknown): void {
  if (typeof call !== "object" || call === null || Array.isArray(call)) {
    throw new HttpError(400, "This RPC request has the wrong format.");
  }
  const { method } = call as { method?: unknown };
  if (typeof method !== "string") {
    throw new HttpError(400, "This RPC request has the wrong format.");
  }
  if (!ALLOWED_METHODS.has(method)) {
    throw new HttpError(403, "This RPC method is not allowed.");
  }
}

export function POST(request: Request): Promise<Response> {
  return handleRoute("rpc", async () => {
    const payload = await readJsonBody(request, MAX_BODY_BYTES);
    const calls = Array.isArray(payload) ? payload : [payload];
    if (calls.length === 0 || calls.length > MAX_BATCH) {
      throw new HttpError(400, "This RPC batch has the wrong size.");
    }
    // One blocked method refuses the whole batch, before anything is forwarded.
    calls.forEach(assertAllowed);

    let upstream: globalThis.Response;
    try {
      upstream = await fetch(hardhatRpcUrl(), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
        cache: "no-store",
        signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
      });
    } catch {
      throw new HttpError(503, "The blockchain is not reachable.");
    }
    return new Response(upstream.body, {
      status: upstream.status,
      headers: { "content-type": "application/json", "cache-control": "no-store" },
    });
  });
}
