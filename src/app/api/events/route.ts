import { NextResponse, type NextRequest } from "next/server";
import { corsFor, parseOrigins } from "@/server/cors";
import { parseEvent } from "@/server/events";
import { RateLimiter } from "@/server/ratelimit";
import { getMetrics } from "@/server/state";

const limiter = new RateLimiter(240, 10 * 60_000); // counting events per address; provisional

function origins(req: NextRequest) {
  return corsFor(req.headers.get("origin"), req.nextUrl.origin, parseOrigins(process.env.ALLOWED_ORIGINS));
}

export async function OPTIONS(req: NextRequest) {
  const c = origins(req);
  if (!c.allowed) return new NextResponse(null, { status: 403 });
  return new NextResponse(null, { status: 204, headers: { ...c.headers, "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type" } });
}

/** Anonymous counting events from the widget: fixed words and a random session id. Nothing else is accepted. */
export async function POST(req: NextRequest) {
  const c = origins(req);
  if (!c.allowed) return new NextResponse(null, { status: 403 });
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() || req.headers.get("x-real-ip") || "unknown";
  if (!limiter.take(ip).ok) return new NextResponse(null, { status: 429, headers: c.headers });
  if (Number(req.headers.get("content-length") ?? "0") > 2000) return new NextResponse(null, { status: 413, headers: c.headers });
  let body: unknown = null;
  try {
    body = JSON.parse(await req.text());
  } catch {
    return new NextResponse(null, { status: 400, headers: c.headers });
  }
  const e = parseEvent(body);
  if (!e) return new NextResponse(null, { status: 400, headers: c.headers });
  getMetrics().event(e);
  return new NextResponse(null, { status: 204, headers: c.headers });
}
