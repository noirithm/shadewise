import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { CAPS } from "@/config/caps";
import { LIMITS } from "@/config/limits";
import { analyze } from "@/server/analysis";
import { Ledger } from "@/server/budget";
import { SessionCache } from "@/server/cache";
import { loadServerConfig } from "@/server/config";
import { corsFor, parseOrigins } from "@/server/cors";
import { log } from "@/server/log";
import { RateLimiter } from "@/server/ratelimit";
import { toHttp } from "@/server/respond";
import { SERVER_LIMITS } from "@/server/upload";
import { getMetrics } from "@/server/state";
import { createYouCamClient } from "@/server/youcam";

export const maxDuration = 60; // seconds

const SESSION = /^[A-Za-z0-9_-]{16,64}$/;
const ItemsSchema = z
  .array(z.object({ id: z.string().regex(/^[A-Za-z0-9_-]{1,40}$/), hex: z.string().regex(/^#[0-9a-fA-F]{6}$/) }))
  .max(CAPS.maxTryOnsPerSession);

// Kept on globalThis so dev reloads do not reset the counters. Per server instance in production.
interface Shared {
  ledger: Ledger;
  cache: SessionCache;
  ip: RateLimiter;
  session: RateLimiter;
}
const g = globalThis as unknown as { __shadewise?: Shared };
const shared: Shared = (g.__shadewise ??= {
  ledger: new Ledger(),
  cache: new SessionCache(),
  ip: new RateLimiter(LIMITS.perIp.max, LIMITS.perIp.windowMs),
  session: new RateLimiter(LIMITS.perSession.max, LIMITS.perSession.windowMs),
});

const fail = (code: string, status: number, headers: Record<string, string> = {}) =>
  NextResponse.json({ ok: false, kind: "error", code }, { status, headers: { "Cache-Control": "no-store", ...headers } });

function clientIp(req: NextRequest): string {
  const xf = req.headers.get("x-forwarded-for");
  return xf?.split(",")[0].trim() || req.headers.get("x-real-ip") || "unknown";
}

export async function OPTIONS(req: NextRequest) {
  const c = corsFor(req.headers.get("origin"), req.nextUrl.origin, parseOrigins(process.env.ALLOWED_ORIGINS));
  if (!c.allowed) return new NextResponse(null, { status: 403 });
  return new NextResponse(null, { status: 204, headers: c.headers });
}

export async function POST(req: NextRequest) {
  try {
    const cors = corsFor(req.headers.get("origin"), req.nextUrl.origin, parseOrigins(process.env.ALLOWED_ORIGINS));
    if (!cors.allowed) {
      log("analyze_blocked_origin");
      return fail("api_error", 403);
    }
    const h = cors.headers;

    const session = req.headers.get("x-sw-session") ?? "";
    if (!SESSION.test(session)) return fail("api_error", 400, h);

    // Rate limits come before anything expensive, including reading the photo.
    const byIp = shared.ip.take(clientIp(req));
    const bySession = shared.session.take(session);
    if (!byIp.ok || !bySession.ok) {
      const wait = Math.max(byIp.ok ? 0 : byIp.retryAfterSec, bySession.ok ? 0 : bySession.retryAfterSec);
      log("analyze_rate_limited", { retryAfterSec: wait });
      return fail("rate_limited", 429, { ...h, "Retry-After": String(wait) });
    }

    if (Number(req.headers.get("content-length") ?? "0") > SERVER_LIMITS.maxBytes + 100_000) {
      return fail("unsupported_file", 413, h);
    }

    let config;
    try {
      config = loadServerConfig();
    } catch (e) {
      log("config_invalid", { message: e instanceof Error ? e.message : "invalid" });
      return fail("api_error", 500, h);
    }

    let form: FormData;
    try {
      form = await req.formData();
    } catch {
      return fail("unsupported_file", 400, h);
    }
    const file = form.get("photo");
    if (!(file instanceof File)) return fail("unsupported_file", 400, h);

    let items;
    try {
      items = ItemsSchema.parse(JSON.parse(String(form.get("items") ?? "[]")));
    } catch {
      return fail("api_error", 400, h);
    }

    const bytes = new Uint8Array(await file.arrayBuffer());
    const spentBefore = shared.ledger.state(session).sessionSpent;
    const client = createYouCamClient({ apiKey: config.apiKey, apiBase: config.apiBase });
    const outcome = await analyze(
      { client, ledger: shared.ledger, cache: shared.cache, log },
      { sessionId: session, bytes, items },
    );
    getMetrics().analysis({
      session,
      units: Math.max(0, shared.ledger.state(session).sessionSpent - spentBefore),
      cached: outcome.ok ? outcome.cached : false,
      outcome: outcome.ok
        ? "ok"
        : outcome.kind === "invalid_upload"
          ? "invalid_upload"
          : outcome.kind === "budget"
            ? "budget"
            : outcome.kind === "refused"
              ? "refused"
              : "error",
      detail: outcome.ok
        ? undefined
        : outcome.kind === "budget"
          ? outcome.reason
          : outcome.kind === "error"
            ? outcome.code
            : outcome.kind === "invalid_upload"
              ? outcome.problem
              : undefined,
    });
    const { status, body } = toHttp(outcome);
    return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store", ...h } });
  } catch (e) {
    log("analyze_crash", { name: e instanceof Error ? e.name : "unknown" });
    return fail("api_error", 500);
  }
}
