import { VERDICT } from "../config/verdict";
import { compareItems, type Comparison, type Recommendation } from "../shared/compare";
import { inr } from "../shared/money";
import type { VerdictLabel } from "../shared/verdict";
import { judgeItem, type ItemVerdict } from "../shared/verdictEngine";
import type { Item } from "./catalogue";
import { escapeHtml as esc } from "./html";
import { R } from "./resultStrings";
import { S } from "./strings";

export type PreviewRef = { status: "ok"; url: string } | { status: "failed" | "skipped" | "none" };

export interface ResultInput {
  source: "live" | "sample";
  skinHex: string;
  qualityConfirmed: boolean;
  validity: number; // capture-quality score from the on-device gate
  items: Item[]; // the page's product first
  previews: Record<string, PreviewRef>;
  busy: string[]; // item ids whose preview is being made
}

export interface ShadeResult {
  item: Item;
  verdict: ItemVerdict;
  recommendation: Recommendation | null;
  rank: number | null;
  preview: PreviewRef;
  busy: boolean;
}

export interface ResultModel {
  source: "live" | "sample";
  skinHex: string;
  primary: ShadeResult;
  ranked: ShadeResult[]; // every compared shade in rank order; empty when only one shade
  comparison: Comparison | null;
}

export function buildResultModel(input: ResultInput): ResultModel {
  const m = { skinHex: input.skinHex, qualityConfirmed: input.qualityConfirmed };
  const results = input.items.map((item) => ({
    item,
    verdict: judgeItem(m, input.validity, { id: item.id, hex: item.hex }),
  }));
  const comparison =
    results.length > 1
      ? compareItems(results.map((r) => ({ item: { id: r.item.id, shade: r.item.shade, priceInr: r.item.priceInr }, verdict: r.verdict })))
      : null;
  const rankOf = new Map(comparison?.ranked.map((e) => [e.itemId, e] as const) ?? []);
  const shade = (r: (typeof results)[number]): ShadeResult => ({
    item: r.item,
    verdict: r.verdict,
    recommendation: rankOf.get(r.item.id)?.recommendation ?? null,
    rank: rankOf.get(r.item.id)?.rank ?? null,
    preview: input.previews[r.item.id] ?? { status: "none" },
    busy: input.busy.includes(r.item.id),
  });
  const all = results.map(shade);
  return {
    source: input.source,
    skinHex: input.skinHex,
    primary: all[0],
    ranked: comparison ? [...all].sort((a, b) => (a.rank ?? 99) - (b.rank ?? 99)) : [],
    comparison,
  };
}

/** The one-line summary announced to screen readers when the result appears. */
export function summaryText(m: ResultModel): string {
  const v = m.primary.verdict;
  const shade = m.primary.item.shade;
  if (v.label === "cant_tell") return `${shade}: ${R.cantTellSummary}`;
  return `${shade}: ${R.verdict[v.label]}. ${R.confidence}: ${R.confidenceName[v.confidence]}.`;
}

const f1 = (n: number) => n.toFixed(1);
const verdictClass: Record<VerdictLabel, string> = { good_match: "v-good", close_match: "v-close", poor_match: "v-poor", cant_tell: "v-cant" };
const recClass: Record<Recommendation, string> = { buy: "rec-buy", consider: "rec-consider", skip: "rec-skip", retake: "rec-skip" };

const badge = (label: VerdictLabel) =>
  `<span class="verdict ${verdictClass[label]}"><span aria-hidden="true">${R.verdictIcon[label]}</span> ${esc(R.verdict[label])}</span>`;

const title = (i: Item) => esc(i.shade) + (i.priceInr > 0 ? ` <span class="price">${esc(inr(i.priceInr))}</span>` : "");

function swatch(hex: string, label: string): string {
  return (
    `<div class="sw"><span class="chip" role="img" aria-label="${esc(label)} ${esc(hex)}" data-swatch="${esc(hex)}"></span>` +
    `<span>${esc(label)}<br><code>${esc(hex)}</code></span></div>`
  );
}

function previewBlock(s: ShadeResult, m: ResultModel): string {
  if (s.verdict.label === "cant_tell") return "";
  const p = s.preview;
  if (p.status === "ok") {
    return (
      `<figure class="fig"><img class="preview" data-src="${esc(p.url)}" alt="${esc(R.previewAlt(s.item.shade))}">` +
      `<figcaption>${esc(R.aiPreview)}${m.source === "sample" ? " (recorded)" : ""}</figcaption></figure>` +
      `<p class="note">${esc(R.previewNote)}</p>`
    );
  }
  if (m.source === "sample") return `<p class="note">${esc(S.sampleNoPreview)}</p>`;
  return `<p class="note">${esc(p.status === "skipped" ? R.previewPaused : R.previewFailed)}</p>`;
}

function rankRow(s: ShadeResult, m: ResultModel): string {
  const v = s.verdict;
  const isThis = s.item.id === m.primary.item.id;
  let action = "";
  if (v.label !== "cant_tell") {
    if (s.preview.status === "ok") {
      action = `<img class="thumb" data-src="${esc(s.preview.url)}" alt="${esc(R.previewAlt(s.item.shade))}"><p class="note">${esc(R.aiPreview)}</p>`;
    } else if (m.source === "live" && !isThis && (s.preview.status === "none" || s.preview.status === "failed")) {
      action = s.busy
        ? `<button class="btn small" type="button" aria-disabled="true" data-action="preview" data-item-id="${esc(s.item.id)}" data-preview-btn="${esc(s.item.id)}">${esc(R.previewBusy)}</button>`
        : `<button class="btn small" type="button" data-action="preview" data-item-id="${esc(s.item.id)}" data-preview-btn="${esc(s.item.id)}">${esc(R.showPreview)}</button>`;
    } else if (m.source === "sample") {
      action = `<p class="note">${esc(S.sampleNoPreview)}</p>`;
    }
  }
  const rec = s.recommendation;
  return (
    `<li><p><strong>${s.rank}. ${title(s.item)}</strong>${isThis ? ` <span class="note">(${esc(R.thisProduct)})</span>` : ""}</p>` +
    `<p>${badge(v.label)}${rec ? ` <span class="rec ${recClass[rec]}">${esc(R.rec[rec])}</span>` : ""}` +
    `${v.deltaE !== null ? ` <span class="note">Colour difference ${f1(v.deltaE)}</span>` : ""}</p>${action}</li>`
  );
}

export function renderResultHtml(m: ResultModel): string {
  const p = m.primary;
  const v = p.verdict;
  const parts: string[] = [];

  if (m.source === "sample") {
    parts.push(`<p><span class="badge">${esc(S.sampleBadge)}</span></p><p>${esc(S.sampleBody)}</p>`);
  }

  parts.push(`<h3 class="h3">${title(p.item)}</h3>`);
  parts.push(`<p>${badge(v.label)}</p>`);
  if (v.label === "cant_tell") {
    parts.push(`<p><strong>${esc(R.retakeLead)}</strong></p>`);
  } else {
    parts.push(`<p>${esc(R.confidence)}: <strong>${esc(R.confidenceName[v.confidence])}</strong></p>`);
    parts.push(`<p class="note">${esc(R.difference(f1(v.deltaE as number), f1(VERDICT.goodMax)))}</p>`);
    parts.push(`<div class="swatches">${swatch(m.skinHex, R.yourSkin)}${swatch(p.item.hex, R.shadeColour)}</div>`);
  }
  parts.push(`<h4 class="h4">${esc(R.why)}</h4><ul>${v.reasons.map((r) => `<li>${esc(r.text)}</li>`).join("")}</ul>`);
  parts.push(previewBlock(p, m));

  if (m.comparison) {
    parts.push(`<h3 class="h3">${esc(R.compareTitle)}</h3>`);
    parts.push(`<ol class="rank">${m.ranked.map((s) => rankRow(s, m)).join("")}</ol>`);
    parts.push(`<ul>${m.comparison.notes.map((n) => `<li>${esc(n.text)}</li>`).join("")}</ul>`);
  }
  parts.push(`<p class="note">${esc(R.disclaimer)}</p>`);
  return parts.join("");
}

/** Colours and image addresses are set through the DOM, which works on pages with a strict style policy. */
export function fillResultDom(root: ParentNode): void {
  const HEX = /^#[0-9a-fA-F]{6}$/;
  root.querySelectorAll<HTMLElement>("[data-swatch]").forEach((el) => {
    const hex = el.dataset.swatch ?? "";
    if (HEX.test(hex)) el.style.background = hex;
  });
  root.querySelectorAll<HTMLImageElement>("img[data-src]").forEach((img) => {
    const src = img.dataset.src ?? "";
    if (/^https?:\/\//.test(src)) img.src = src;
  });
}
