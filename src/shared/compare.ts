import { VERDICT } from "../config/verdict";
import { inr } from "./money";
import { LABEL_NAME, type ItemVerdict } from "./verdictEngine";
import type { Confidence, Reason, VerdictLabel } from "./verdict";

export interface CompareItem {
  id: string;
  shade: string;
  priceInr: number;
}

export type Recommendation = "buy" | "consider" | "skip" | "retake";

export interface RankedEntry {
  itemId: string;
  rank: number;
  recommendation: Recommendation;
  verdict: ItemVerdict;
}

export interface Comparison {
  ranked: RankedEntry[];
  notes: Reason[];
  confidence: Confidence;
  tie: boolean; // the best shades are too close to tell apart
}

const n1 = (x: number) => x.toFixed(1);
const a = (l: VerdictLabel) => `a ${LABEL_NAME[l]}`;
const CONF_ORDER: Confidence[] = ["low", "medium", "high"];

export const COMPARE_TEXT = {
  allCantTell: () => "We can't compare these shades from this photo. Please retake it.",
  best: (shade: string, de: number) => `${shade} is your closest match (colour difference ${n1(de)}).`,
  noGood: (shade: string, de: number) =>
    `None of these shades is a good match for your measured skin colour. The closest is ${shade} (colour difference ${n1(de)}).`,
  tie2: (s1: string, d1: number, s2: string, d2: number) =>
    `${s1} and ${s2} are equally close matches (colour differences ${n1(d1)} and ${n1(d2)}); the gap is too small to notice.`,
  tieN: (n: number, list: string) => `${n} shades are equally close matches (colour differences ${list}); the gaps are too small to notice.`,
  cheaperTie: (shade: string, save: number) => `${shade} costs ${inr(save)} less.`,
  tradeoffLabel: (alt: string, save: number, best: string, altLabel: VerdictLabel, altDe: number, bestLabel: VerdictLabel) =>
    `${alt} costs ${inr(save)} less than ${best}, but it is ${a(altLabel)} (colour difference ${n1(altDe)}) rather than ${a(bestLabel)}.`,
  tradeoffSame: (alt: string, save: number, best: string, altDe: number, bestDe: number) =>
    `${alt} costs ${inr(save)} less than ${best}, but it is a slightly weaker match (colour difference ${n1(altDe)} against ${n1(bestDe)}).`,
  lowConfidence: () => "Confidence is low because of the photo quality, so this order could change if you retake the photo.",
} as const;

export interface CompareInput {
  item: CompareItem;
  verdict: ItemVerdict;
}

/** Deterministic ranking with plain-language trade-offs. Ties within the tie margin are reported as ties. */
export function compareItems(entries: CompareInput[]): Comparison {
  const usable = entries
    .filter((e) => e.verdict.label !== "cant_tell" && e.verdict.deltaE !== null)
    .sort((x, y) => (x.verdict.deltaE as number) - (y.verdict.deltaE as number) || x.item.id.localeCompare(y.item.id));
  const unusable = entries.filter((e) => !usable.includes(e));

  if (usable.length === 0) {
    return {
      ranked: entries.map((e, i) => ({ itemId: e.item.id, rank: i + 1, recommendation: "retake", verdict: e.verdict })),
      notes: [{ code: "all_cant_tell", text: COMPARE_TEXT.allCantTell() }],
      confidence: "low",
      tie: false,
    };
  }

  const best = usable[0];
  const bestDe = best.verdict.deltaE as number;
  const group = usable
    .filter((e) => e.verdict.label === best.verdict.label && (e.verdict.deltaE as number) - bestDe <= VERDICT.tieMargin)
    .sort((x, y) => x.item.priceInr - y.item.priceInr || (x.verdict.deltaE as number) - (y.verdict.deltaE as number) || x.item.id.localeCompare(y.item.id));
  const inGroup = new Set(group.map((e) => e.item.id));
  const rest = usable.filter((e) => !inGroup.has(e.item.id));
  const bestIsPoor = best.verdict.label === "poor_match";
  const cheapest = group[0];
  const groupMinPrice = cheapest.item.priceInr;

  const recFor = (e: CompareInput): Recommendation => {
    if (bestIsPoor) return "skip";
    if (inGroup.has(e.item.id)) return "buy";
    if (e.verdict.label === "good_match") return "consider";
    if (e.verdict.label === "close_match") return e.item.priceInr < groupMinPrice ? "consider" : "skip";
    return "skip";
  };

  const ordered = [...group, ...rest, ...unusable];
  const ranked: RankedEntry[] = ordered.map((e, i) => ({
    itemId: e.item.id,
    rank: i + 1,
    recommendation: usable.includes(e) ? recFor(e) : "retake",
    verdict: e.verdict,
  }));

  const notes: Reason[] = [];
  const tie = !bestIsPoor && group.length > 1;
  if (bestIsPoor) {
    notes.push({ code: "no_good_option", text: COMPARE_TEXT.noGood(best.item.shade, bestDe) });
  } else if (!tie) {
    notes.push({ code: "best_match", text: COMPARE_TEXT.best(best.item.shade, bestDe) });
  } else {
    const byDe = [...group].sort((x, y) => (x.verdict.deltaE as number) - (y.verdict.deltaE as number));
    notes.push(
      group.length === 2
        ? { code: "tie", text: COMPARE_TEXT.tie2(byDe[0].item.shade, byDe[0].verdict.deltaE as number, byDe[1].item.shade, byDe[1].verdict.deltaE as number) }
        : { code: "tie", text: COMPARE_TEXT.tieN(group.length, byDe.map((e) => n1(e.verdict.deltaE as number)).join(", ")) },
    );
    const dearest = group[group.length - 1];
    if (dearest.item.priceInr > cheapest.item.priceInr) {
      notes.push({ code: "cheaper_tie", text: COMPARE_TEXT.cheaperTie(cheapest.item.shade, dearest.item.priceInr - cheapest.item.priceInr) });
    }
  }

  if (!bestIsPoor) {
    for (const e of rest) {
      if (e.verdict.label === "poor_match" || e.item.priceInr >= groupMinPrice) continue;
      const save = groupMinPrice - e.item.priceInr;
      const altDe = e.verdict.deltaE as number;
      notes.push(
        e.verdict.label === best.verdict.label
          ? { code: "tradeoff", text: COMPARE_TEXT.tradeoffSame(e.item.shade, save, cheapest.item.shade, altDe, bestDe) }
          : { code: "tradeoff", text: COMPARE_TEXT.tradeoffLabel(e.item.shade, save, cheapest.item.shade, e.verdict.label, altDe, best.verdict.label) },
      );
    }
  }

  const confidence = usable.reduce<Confidence>((lowest, e) => (CONF_ORDER.indexOf(e.verdict.confidence) < CONF_ORDER.indexOf(lowest) ? e.verdict.confidence : lowest), "high");
  if (confidence === "low") notes.push({ code: "low_confidence", text: COMPARE_TEXT.lowConfidence() });

  return { ranked, notes, confidence, tie };
}
