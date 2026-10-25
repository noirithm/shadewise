import { describe, expect, it } from "vitest";
import { CATALOGUE } from "@/config/catalogue";
import { VERDICT } from "@/config/verdict";
import { compareItems, type CompareInput } from "@/shared/compare";
import { inr } from "@/shared/money";
import { judgeItem, labelFromDeltaE, type ItemVerdict } from "@/shared/verdictEngine";
import type { Confidence } from "@/shared/verdict";

// A verdict with a chosen colour difference, for testing the ranking rules on their own.
function fake(id: string, de: number, conf: Confidence = "high"): ItemVerdict {
  return { itemId: id, label: labelFromDeltaE(de), confidence: conf, deltaE: de, reasons: [{ code: "x", text: "x" }], retake: false, basis: null };
}
const entry = (id: string, de: number, price: number, conf: Confidence = "high"): CompareInput => ({
  item: { id, shade: `Shade ${id.toUpperCase()}`, priceInr: price },
  verdict: fake(id, de, conf),
});
const cantTell = (id: string): CompareInput => ({
  item: { id, shade: `Shade ${id.toUpperCase()}`, priceInr: 900 },
  verdict: { itemId: id, label: "cant_tell", confidence: "low", deltaE: null, reasons: [{ code: "x", text: "x" }], retake: true, basis: null },
});
const recs = (c: ReturnType<typeof compareItems>) => Object.fromEntries(c.ranked.map((r) => [r.itemId, r.recommendation]));
const order = (c: ReturnType<typeof compareItems>) => c.ranked.map((r) => r.itemId);

describe("inr", () => {
  it("formats rupees with separators and rounds", () => {
    expect(inr(949)).toBe("₹949");
    expect(inr(1049)).toBe("₹1,049");
    expect(inr(0)).toBe("₹0");
    expect(inr(12345.6)).toBe("₹12,346");
    expect(inr(-50)).toBe("-₹50");
  });
});

describe("compareItems", () => {
  it("ranks by closeness, and recommends the closest, with a cheaper-but-weaker trade-off noted", () => {
    const skin = { skinHex: "#B08060", qualityConfirmed: true };
    const entries: CompareInput[] = ["demo-04", "demo-05", "demo-10"].map((id) => {
      const p = CATALOGUE.find((x) => x.id === id)!;
      return { item: p, verdict: judgeItem(skin, 1, p) };
    });
    const c = compareItems(entries);
    expect(order(c)).toEqual(["demo-05", "demo-04", "demo-10"]);
    expect(recs(c)).toEqual({ "demo-05": "buy", "demo-04": "consider", "demo-10": "skip" });
    const text = c.notes.map((n) => n.text).join(" ");
    expect(text).toContain("Caramel 05 is your closest match");
    expect(text).toContain("Honey 04 costs ₹50 less than Caramel 05");
    expect(c.tie).toBe(false);
  });

  it("calls near-identical shades a tie, shows the cheaper one first, and says by how much", () => {
    const c = compareItems([entry("a", 2.0, 999), entry("b", 2.3, 949), entry("c", 5.0, 899)]);
    expect(c.tie).toBe(true);
    expect(order(c)).toEqual(["b", "a", "c"]);
    expect(recs(c)).toEqual({ a: "buy", b: "buy", c: "consider" });
    const codes = c.notes.map((n) => n.code);
    expect(codes).toEqual(["tie", "cheaper_tie", "tradeoff"]);
    expect(c.notes[0].text).toMatch(/equally close matches.*2\.0 and 2\.3.*too small to notice/);
    expect(c.notes[1].text).toBe("Shade B costs ₹50 less.");
    expect(c.notes[2].text).toContain("costs ₹50 less than Shade B");
    expect(c.notes[2].text).toContain("a close match");
  });

  it("treats the tie margin as inclusive, and just over it as a real difference", () => {
    const at = compareItems([entry("a", 2.0, 900), entry("b", 2.0 + VERDICT.tieMargin, 900)]);
    expect(at.tie).toBe(true);
    const over = compareItems([entry("a", 2.0, 900), entry("b", 2.0 + VERDICT.tieMargin + 0.01, 900)]);
    expect(over.tie).toBe(false);
    expect(recs(over)).toEqual({ a: "buy", b: "consider" });
  });

  it("never ties across different verdicts, even when the numbers are close", () => {
    const c = compareItems([entry("a", 3.4, 999), entry("b", 3.6, 899)]); // good vs close, 0.2 apart
    expect(c.tie).toBe(false);
    expect(recs(c)).toEqual({ a: "buy", b: "consider" });
    expect(c.notes.some((n) => n.text.includes("a close match") && n.text.includes("rather than a good match"))).toBe(true);
  });

  it("describes a cheaper, slightly weaker shade of the same grade honestly", () => {
    const c = compareItems([entry("a", 1.0, 999), entry("b", 2.5, 899)]);
    expect(recs(c)).toEqual({ a: "buy", b: "consider" });
    expect(c.notes.find((n) => n.code === "tradeoff")?.text).toBe(
      "Shade B costs ₹100 less than Shade A, but it is a slightly weaker match (colour difference 2.5 against 1.0).",
    );
  });

  it("does not recommend a dearer, weaker shade, and skips poor matches", () => {
    const c = compareItems([entry("a", 2.0, 899), entry("b", 5.0, 999), entry("c", 9.0, 800)]);
    expect(recs(c)).toEqual({ a: "buy", b: "skip", c: "skip" });
    expect(c.notes.some((n) => n.code === "tradeoff")).toBe(false); // c is poor, so no cheaper-trade-off pitch
  });

  it("recommends nothing when no shade is a good enough match, and says so", () => {
    const c = compareItems([entry("a", 8.0, 900), entry("b", 12.0, 800)]);
    expect(recs(c)).toEqual({ a: "skip", b: "skip" });
    expect(c.notes[0].code).toBe("no_good_option");
    expect(c.notes[0].text).toContain("closest is Shade A (colour difference 8.0)");
    expect(c.tie).toBe(false);
  });

  it("recommends the closest close match when nothing is a good one", () => {
    const c = compareItems([entry("a", 5.0, 900), entry("b", 6.0, 900)]);
    expect(recs(c)).toEqual({ a: "buy", b: "skip" });
  });

  it("asks for a retake when no shade can be judged", () => {
    const c = compareItems([cantTell("a"), cantTell("b")]);
    expect(recs(c)).toEqual({ a: "retake", b: "retake" });
    expect(c.confidence).toBe("low");
    expect(c.notes[0].code).toBe("all_cant_tell");
  });

  it("ranks an unreadable shade last without hiding the others", () => {
    const c = compareItems([cantTell("z"), entry("a", 2.0, 900)]);
    expect(order(c)).toEqual(["a", "z"]);
    expect(recs(c)).toEqual({ a: "buy", z: "retake" });
  });

  it("reports the lowest confidence and says the order could change", () => {
    const c = compareItems([entry("a", 2.0, 900, "high"), entry("b", 5.0, 900, "low")]);
    expect(c.confidence).toBe("low");
    expect(c.notes.at(-1)?.code).toBe("low_confidence");
    expect(compareItems([entry("a", 2.0, 900, "high"), entry("b", 5.0, 900, "medium")]).confidence).toBe("medium");
  });

  it("gives the same answer whatever order the shades are passed in", () => {
    const base = [entry("a", 2.0, 999), entry("b", 2.3, 949), entry("c", 5.0, 899), entry("d", 2.0, 949)];
    const first = compareItems(base);
    const second = compareItems([...base].reverse());
    expect(order(second)).toEqual(order(first));
    expect(second.notes).toEqual(first.notes);
  });

  it("numbers ranks from 1 with no gaps, and never prints a broken value", () => {
    const c = compareItems([entry("a", 2.0, 999), entry("b", 4.0, 949), entry("c", 9.0, 899), cantTell("d")]);
    expect(c.ranked.map((r) => r.rank)).toEqual([1, 2, 3, 4]);
    for (const n of c.notes) expect(n.text).not.toMatch(/NaN|undefined|null/);
  });

  it("handles a single shade", () => {
    const c = compareItems([entry("a", 2.0, 949)]);
    expect(recs(c)).toEqual({ a: "buy" });
    expect(c.notes.map((n) => n.code)).toEqual(["best_match"]);
    expect(compareItems([])).toMatchObject({ ranked: [], confidence: "low" });
  });
});
