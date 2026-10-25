import { describe, expect, it } from "vitest";
import { CATALOGUE } from "@/config/catalogue";
import { VERDICT } from "@/config/verdict";
import {
  LABEL_NAME,
  confidenceFromValidity,
  judgeItem,
  labelFromDeltaE,
  nearestCutoff,
  type Measurement,
} from "@/shared/verdictEngine";
import { VerdictSchema } from "@/shared/verdict";

const shade = (id: string) => CATALOGUE.find((p) => p.id === id)!;
const meas = (hex: string, ok = true): Measurement => ({ skinHex: hex, qualityConfirmed: ok });
const item = (hex: string, id = "x") => ({ id, hex });

// Skin tones as numbers (not photos). Offsets were computed independently with scikit-image.
const TONES = {
  light: { hex: "#E3BFA5", lPlus2: "#E9C5AA", lPlus12: "#FFE0C6", warm: "#DFC1A3", cool: "#E6BEA8" },
  medium: { hex: "#B08060", lPlus2: "#B68565", lPlus12: "#D29F7E", warm: "#AB825D", cool: "#B47E64" },
  deep: { hex: "#6A4332", lPlus2: "#6F4836", lPlus12: "#8A5F4D", warm: "#67452F", cool: "#6C4236" },
} as const;

describe("thresholds", () => {
  it("puts the cut-offs where the config says, inclusive on the better side", () => {
    expect(labelFromDeltaE(0)).toBe("good_match");
    expect(labelFromDeltaE(VERDICT.goodMax)).toBe("good_match");
    expect(labelFromDeltaE(VERDICT.goodMax + 0.0001)).toBe("close_match");
    expect(labelFromDeltaE(VERDICT.closeMax)).toBe("close_match");
    expect(labelFromDeltaE(VERDICT.closeMax + 0.0001)).toBe("poor_match");
  });
  it("knows when a value is close to a cut-off, and which one", () => {
    expect(nearestCutoff(3.2)).toMatchObject({ near: true, cutoff: VERDICT.goodMax, below: "good_match", above: "close_match" });
    expect(nearestCutoff(3.6)).toMatchObject({ near: true, cutoff: VERDICT.goodMax });
    expect(nearestCutoff(6.8)).toMatchObject({ near: true, cutoff: VERDICT.closeMax, below: "close_match", above: "poor_match" });
    expect(nearestCutoff(5.0).near).toBe(false);
    expect(nearestCutoff(0.5).near).toBe(false);
    expect(nearestCutoff(VERDICT.goodMax - VERDICT.boundaryMargin).near).toBe(false); // exactly at the margin
  });
  it("maps the quality score to a confidence level", () => {
    expect(confidenceFromValidity(1)).toBe("high");
    expect(confidenceFromValidity(0.9)).toBe("high");
    expect(confidenceFromValidity(0.8999)).toBe("medium");
    expect(confidenceFromValidity(0.7)).toBe("medium");
    expect(confidenceFromValidity(0.6999)).toBe("low");
  });
});

describe("one shade against one skin colour", () => {
  it("calls an identical colour a good match with high confidence and nothing else to say", () => {
    const v = judgeItem(meas("#B08060"), 1, item("#B08060"));
    expect(v.deltaE).toBeCloseTo(0, 6);
    expect(v.label).toBe("good_match");
    expect(v.confidence).toBe("high");
    expect(v.retake).toBe(false);
    expect(v.reasons.map((r) => r.code)).toEqual(["match_good"]);
  });

  it("gives a sensible verdict for light, medium and deep skin against the demo catalogue", () => {
    const light = judgeItem(meas(TONES.light.hex), 1, shade("demo-02"));
    expect(light.label).toBe("good_match");
    const deep = judgeItem(meas(TONES.deep.hex), 1, shade("demo-07"));
    expect(deep.label).toBe("good_match");
    expect(deep.deltaE as number).toBeLessThan(1);
    const medium = judgeItem(meas(TONES.medium.hex), 1, shade("demo-05"));
    expect(medium.label).toBe("close_match"); // 3.7, just over the good cut-off
    expect(medium.reasons.some((r) => r.code === "near_boundary")).toBe(true);
    expect(medium.confidence).toBe("medium");
  });

  it("calls a far-away shade a poor match at every depth", () => {
    expect(judgeItem(meas(TONES.light.hex), 1, shade("demo-08")).label).toBe("poor_match");
    expect(judgeItem(meas(TONES.medium.hex), 1, shade("demo-01")).label).toBe("poor_match");
    expect(judgeItem(meas(TONES.deep.hex), 1, shade("demo-01")).label).toBe("poor_match");
  });

  it("fairness: the same small offset gets the same verdict for light, medium and deep skin", () => {
    for (const t of Object.values(TONES)) {
      expect(judgeItem(meas(t.hex), 1, item(t.lPlus2)).label).toBe("good_match");
      expect(judgeItem(meas(t.hex), 1, item(t.warm)).label).toBe("good_match");
      expect(judgeItem(meas(t.hex), 1, item(t.cool)).label).toBe("good_match");
      expect(judgeItem(meas(t.hex), 1, item(t.lPlus12)).label).toBe("poor_match");
    }
  });

  it("explains lighter, darker, warmer and cooler with numbers", () => {
    const m = meas("#B08060");
    const lighter = judgeItem(m, 1, item("#D29F7E"));
    expect(lighter.reasons.find((r) => r.code === "lighter")?.text).toMatch(/lighter .* by about 12 points/);
    const darker = judgeItem(m, 1, item("#97684D"));
    expect(darker.reasons.some((r) => r.code === "darker")).toBe(true);
    expect(judgeItem(m, 1, item(TONES.medium.warm)).reasons.some((r) => r.code === "warmer")).toBe(true);
    expect(judgeItem(m, 1, item(TONES.medium.cool)).reasons.some((r) => r.code === "cooler")).toBe(true);
    const basis = judgeItem(m, 1, item(TONES.medium.warm)).basis!;
    expect(basis.dHue).toBeGreaterThan(VERDICT.hueNoteMinDeg);
  });
});

describe("when we refuse to guess", () => {
  const m = meas("#B08060");
  it("says can't tell, retake, when the photo quality is below the minimum", () => {
    const v = judgeItem(m, VERDICT.minValidity - 0.01, shade("demo-05"));
    expect(v).toMatchObject({ label: "cant_tell", confidence: "low", deltaE: null, retake: true, basis: null });
    expect(v.reasons[0].code).toBe("low_validity");
    expect(v.reasons[0].text).toContain("0.59");
    expect(v.reasons[0].text).toContain("0.60");
  });
  it("answers at exactly the minimum quality", () => {
    expect(judgeItem(m, VERDICT.minValidity, shade("demo-05")).label).not.toBe("cant_tell");
  });
  it("treats a missing or invalid quality score as unusable, never as fine", () => {
    for (const bad of [Number.NaN, undefined as unknown as number, -1]) {
      expect(judgeItem(m, bad, shade("demo-05")).label).toBe("cant_tell");
    }
  });
  it("survives a missing or garbage skin colour without throwing", () => {
    for (const hex of ["", "red", "#12345", "#GGGGGG", undefined, null, 42]) {
      const v = judgeItem({ skinHex: hex as unknown as string, qualityConfirmed: true }, 1, shade("demo-05"));
      expect(v).toMatchObject({ label: "cant_tell", retake: true });
      expect(v.reasons[0].code).toBe("no_measurement");
    }
    expect(judgeItem(undefined as unknown as Measurement, 1, shade("demo-05")).label).toBe("cant_tell");
  });
  it("survives a missing shade colour, and does not ask for a retake because of it", () => {
    for (const hex of ["", "blue", undefined]) {
      const v = judgeItem(m, 1, { id: "bad", hex: hex as unknown as string });
      expect(v).toMatchObject({ label: "cant_tell", retake: false, itemId: "bad" });
      expect(v.reasons[0].code).toBe("bad_swatch");
    }
  });
});

describe("confidence", () => {
  const far = shade("demo-02"); // light skin vs this: clear good match, nowhere near a cut-off
  const m = meas(TONES.light.hex);
  it("follows the photo quality score", () => {
    expect(judgeItem(m, 0.95, far).confidence).toBe("high");
    const mid = judgeItem(m, 0.8, far);
    expect(mid.confidence).toBe("medium");
    expect(mid.reasons.some((r) => r.code === "photo_quality")).toBe(true);
    expect(judgeItem(m, 0.65, far).confidence).toBe("low");
  });
  it("drops a level when the analysis service did not confirm the photo quality", () => {
    const v = judgeItem(meas(TONES.light.hex, false), 0.95, far);
    expect(v.confidence).toBe("medium");
    expect(v.reasons.some((r) => r.code === "api_quality")).toBe(true);
  });
  it("drops a level near a cut-off, and both reasons stack down to low at most", () => {
    const edge = judgeItem(meas(TONES.medium.hex, false), 0.8, shade("demo-05")); // medium, unconfirmed, near boundary
    expect(edge.confidence).toBe("low");
    expect(judgeItem(meas(TONES.medium.hex, false), 0.65, shade("demo-05")).confidence).toBe("low");
  });
  it("never claims more confidence than the quality score allows", () => {
    for (const v of [0.6, 0.65, 0.69]) expect(judgeItem(m, v, far).confidence).toBe("low");
  });
});

describe("explainability: every sentence traces to a number", () => {
  it("only contains numbers that come from the basis, the score or the config", () => {
    const cases: [Measurement, number, { id: string; hex: string }][] = [
      [meas(TONES.medium.hex), 0.8, shade("demo-05")],
      [meas(TONES.medium.hex, false), 0.65, shade("demo-04")],
      [meas(TONES.light.hex), 1, shade("demo-08")],
      [meas(TONES.deep.hex), 0.95, item(TONES.deep.lPlus12)],
      [meas(TONES.medium.hex), 0.5, shade("demo-05")],
    ];
    for (const [m, validity, it2] of cases) {
      const v = judgeItem(m, validity, it2);
      const allowed = new Set<string>([
        validity.toFixed(2),
        VERDICT.minValidity.toFixed(2),
        VERDICT.goodMax.toFixed(1),
        VERDICT.closeMax.toFixed(1),
        "1", // the top of the 0 to 1 quality scale, as in "0.80 out of 1"
      ]);
      if (v.basis) {
        allowed.add(v.basis.deltaE.toFixed(1));
        allowed.add(String(Math.round(Math.abs(v.basis.dL))));
        allowed.add(String(Math.round(Math.abs(v.basis.dHue))));
      }
      for (const r of v.reasons) {
        for (const num of r.text.match(/\d+(\.\d+)?/g) ?? []) {
          expect(allowed.has(num), `"${num}" in "${r.text}" is not traceable`).toBe(true);
        }
        expect(r.text).not.toMatch(/NaN|undefined|null/);
      }
    }
  });
  it("uses only known reason codes", () => {
    const known = new Set([
      "match_good", "match_close", "match_poor", "lighter", "darker", "warmer", "cooler",
      "near_boundary", "api_quality", "photo_quality", "low_validity", "no_measurement", "bad_swatch",
    ]);
    for (const p of CATALOGUE) {
      for (const t of Object.values(TONES)) {
        for (const validity of [1, 0.75, 0.62, 0.3]) {
          for (const r of judgeItem(meas(t.hex, validity > 0.7), validity, p).reasons) expect(known.has(r.code)).toBe(true);
        }
      }
    }
  });
  it("always gives at least one reason and a result the schema accepts", () => {
    for (const p of CATALOGUE) {
      for (const t of Object.values(TONES)) {
        const v = judgeItem(meas(t.hex), 0.8, p);
        expect(v.reasons.length).toBeGreaterThan(0);
        expect(VerdictSchema.safeParse(v).success).toBe(true);
      }
    }
    expect(VerdictSchema.safeParse(judgeItem(meas("nope"), 1, shade("demo-05"))).success).toBe(true);
  });
  it("is deterministic", () => {
    const a = judgeItem(meas(TONES.medium.hex), 0.8, shade("demo-04"));
    const b = judgeItem(meas(TONES.medium.hex), 0.8, shade("demo-04"));
    expect(a).toEqual(b);
  });
  it("names labels in plain words", () => {
    expect(LABEL_NAME.cant_tell).toBe("can't tell");
    expect(LABEL_NAME.good_match).toBe("good match");
  });
});
