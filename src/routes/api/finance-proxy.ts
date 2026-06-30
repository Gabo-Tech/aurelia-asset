import { createFileRoute } from "@tanstack/react-router";

const ALLOWED_HOSTS = new Set([
  "query1.finance.yahoo.com",
  "query2.finance.yahoo.com",
  "api.coingecko.com",
  "api.binance.com",
  "stooq.com",
  "finnhub.io",
  "open.er-api.com",
  "api.exchangerate-api.com",
  "api.frankfurter.app",
]);

const MAX_BYTES = 2_000_000;

function jsonError(message: string, status: number) {
  return Response.json(
    { error: message },
    {
      status,
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}

function getAllowedTarget(request: Request): URL | Response {
  const raw = new URL(request.url).searchParams.get("url");
  if (!raw) return jsonError("Missing url", 400);

  let target: URL;
  try {
    target = new URL(raw);
  } catch {
    return jsonError("Invalid url", 400);
  }

  if (target.protocol !== "https:") return jsonError("Only HTTPS is allowed", 400);
  if (target.username || target.password) return jsonError("Credentials are not allowed", 400);
  if (!ALLOWED_HOSTS.has(target.hostname)) return jsonError("Host is not allowed", 403);

  // Inject the server-side Finnhub key so the browser never sees it.
  if (target.hostname === "finnhub.io" && !target.searchParams.get("token")) {
    const key = process.env.FINNHUB_API_KEY;
    if (key) target.searchParams.set("token", key);
  }

  return target;
}

export const Route = createFileRoute("/api/finance-proxy")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const target = getAllowedTarget(request);
        if (target instanceof Response) return target;

        const upstream = await fetch(target.toString(), {
          signal: AbortSignal.timeout(12_000),
          redirect: "manual",
          headers: {
            Accept: request.headers.get("accept") || "application/json, text/plain, */*",
            "User-Agent":
              "Mozilla/5.0 (compatible; AureliaAsset/1.0; +https://financetracker.putopulse.org)",
          },
        });

        const contentLength = Number(upstream.headers.get("content-length") || "0");
        if (contentLength > MAX_BYTES) return jsonError("Response too large", 502);

        const body = await upstream.arrayBuffer();
        if (body.byteLength > MAX_BYTES) return jsonError("Response too large", 502);

        const headers = new Headers({
          "Cache-Control": upstream.ok ? "public, max-age=120" : "no-store",
        });
        const contentType = upstream.headers.get("content-type");
        if (contentType) headers.set("Content-Type", contentType);

        return new Response(body, {
          status: upstream.status,
          statusText: upstream.statusText,
          headers,
        });
      },
    },
  },
});