import { describe, expect, it, vi } from "vitest";
import { analyze, type AnalyzeInput } from "@/server/analysis";
import { Ledger } from "@/server/budget";
import { SessionCache } from "@/server/cache";
import { toHttp } from "@/server/respond";
import { YouCamError, type YouCamClient } from "@/server/youcam";
import { TIPS } from "@/widget/gate/tips";

function jpeg(w: number, h: number): Uint8Array {
  return new Uint8Array([
    0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04, 0x00, 0x00,
    0xff, 0xc0, 0x00, 0x0b, 0x08, h >> 8, h & 255, w >> 8, w & 255, 0x01, 0x01, 0x11, 0x00,
  ]);
}

const TONE = { skinHex: "#b48868", faceQuality: null, allGood: true };

function setup(over: Record<string, unknown> = {}) {
  const m = {
    getBalance: vi.fn(async () => 999),
    uploadImage: vi.fn(async () => "file-1"),
    analyzeSkinTone: vi.fn(async () => TONE),
    tryOn: vi.fn(async () => ({ imageUrl: "https://example.invalid/p.jpg" })),
    ...over,
  };
  const ledger = new Ledger();
  const cache = new SessionCache();
  const deps = { client: m as unknown as YouCamClient, ledger, cache, log: () => {} };
  const run = (input: Partial<AnalyzeInput> = {}) =>
    analyze(deps, { sessionId: "session-aaaaaaaaaaaa", bytes: jpeg(667, 1000), items: [], ...input });
  return { m, ledger, run };
}

const one = [{ id: "demo-04", hex: "#B88F76" }];

describe("analyze: the normal path", () => {
  it("uploads, measures the skin tone, makes one preview, and charges 21", async () => {
    const { m, ledger, run } = setup();
    const r = await run({ items: one });
    expect(r).toMatchObject({ ok: true, cached: false, unitsSpent: 21 });
    if (!r.ok) throw new Error("unreachable");
    expect(r.tone.skinHex).toBe("#b48868");
    expect(r.previews).toEqual([{ id: "demo-04", status: "ok", imageUrl: "https://example.invalid/p.jpg" }]);
    expect(m.getBalance).toHaveBeenCalledTimes(1);
    expect(ledger.state("session-aaaaaaaaaaaa")).toEqual({ dailySpent: 21, sessionSpent: 21 });
  });

  it("never pays twice for the same photo in a session", async () => {
    const { m, run } = setup();
    await run({ items: one });
    const second = await run({ items: one });
    expect(second).toMatchObject({ ok: true, cached: true, unitsSpent: 0 });
    expect(m.uploadImage).toHaveBeenCalledTimes(1);
    expect(m.analyzeSkinTone).toHaveBeenCalledTimes(1);
    expect(m.tryOn).toHaveBeenCalledTimes(1);
  });

  it("charges only 1 unit for a new shade on a photo already measured, with no new upload", async () => {
    const { m, ledger, run } = setup();
    await run({ items: one });
    const r = await run({ items: [{ id: "demo-07", hex: "#8A5A44" }] });
    expect(r).toMatchObject({ ok: true, cached: true, unitsSpent: 1 });
    expect(m.uploadImage).toHaveBeenCalledTimes(1);
    expect(ledger.state("session-aaaaaaaaaaaa").sessionSpent).toBe(22);
  });

  it("keeps at most three previews, collapses duplicate shades, and runs at most two at once", async () => {
    let inflight = 0;
    let peak = 0;
    const { m, run } = setup({
      tryOn: vi.fn(async () => {
        inflight++;
        peak = Math.max(peak, inflight);
        await new Promise((r) => setTimeout(r, 5));
        inflight--;
        return { imageUrl: "https://example.invalid/p.jpg" };
      }),
    });
    const items = ["#B88F76", "#b88f76", "#C0A080", "#A07050", "#806040", "#604020"].map((hex, i) => ({ id: `p${i}`, hex }));
    const r = await run({ items });
    if (!r.ok) throw new Error("unreachable");
    expect(r.previews).toHaveLength(3);
    expect(m.tryOn).toHaveBeenCalledTimes(3);
    expect(peak).toBe(2);
    expect(r.unitsSpent).toBe(23);
  });
});

describe("analyze: spend is refused before any paid call", () => {
  it("rejects a bad file before touching the API at all", async () => {
    const { m, run } = setup();
    const r = await run({ bytes: new TextEncoder().encode("not a photo") });
    expect(r).toEqual({ ok: false, kind: "invalid_upload", problem: "unsupported" });
    expect(m.getBalance).not.toHaveBeenCalled();
    expect(m.uploadImage).not.toHaveBeenCalled();
  });

  it("protects the reserve: no upload when the balance would drop below 250", async () => {
    const { m, run } = setup({ getBalance: vi.fn(async () => 269) });
    expect(await run()).toEqual({ ok: false, kind: "budget", reason: "reserve" });
    expect(m.uploadImage).not.toHaveBeenCalled();
  });

  it("fails closed when the balance cannot be read", async () => {
    const { m, run } = setup({
      getBalance: vi.fn(async () => {
        throw new YouCamError("unavailable", "down");
      }),
    });
    expect(await run()).toEqual({ ok: false, kind: "budget", reason: "balance_unknown" });
    expect(m.uploadImage).not.toHaveBeenCalled();
  });

  it("stops a second, different photo in the same session at the session cap", async () => {
    const { m, run } = setup();
    await run();
    const r = await run({ bytes: jpeg(668, 1000) });
    expect(r).toEqual({ ok: false, kind: "budget", reason: "session_cap" });
    expect(m.uploadImage).toHaveBeenCalledTimes(1);
  });

  it("skips only the preview when the reserve allows the measurement but not the preview", async () => {
    const { m, run } = setup({ getBalance: vi.fn(async () => 270) });
    const r = await run({ items: one });
    if (!r.ok) throw new Error("unreachable");
    expect(r.tone.skinHex).toBe("#b48868");
    expect(r.previews).toEqual([{ id: "demo-04", status: "skipped" }]);
    expect(m.tryOn).not.toHaveBeenCalled();
    expect(r.unitsSpent).toBe(20);
  });
});

describe("analyze: failures and refunds", () => {
  it("refunds when the upload fails (never charged)", async () => {
    const { ledger, run } = setup({
      uploadImage: vi.fn(async () => {
        throw new YouCamError("upload_failed", "x");
      }),
    });
    expect(await run()).toEqual({ ok: false, kind: "error", code: "upload_failed" });
    expect(ledger.state("session-aaaaaaaaaaaa")).toEqual({ dailySpent: 0, sessionSpent: 0 });
  });

  it("turns an API photo rejection into shopper tips and refunds", async () => {
    const { ledger, run } = setup({
      analyzeSkinTone: vi.fn(async () => {
        throw new YouCamError("photo_rejected", "x", { tip: TIPS.tooFar });
      }),
    });
    expect(await run()).toEqual({ ok: false, kind: "refused", tips: [TIPS.tooFar] });
    expect(ledger.state("session-aaaaaaaaaaaa").sessionSpent).toBe(0);
  });

  it("keeps the charge after a timeout, because the API may have charged", async () => {
    const { ledger, run } = setup({
      analyzeSkinTone: vi.fn(async () => {
        throw new YouCamError("timeout", "x", { maybeCharged: true });
      }),
    });
    expect(await run()).toEqual({ ok: false, kind: "error", code: "timeout" });
    expect(ledger.state("session-aaaaaaaaaaaa").sessionSpent).toBe(20);
  });

  it("keeps the charge on an unexpected error, and shows a safe message", async () => {
    const { ledger, run } = setup({
      analyzeSkinTone: vi.fn(async () => {
        throw new Error("boom");
      }),
    });
    expect(await run()).toEqual({ ok: false, kind: "error", code: "api_error" });
    expect(ledger.state("session-aaaaaaaaaaaa").sessionSpent).toBe(20);
  });

  it("still returns the measurement when the preview fails, and refunds the preview", async () => {
    const { ledger, run } = setup({
      tryOn: vi.fn(async () => {
        throw new YouCamError("task_failed", "x");
      }),
    });
    const r = await run({ items: one });
    if (!r.ok) throw new Error("unreachable");
    expect(r.previews).toEqual([{ id: "demo-04", status: "failed" }]);
    expect(r.unitsSpent).toBe(20);
    expect(ledger.state("session-aaaaaaaaaaaa").sessionSpent).toBe(20);
  });
});

describe("toHttp: what the browser is told", () => {
  it("returns the result without unit counts", () => {
    const { body, status } = toHttp({ ok: true, tone: TONE, previews: [], unitsSpent: 21, cached: false });
    expect(status).toBe(200);
    expect(body).toEqual({ ok: true, tone: TONE, previews: [], cached: false });
    expect(JSON.stringify(body)).not.toContain("unitsSpent");
  });
  it("maps outcomes to statuses and hides budget details", () => {
    expect(toHttp({ ok: false, kind: "budget", reason: "reserve" })).toEqual({ status: 503, body: { ok: false, kind: "budget" } });
    expect(toHttp({ ok: false, kind: "refused", tips: ["x"] }).status).toBe(422);
    expect(toHttp({ ok: false, kind: "invalid_upload", problem: "empty" })).toEqual({
      status: 400,
      body: { ok: false, kind: "error", code: "unsupported_file" },
    });
    expect(toHttp({ ok: false, kind: "error", code: "rate_limited" }).status).toBe(429);
    expect(toHttp({ ok: false, kind: "error", code: "timeout" }).status).toBe(504);
    expect(toHttp({ ok: false, kind: "error", code: "api_error" }).status).toBe(502);
  });
});
