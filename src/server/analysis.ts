import { CAPS, COSTS } from "../config/caps";
import type { FaceQuality } from "../shared/youcam";
import type { ErrorCode } from "../widget/machine";
import { decideSpend, type DenyReason, type Ledger } from "./budget";
import { hashBytes, type CachedAnalysis, type SessionCache } from "./cache";
import { validateUpload, type UploadProblem } from "./upload";
import { YouCamError, type YouCamClient } from "./youcam";

export interface TryOnItem {
  id: string;
  hex: string;
}

export type PreviewResult =
  | { id: string; status: "ok"; imageUrl: string }
  | { id: string; status: "failed" | "skipped" };

export type AnalyzeOutcome =
  | {
      ok: true;
      tone: { skinHex: string; allGood: boolean; faceQuality: FaceQuality | null };
      previews: PreviewResult[];
      unitsSpent: number;
      cached: boolean;
    }
  | { ok: false; kind: "invalid_upload"; problem: UploadProblem }
  | { ok: false; kind: "budget"; reason: DenyReason }
  | { ok: false; kind: "refused"; tips: string[] }
  | { ok: false; kind: "error"; code: ErrorCode };

export interface AnalyzeDeps {
  client: YouCamClient;
  ledger: Ledger;
  cache: SessionCache;
  log: (event: string, fields?: Record<string, unknown>) => void;
}

export interface AnalyzeInput {
  sessionId: string;
  bytes: Uint8Array;
  items: TryOnItem[];
}

const TRYON_CONCURRENCY = 2;

/** Only a failure that is certain not to have been charged earns a refund. Unknown errors keep the charge. */
function wasNotCharged(e: unknown): boolean {
  return e instanceof YouCamError && !e.maybeCharged;
}

function toOutcome(e: unknown): AnalyzeOutcome {
  if (e instanceof YouCamError) {
    if (e.kind === "photo_rejected" && e.tip) return { ok: false, kind: "refused", tips: [e.tip] };
    if (e.kind === "rate_limited") return { ok: false, kind: "error", code: "rate_limited" };
    if (e.kind === "timeout") return { ok: false, kind: "error", code: "timeout" };
    if (e.kind === "upload_failed") return { ok: false, kind: "error", code: "upload_failed" };
  }
  return { ok: false, kind: "error", code: "api_error" };
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const worker = async () => {
    for (;;) {
      const i = next++;
      if (i >= items.length) return;
      out[i] = await fn(items[i]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

export async function analyze(deps: AnalyzeDeps, input: AnalyzeInput): Promise<AnalyzeOutcome> {
  const { client, ledger, cache, log } = deps;
  const { sessionId, bytes } = input;
  const short = sessionId.slice(0, 8);

  const upload = validateUpload(bytes);
  if (!upload.ok) {
    log("analyze_invalid_upload", { session: short, problem: upload.problem });
    return { ok: false, kind: "invalid_upload", problem: upload.problem };
  }

  const hash = hashBytes(bytes);
  let balance: number | null | undefined; // undefined = not read yet; null = could not read
  const readBalance = async (): Promise<number | null> => {
    if (balance === undefined) {
      try {
        balance = await client.getBalance();
      } catch {
        balance = null;
      }
    }
    return balance;
  };

  let unitsSpent = 0;
  let entry = cache.get(sessionId, hash);
  const cached = entry !== undefined;

  if (!entry) {
    const st = ledger.state(sessionId);
    const decision = decideSpend({ cost: COSTS.skinTone, balance: await readBalance(), ...st });
    if (!decision.allow) {
      log("analyze_denied", { session: short, reason: decision.reason });
      return { ok: false, kind: "budget", reason: decision.reason };
    }
    ledger.record(sessionId, COSTS.skinTone);
    try {
      const fileId = await client.uploadImage(bytes, upload.type);
      const tone = await client.analyzeSkinTone(fileId);
      entry = { fileId, tone, previews: new Map() } satisfies CachedAnalysis;
      cache.set(sessionId, hash, entry);
      unitsSpent += COSTS.skinTone;
      if (typeof balance === "number") balance -= COSTS.skinTone;
    } catch (e) {
      if (wasNotCharged(e)) ledger.refund(sessionId, COSTS.skinTone);
      else unitsSpent += COSTS.skinTone;
      log("analyze_tone_failed", { session: short, kind: e instanceof YouCamError ? e.kind : "unexpected", charged: !wasNotCharged(e) });
      return toOutcome(e);
    }
  }

  // Try-on previews: at most three, de-duplicated, concurrency capped.
  const seen = new Set<string>();
  const wanted = input.items
    .filter((it) => {
      const hex = it.hex.toLowerCase();
      if (seen.has(hex)) return false;
      seen.add(hex);
      return true;
    })
    .slice(0, CAPS.maxTryOnsPerSession);

  const previews: PreviewResult[] = new Array(wanted.length);
  const queued: { index: number; item: TryOnItem }[] = [];

  for (let i = 0; i < wanted.length; i++) {
    const item = wanted[i];
    const cachedUrl = entry.previews.get(item.hex.toLowerCase());
    if (cachedUrl) {
      previews[i] = { id: item.id, status: "ok", imageUrl: cachedUrl };
      continue;
    }
    const st = ledger.state(sessionId);
    const decision = decideSpend({ cost: COSTS.tryOn, balance: await readBalance(), ...st });
    if (!decision.allow) {
      log("analyze_preview_skipped", { session: short, reason: decision.reason });
      previews[i] = { id: item.id, status: "skipped" };
      continue;
    }
    ledger.record(sessionId, COSTS.tryOn);
    if (typeof balance === "number") balance -= COSTS.tryOn;
    queued.push({ index: i, item });
  }

  const fileId = entry.fileId;
  const previewMap = entry.previews;
  await mapLimit(queued, TRYON_CONCURRENCY, async ({ index, item }) => {
    try {
      const r = await client.tryOn(fileId, item.hex);
      previewMap.set(item.hex.toLowerCase(), r.imageUrl);
      unitsSpent += COSTS.tryOn;
      previews[index] = { id: item.id, status: "ok", imageUrl: r.imageUrl };
    } catch (e) {
      if (wasNotCharged(e)) ledger.refund(sessionId, COSTS.tryOn);
      else unitsSpent += COSTS.tryOn;
      log("analyze_preview_failed", { session: short, kind: e instanceof YouCamError ? e.kind : "unexpected" });
      previews[index] = { id: item.id, status: "failed" };
    }
  });

  log("analyze_done", { session: short, cached, unitsSpent, previews: previews.length });
  return {
    ok: true,
    tone: { skinHex: entry.tone.skinHex, allGood: entry.tone.allGood, faceQuality: entry.tone.faceQuality },
    previews,
    unitsSpent,
    cached,
  };
}
