import type { NextRequest } from "next/server";
import { getBackendUrl } from "@/lib/backend-url.server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const paths = new Set([
  "/.well-known/oauth-authorization-server",
  "/.well-known/oauth-protected-resource",
  "/.well-known/oauth-protected-resource/api/mcp",
]);
export async function GET(request: NextRequest) {
  if (!paths.has(request.nextUrl.pathname)) return new Response(null, { status: 404 });
  try {
    // Discovery is public: never forward cookies, authorization or arbitrary paths.
    const upstream = await fetch(`${getBackendUrl()}${request.nextUrl.pathname}`, {
      redirect: "manual",
      cache: "no-store",
      signal: request.signal,
    });
    return new Response(upstream.body, {
      status: upstream.status,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch {
    return Response.json(
      { error: "server_error", message: "Discovery is temporarily unavailable." },
      { status: 503, headers: { "Cache-Control": "no-store", "Access-Control-Allow-Origin": "*" } }
    );
  }
}
