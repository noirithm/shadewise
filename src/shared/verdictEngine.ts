import { QUALITY } from "../config/quality";
import { VERDICT } from "../config/verdict";
import { deltaE00 } from "./ciede2000";
import { hexToRgb, rgbToLab, type Lab } from "./color";
import type { Confidence, Reason, Verdict, VerdictLabel } from "./verdict";

const HEX = /^#[0-9a-fA-F]{6}$/;

export interface Measurement {
  skinHex: string; // measured by the YouCam API
  qualityConfirmed: boolean; // the API's own photo-quality block said everything was good
}

export interface SwatchItem {
  id: string;
  hex: string;
}

export interface ItemBasis {
  skinLab: Lab;
  swatchLab: Lab;
  deltaE: number;
  dL: number; // swatch lightness minus skin lightness
  dHue: number; // swatch hue minus skin hue, degrees, positive = more yellow
}

export interface ItemVerdict extends Verdict {
  basis: ItemBasis | null;
}

export const LABEL_NAME: Record<VerdictLabel, string> = {
  good_match: "good match",
  close_match: "close match",
  poor_match: "poor match",
  cant_tell: "can't tell",
};

const n1 = (x: number) => x.toFixed(1);
const n2 = (x: number) => x.toFixed(2);
const n0 = (x: number) => String(Math.round(x));

/** Every shopper-facing sentence is built here from numbers. There is no free-form text. */
export const TEXT = {
  good: (de: number) => `This shade is very close to your measured skin colour (colour difference ${n1(de)}; lower is closer).`,
  close: (de: number) => `This shade is near your measured skin colour, but you may notice a difference (colour difference ${n1(de)}).`,
  poor: (de: number) => `This shade is clearly different from your measured skin colour (colour difference ${n1(de)}).`,
  lighter: (d: number) => `It is lighter than your skin colour, by about ${n0(d)} points on the lightness scale.`,
  darker: (d: number) => `It is darker than your skin colour, by about ${n0(d)} points on the lightness scale.`,
  warmer: (d: number) => `It leans warmer (more yellow) than your skin colour, by about ${n0(d)} degrees of hue. This is an estimate from the photo.`,
  cooler: (d: number) => `It leans cooler (more pink or red) than your skin colour, by about ${n0(d)} degrees of hue. This is an estimate from the photo.`,
  nearBoundary: (de: number, below: VerdictLabel, above: VerdictLabel, cut: number) =>
    `This is close to the cut-off between a ${LABEL_NAME[below]} and a ${LABEL_NAME[above]} (${n1(cut)}), and your colour difference is ${n1(de)}, so a small change in lighting could change the result.`,
  apiQuality: () => "The analysis service did not confirm the photo quality, so this is less certain.",
  photoQuality: (v: number) => `Your photo scored ${n2(v)} out of 1 on our quality check, so this is less certain than a perfect photo.`,
  lowValidity: (v: number, min: number) =>
    `Your photo scored ${n2(v)} out of 1 on our quality check, and we need at least ${n2(min)} for a reliable result. Please retake it.`,
  noMeasurement: () => "We could not read a skin colour from this photo. Please retake it.",
  badSwatch: () => "This shade's colour data is missing, so we cannot compare it.",
} as const;

/** The three verdicts come only from this function. Boundaries are inclusive on the better side. */
export function labelFromDeltaE(de: number): Exclude<VerdictLabel, "cant_tell"> {
  if (de <= VERDICT.goodMax) return "good_match";
  if (de <= VERDICT.closeMax) return "close_match";
  return "poor_match";
}

export function nearestCutoff(de: number): { near: boolean; cutoff: number; below: VerdictLabel; above: VerdictLabel } {
  const toGood = Math.abs(de - VERDICT.goodMax);
  const toClose = Math.abs(de - VERDICT.closeMax);
  const useGood = toGood <= toClose;
  return {
    near: Math.min(toGood, toClose) < VERDICT.boundaryMargin,
    cutoff: useGood ? VERDICT.goodMax : VERDICT.closeMax,
    below: useGood ? "good_match" : "close_match",
    above: useGood ? "close_match" : "poor_match",
  };
}

export function confidenceFromValidity(v: number): Confidence {
  return v >= QUALITY.score.high ? "high" : v >= QUALITY.score.medium ? "medium" : "low";
}

export function lowerConfidence(c: Confidence): Confidence {
  return c === "high" ? "medium" : "low";
}

const labOf = (hex: string): Lab => rgbToLab(...hexToRgb(hex));
const hueOf = (l: Lab): number => ((Math.atan2(l.b, l.a) * 180) / Math.PI + 360) % 360;
const wrap180 = (d: number): number => (d > 180 ? d - 360 : d < -180 ? d + 360 : d);

function cantTell(itemId: string, code: string, text: string, retake: boolean): ItemVerdict {
  return { itemId, label: "cant_tell", confidence: "low", deltaE: null, reasons: [{ code, text }], retake, basis: null };
}

/**
 * Judges one shade against one measured skin colour. Pure and deterministic: same inputs, same output.
 * `validity` is the capture-quality score (0 to 1) from the on-device gate.
 */
export function judgeItem(m: Measurement, validity: number, item: SwatchItem): ItemVerdict {
  const v = Number.isFinite(validity) ? validity : 0;
  if (v < VERDICT.minValidity) {
    return cantTell(item.id, "low_validity", TEXT.lowValidity(v, VERDICT.minValidity), true);
  }
  if (typeof m?.skinHex !== "string" || !HEX.test(m.skinHex)) {
    return cantTell(item.id, "no_measurement", TEXT.noMeasurement(), true);
  }
  if (typeof item?.hex !== "string" || !HEX.test(item.hex)) {
    return cantTell(item.id, "bad_swatch", TEXT.badSwatch(), false);
  }

  const skinLab = labOf(m.skinHex);
  const swatchLab = labOf(item.hex);
  const deltaE = deltaE00(skinLab, swatchLab);
  const dL = swatchLab.L - skinLab.L;
  const dHue = wrap180(hueOf(swatchLab) - hueOf(skinLab));
  const label = labelFromDeltaE(deltaE);

  const reasons: Reason[] = [];
  reasons.push(
    label === "good_match"
      ? { code: "match_good", text: TEXT.good(deltaE) }
      : label === "close_match"
        ? { code: "match_close", text: TEXT.close(deltaE) }
        : { code: "match_poor", text: TEXT.poor(deltaE) },
  );
  if (Math.abs(dL) >= VERDICT.lightnessNoteMin) {
    reasons.push(dL > 0 ? { code: "lighter", text: TEXT.lighter(dL) } : { code: "darker", text: TEXT.darker(-dL) });
  }
  const chromaOk = Math.hypot(skinLab.a, skinLab.b) >= VERDICT.minChromaForHue && Math.hypot(swatchLab.a, swatchLab.b) >= VERDICT.minChromaForHue;
  if (chromaOk && Math.abs(dHue) >= VERDICT.hueNoteMinDeg) {
    reasons.push(dHue > 0 ? { code: "warmer", text: TEXT.warmer(dHue) } : { code: "cooler", text: TEXT.cooler(-dHue) });
  }

  let confidence = confidenceFromValidity(v);
  if (confidence !== "high") reasons.push({ code: "photo_quality", text: TEXT.photoQuality(v) });
  if (!m.qualityConfirmed) {
    confidence = lowerConfidence(confidence);
    reasons.push({ code: "api_quality", text: TEXT.apiQuality() });
  }
  const edge = nearestCutoff(deltaE);
  if (edge.near) {
    confidence = lowerConfidence(confidence);
    reasons.push({ code: "near_boundary", text: TEXT.nearBoundary(deltaE, edge.below, edge.above, edge.cutoff) });
  }

  return {
    itemId: item.id,
    label,
    confidence,
    deltaE,
    reasons,
    retake: false,
    basis: { skinLab, swatchLab, deltaE, dL, dHue },
  };
}
