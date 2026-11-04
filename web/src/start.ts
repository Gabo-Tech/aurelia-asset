import { createStart, createMiddleware } from "@tanstack/react-start";

import { renderErrorPage } from "./lib/error-page";
import { isAppNoindexPath } from "./lib/seo";

function asResponse(value: unknown): Response | null {
  if (typeof value !== "object" || value == null) return null;
  const candidate = value as Response;
  if (typeof candidate.status !== "number") return null;
  if (typeof candidate.headers?.get !== "function") return null;
  return candidate;
}

/** TanStack Start's next() returns the middleware context, whose response is nested. */
function tagNoindex(result: unknown) {
  const record = result as { response?: unknown } | null;
  const nested = record?.response as { response?: unknown } | undefined;
  const candidates = [result, record?.response, nested?.response];
  for (const candidate of candidates) {
    const response = asResponse(candidate);
    if (!response) continue;
    try {
      response.headers.set("X-Robots-Tag", "noindex, nofollow");
    } catch {
      // Some runtimes seal headers after the body starts. The robots meta tag still applies.
    }
    return;
  }
}

const errorMiddleware = createMiddleware().server(async ({ next, request }) => {
  try {
    const result = await next();
    let pathname = "/";
    try {
      pathname = new URL(request.url).pathname;
    } catch {
      pathname = "/";
    }
    if (isAppNoindexPath(pathname)) tagNoindex(result);
    return result;
  } catch (error) {
    if (error != null && typeof error === "object" && "statusCode" in error) {
      throw error;
    }
    return new Response(renderErrorPage(), {
      status: 500,
      headers: {
        "content-type": "text/html; charset=utf-8",
        "X-Robots-Tag": "noindex, nofollow",
      },
    });
  }
});

export const startInstance = createStart(() => ({
  requestMiddleware: [errorMiddleware],
}));
