import type { AnalyzeOutcome } from "./analysis";

/** What the browser is told. Budget details and unit counts stay on the server. */
export function toHttp(o: AnalyzeOutcome): { status: number; body: Record<string, unknown> } {
  if (o.ok) {
    return { status: 200, body: { ok: true, tone: o.tone, previews: o.previews, cached: o.cached } };
  }
  switch (o.kind) {
    case "invalid_upload":
      return { status: 400, body: { ok: false, kind: "error", code: "unsupported_file" } };
    case "budget":
      return { status: 503, body: { ok: false, kind: "budget" } };
    case "refused":
      return { status: 422, body: { ok: false, kind: "refused", tips: o.tips } };
    case "error": {
      const status = o.code === "rate_limited" ? 429 : o.code === "timeout" ? 504 : 502;
      return { status, body: { ok: false, kind: "error", code: o.code } };
    }
  }
}
