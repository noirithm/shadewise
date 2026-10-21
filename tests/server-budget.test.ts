import { describe, expect, it } from "vitest";
import { Ledger, decideSpend, totalBalance } from "@/server/budget";

describe("totalBalance", () => {
  const raw = {
    status: 200,
    results: [
      { id: 1, type: "ApiPaygToken", amount: 979, amount_dec: 979, expiry: 1799539199000 },
      { id: 2, type: "ApiPaygToken", amount: 40, amount_dec: 40, expiry: 1823299199000 },
    ],
  };
  it("sums the unit pots from the real response shape", () => {
    expect(totalBalance(raw, 1790000000000)).toBe(1019);
  });
  it("ignores expired pots", () => {
    expect(totalBalance(raw, 1800000000000)).toBe(40);
  });
  it("throws on a response it does not understand", () => {
    expect(() => totalBalance({ nope: true })).toThrow();
  });
});

describe("decideSpend", () => {
  const ok = { cost: 20, balance: 999, sessionSpent: 0, dailySpent: 0 };
  it("allows a normal spend", () => {
    expect(decideSpend(ok)).toEqual({ allow: true });
  });
  it("protects the 250-unit reserve, to the exact unit", () => {
    expect(decideSpend({ ...ok, balance: 270 })).toEqual({ allow: true });
    expect(decideSpend({ ...ok, balance: 269 })).toEqual({ allow: false, reason: "reserve" });
  });
  it("fails closed when the balance could not be read", () => {
    expect(decideSpend({ ...ok, balance: null })).toEqual({ allow: false, reason: "balance_unknown" });
    expect(decideSpend({ ...ok, balance: Number.NaN })).toEqual({ allow: false, reason: "balance_unknown" });
  });
  it("enforces the 23-unit session cap", () => {
    expect(decideSpend({ ...ok, cost: 1, sessionSpent: 22 })).toEqual({ allow: true });
    expect(decideSpend({ ...ok, cost: 1, sessionSpent: 23 })).toEqual({ allow: false, reason: "session_cap" });
  });
  it("enforces the 100-unit daily cap", () => {
    expect(decideSpend({ ...ok, dailySpent: 80 })).toEqual({ allow: true });
    expect(decideSpend({ ...ok, dailySpent: 81 })).toEqual({ allow: false, reason: "daily_cap" });
  });
});

describe("Ledger", () => {
  it("tracks spend per session and per day, and refunds failures", () => {
    const l = new Ledger(() => Date.parse("2026-10-18T10:00:00Z"));
    l.record("a", 20);
    l.record("b", 1);
    expect(l.state("a")).toEqual({ dailySpent: 21, sessionSpent: 20 });
    l.refund("a", 20);
    expect(l.state("a")).toEqual({ dailySpent: 1, sessionSpent: 0 });
  });
  it("resets the daily total at midnight UTC", () => {
    let t = Date.parse("2026-10-18T23:59:00Z");
    const l = new Ledger(() => t);
    l.record("a", 50);
    t = Date.parse("2026-10-19T00:01:00Z");
    expect(l.state("a").dailySpent).toBe(0);
  });
  it("forgets sessions after the ttl", () => {
    let t = 0;
    const l = new Ledger(() => t, 1000);
    l.record("a", 20);
    t = 2000;
    expect(l.state("a").sessionSpent).toBe(0);
  });
});
