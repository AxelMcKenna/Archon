// Server-side reverse proxy helper. Forwards a Next.js request to an upstream
// HTTP service and streams the response back, preserving SSE. Injects the
// caller's Supabase access token as a Bearer Authorization header so the
// upstream FastAPI service can run as that user under RLS.

import { getAccessToken } from "@/lib/supabase/server";

const HOP_BY_HOP_REQ = new Set([
  "host",
  "connection",
  "content-length",
  "transfer-encoding",
  "accept-encoding",
]);

const HOP_BY_HOP_RES = new Set([
  "transfer-encoding",
  "connection",
  "keep-alive",
  "content-encoding",
  "content-length",
]);

export async function proxyToUpstream(
  req: Request,
  upstreamBase: string | undefined,
  pathSegments: string[],
): Promise<Response> {
  if (!upstreamBase) {
    return new Response("upstream not configured", { status: 503 });
  }

  const url = new URL(req.url);
  const target =
    upstreamBase.replace(/\/$/, "") +
    "/" +
    pathSegments.map(encodeURIComponent).join("/") +
    url.search;

  const headers = new Headers();
  req.headers.forEach((value, key) => {
    if (!HOP_BY_HOP_REQ.has(key.toLowerCase())) headers.set(key, value);
  });

  const token = await getAccessToken();
  if (token) {
    headers.set("authorization", `Bearer ${token}`);
  } else {
    return new Response("unauthorized", { status: 401 });
  }

  const init: RequestInit & { duplex?: "half" } = {
    method: req.method,
    headers,
    redirect: "manual",
  };
  if (req.method !== "GET" && req.method !== "HEAD") {
    init.body = req.body;
    init.duplex = "half";
  }

  const upstream = await fetch(target, init);

  const respHeaders = new Headers();
  upstream.headers.forEach((value, key) => {
    if (!HOP_BY_HOP_RES.has(key.toLowerCase())) respHeaders.set(key, value);
  });
  respHeaders.set("cache-control", "no-store");

  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: respHeaders,
  });
}
