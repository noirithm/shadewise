import { describe, expect, it } from "vitest";
import { Metrics } from "@/server/metrics";
import { parseEvent } from "@/server/events";
import { SEED_SNAPSHOT } from "@/config/seed";

const A = "aaaaaaaaaaaaaaaaaaaa";
const B = "bbbbbbbbbbbbbbbbbbbb";
const C = "cccccccccccccccccccc";

describe("Metrics", () => {
  it("starts empty, with rates that say 'no data' instead of dividing by zero", () => {
    const s = new Metrics().snapshot();
    expect(s).toMatchObject({ sessions: 0, started: 0, paidSessions: 0, unitsSpent: 0, avgUnitsPerPaidSession: null });
    expect(s.gate.retakeThenSuccessRate).toBeNull();
    expect(s.results.confidentShare).toBeNull();
  });

  it("follows a shopper who is refused, retakes, and then gets a confident verdict", () => {
    const m = new Metrics();
    m.event({ type: "gate_refused", session: A, reasons: ["brightness", "face_size"] });
    m.event({ type: "gate_passed", session: A });
    m.analysis({ session: A, units: 21, cached: false, outcome: "ok" });
    m.event({ type: "result", session: A, label: "good_match", confidence: "high" });
    const s = m.snapshot();
    expect(s.gate).toMatchObject({ passed: 1, refused: 1, sessionsWithRefusal: 1, retakeThenSuccess: 1, retakeThenSuccessRate: 1 });
    expect(s.gate.reasons).toEqual({ brightness: 1, face_size: 1 });
    expect(s.results).toMatchObject({ total: 1, confidentSessions: 1, confidentShare: 1 });
    expect(s).toMatchObject({ sessions: 1, started: 1, paidSessions: 1, unitsSpent: 21, avgUnitsPerPaidSession: 21 });
  });

  it("does not count a 'can't tell' or a low-confidence verdict as a confident success", () => {
    const m = new Metrics();
    m.event({ type: "gate_passed", session: A });
    m.event({ type: "result", session: A, label: "cant_tell", confidence: "low" });
    m.event({ type: "gate_passed", session: B });
    m.event({ type: "result", session: B, label: "close_match", confidence: "low" });
    const s = m.snapshot();
    expect(s.results.confidentSessions).toBe(0);
    expect(s.results.byLabel).toEqual({ cant_tell: 1, close_match: 1 });
    expect(s.started).toBe(2);
  });

  it("reports retake-then-success as the share of refused shoppers who later got a verdict", () => {
    const m = new Metrics();
    m.event({ type: "gate_refused", session: A, reasons: ["yaw"] });
    m.event({ type: "gate_passed", session: A });
    m.event({ type: "result", session: A, label: "poor_match", confidence: "medium" });
    m.event({ type: "gate_refused", session: B, reasons: ["yaw"] }); // refused and gave up
    m.event({ type: "gate_passed", session: C }); // never refused: not part of this rate
    m.event({ type: "result", session: C, label: "good_match", confidence: "high" });
    const g = m.snapshot().gate;
    expect(g.sessionsWithRefusal).toBe(2);
    expect(g.retakeThenSuccess).toBe(1);
    expect(g.retakeThenSuccessRate).toBe(0.5);
  });

  it("counts a refusal reason once per refused photo, even if it is listed twice", () => {
    const m = new Metrics();
    m.event({ type: "gate_refused", session: A, reasons: ["yaw", "yaw"] });
    expect(m.snapshot().gate.reasons).toEqual({ yaw: 1 });
  });

  it("measures units per paid session, ignores cached repeats, and records denials and errors", () => {
    const m = new Metrics();
    m.analysis({ session: A, units: 21, cached: false, outcome: "ok" });
    m.analysis({ session: A, units: 0, cached: true, outcome: "ok" });
    m.analysis({ session: A, units: 1, cached: false, outcome: "ok" });
    m.analysis({ session: B, units: 20, cached: false, outcome: "error", detail: "timeout" });
    m.analysis({ session: C, units: 0, cached: false, outcome: "budget", detail: "reserve" });
    const s = m.snapshot();
    expect(s).toMatchObject({ analyses: 5, cachedAnalyses: 1, unitsSpent: 42, paidSessions: 2, avgUnitsPerPaidSession: 21 });
    expect(s.denied).toEqual({ reserve: 1 });
    expect(s.errors).toEqual({ timeout: 1 });
  });

  it("counts recorded-sample views without counting them as started sessions", () => {
    const m = new Metrics();
    m.event({ type: "sample_viewed", session: A });
    const s = m.snapshot();
    expect(s).toMatchObject({ samplesViewed: 1, sessions: 1, started: 0 });
  });

  it("keeps memory bounded by forgetting the oldest sessions", () => {
    const m = new Metrics(Date.now, 3);
    for (const id of ["s1".padEnd(16, "x"), "s2".padEnd(16, "x"), "s3".padEnd(16, "x"), "s4".padEnd(16, "x")]) {
      m.event({ type: "gate_passed", session: id });
    }
    expect(m.snapshot().sessions).toBe(3);
  });

  it("never exposes session ids, and a snapshot is plain numbers and words", () => {
    const m = new Metrics();
    m.event({ type: "gate_passed", session: A });
    m.analysis({ session: A, units: 21, cached: false, outcome: "ok" });
    const text = JSON.stringify(m.snapshot());
    expect(text).not.toContain(A);
    expect(text).not.toMatch(/ip|photo|image/i);
  });

  it("the demo seed data has the same shape, and says it is illustrative", () => {
    expect(Object.keys(SEED_SNAPSHOT).sort()).toEqual(Object.keys(new Metrics().snapshot()).sort());
    expect(SEED_SNAPSHOT.since).toBe("demo");
  });
});

describe("parseEvent: only fixed words get in", () => {
  it("accepts the four event types", () => {
    expect(parseEvent({ type: "gate_passed", session: A })).toEqual({ type: "gate_passed", session: A });
    expect(parseEvent({ type: "gate_refused", session: A, reasons: ["yaw", "low_score"] })).toBeTruthy();
    expect(parseEvent({ type: "result", session: A, label: "good_match", confidence: "high" })).toBeTruthy();
    expect(parseEvent({ type: "sample_viewed", session: A })).toBeTruthy();
  });
  it("rejects unknown types, bad sessions, free text, extra fields and oversized lists", () => {
    const bad: unknown[] = [
      null, "x", 3, [], {},
      { type: "gate_passed", session: "short" },
      { type: "gate_passed", session: "has spaces in the session id" },
      { type: "gate_passed", session: A, note: "extra" },
      { type: "purchase", session: A },
      { type: "gate_refused", session: A, reasons: ["<script>"] },
      { type: "gate_refused", session: A, reasons: Array(13).fill("yaw") },
      { type: "gate_refused", session: A },
      { type: "result", session: A, label: "great", confidence: "high" },
      { type: "result", session: A, label: "good_match", confidence: "certain" },
      { type: "result", session: A, label: "good_match" },
    ];
    for (const b of bad) expect(parseEvent(b), JSON.stringify(b)).toBeNull();
  });
});
