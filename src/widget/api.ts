import { assetUrl } from "./assets";
import type { ErrorCode } from "./machine";

export interface Preview {
  id: string;
  status: "ok" | "failed" | "skipped";
  imageUrl?: string;
}
export interface AnalysisResult {
  skinHex: string;
  allGood: boolean;
  previews: Preview[];
  cached: boolean;
}
export type Outcome =
  | { kind: "ok"; result: AnalysisResult }
  | { kind: "refused"; tips: string[] }
  | { kind: "budget" }
  | { kind: "error"; code: ErrorCode };

const HEX = /^#[0-9a-fA-F]{6}$/;
const CODES: ErrorCode[] = ["unsupported_file", "upload_failed", "timeout", "api_error", "rate_limited", "offline", "check_unavailable"];
const FALLBACK: Outcome = { kind: "error", code: "api_error" };

function safeHttps(u: unknown): string | undefined {
  if (typeof u !== "string") return undefined;
  try {
    return new URL(u).protocol === "https:" ? u : undefined;
  } catch {
    return undefined;
  }
}

/** The server's answer is checked before anything from it reaches the page. */
export function parseAnalyzeBody(body: unknown): Outcome {
  const b = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  if (b.ok === true) {
    const tone = (b.tone && typeof b.tone === "object" ? b.tone : {}) as Record<string, unknown>;
    if (typeof tone.skinHex !== "string" || !HEX.test(tone.skinHex)) return FALLBACK;
    const previews: Preview[] = [];
    if (Array.isArray(b.previews)) {
      for (const p of b.previews as Record<string, unknown>[]) {
        if (!p || typeof p.id !== "string" || p.id.length > 40) continue;
        if (p.status === "ok") {
          const imageUrl = safeHttps(p.imageUrl);
          previews.push(imageUrl ? { id: p.id, status: "ok", imageUrl } : { id: p.id, status: "failed" });
        } else if (p.status === "failed" || p.status === "skipped") {
          previews.push({ id: p.id, status: p.status });
        }
      }
    }
    return {
      kind: "ok",
      result: { skinHex: tone.skinHex.toLowerCase(), allGood: tone.allGood === true, previews, cached: b.cached === true },
    };
  }
  if (b.kind === "refused" && Array.isArray(b.tips)) {
    return { kind: "refused", tips: (b.tips as unknown[]).filter((t): t is string => typeof t === "string").slice(0, 5) };
  }
  if (b.kind === "budget") return { kind: "budget" };
  if (b.kind === "error" && typeof b.code === "string" && (CODES as string[]).includes(b.code)) {
    return { kind: "error", code: b.code as ErrorCode };
  }
  return FALLBACK;
}

export function newSessionId(): string {
  const b = new Uint8Array(16);
  crypto.getRandomValues(b);
  return Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
}

export async function analyzeOnServer(
  photo: Blob,
  session: string,
  items: { id: string; hex: string }[],
  signal: AbortSignal,
): Promise<Outcome> {
  const form = new FormData();
  form.append("photo", photo, "photo.jpg");
  form.append("items", JSON.stringify(items));
  let res: Response;
  try {
    res = await fetch(assetUrl("api/analyze"), {
      method: "POST",
      body: form,
      headers: { "x-sw-session": session },
      credentials: "omit",
      signal,
    });
  } catch (e) {
    if (signal.aborted) throw e;
    return { kind: "error", code: typeof navigator !== "undefined" && navigator.onLine === false ? "offline" : "upload_failed" };
  }
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  return parseAnalyzeBody(body);
}
