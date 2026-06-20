import { proxyToUpstream } from "@/lib/proxy-upstream";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Plan/CAD analysis (vision over PDF pages + MBIE retrieval) can run well past
// 60s. The VM's nginx allows 300s; match it here so the proxy doesn't 504 the
// request before the backend finishes. Short calls still return immediately —
// this is a ceiling, not a fixed wait.
export const maxDuration = 300;

async function handler(req: Request, ctx: { params: Promise<{ path: string[] }> }) {
  const { path } = await ctx.params;
  return proxyToUpstream(req, process.env.API_BASE_URL, path);
}

export {
  handler as GET,
  handler as POST,
  handler as PUT,
  handler as PATCH,
  handler as DELETE,
  handler as OPTIONS,
};
