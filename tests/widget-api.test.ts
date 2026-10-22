import { describe, expect, it } from "vitest";
import { newSessionId, parseAnalyzeBody } from "@/widget/api";
import { reduce } from "@/widget/machine";

describe("parseAnalyzeBody: nothing from the server reaches the page unchecked", () => {
  const ok = { ok: true, tone: { skinHex: "#B48868", allGood: true }, previews: [{ id: "demo-04", status: "ok", imageUrl: "https://example.invalid/p.jpg" }], cached: false };
  it("accepts a good result and lower-cases the colour", () => {
    const r = parseAnalyzeBody(ok);
    expect(r.kind).toBe("ok");
    if (r.kind === "ok") {
      expect(r.result.skinHex).toBe("#b48868");
      expect(r.result.previews[0]).toEqual({ id: "demo-04", status: "ok", imageUrl: "https://example.invalid/p.jpg" });
    }
  });
  it("rejects a skin colour that is not a plain hex value", () => {
    expect(parseAnalyzeBody({ ...ok, tone: { skinHex: "red;background:url(x)" } })).toEqual({ kind: "error", code: "api_error" });
  });
  it("drops a preview address that is not https and marks the preview failed", () => {
    for (const bad of ["http://example.invalid/p.jpg", "javascript:alert(1)", "data:text/html,x", 42]) {
      const r = parseAnalyzeBody({ ...ok, previews: [{ id: "a", status: "ok", imageUrl: bad }] });
      expect(r.kind === "ok" && r.result.previews[0]).toEqual({ id: "a", status: "failed" });
    }
  });
  it("understands refusals, budget and known errors, and falls back safely for anything else", () => {
    expect(parseAnalyzeBody({ ok: false, kind: "refused", tips: ["Move closer.", 5] })).toEqual({ kind: "refused", tips: ["Move closer."] });
    expect(parseAnalyzeBody({ ok: false, kind: "budget" })).toEqual({ kind: "budget" });
    expect(parseAnalyzeBody({ ok: false, kind: "error", code: "rate_limited" })).toEqual({ kind: "error", code: "rate_limited" });
    for (const junk of [null, undefined, "x", 3, {}, { ok: false, kind: "error", code: "<script>" }]) {
      expect(parseAnalyzeBody(junk)).toEqual({ kind: "error", code: "api_error" });
    }
  });
  it("makes a long random session id that the server will accept", () => {
    const id = newSessionId();
    expect(id).toMatch(/^[A-Za-z0-9_-]{16,64}$/);
    expect(newSessionId()).not.toBe(id);
  });
});

describe("analysis transitions", () => {
  it("a photo the API rejects becomes a refused screen with tips", () => {
    expect(reduce({ name: "analyzing" }, { type: "GATE_FAILED", reasons: ["Move closer."] })).toEqual({ name: "refused", reasons: ["Move closer."] });
  });
  it("budget exhaustion during analysis is a recoverable end state", () => {
    const s = reduce({ name: "analyzing" }, { type: "BUDGET_EXHAUSTED" });
    expect(s.name).toBe("budget_exhausted");
    expect(reduce(s, { type: "RESET" }).name).toBe("idle");
  });
});
