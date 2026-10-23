import { assetUrl } from "./assets";

const HEX = /^#[0-9a-fA-F]{6}$/;
const ID = /^[A-Za-z0-9_-]{1,40}$/;
const FILE = /^[A-Za-z0-9_-]{1,40}\.(jpg|png)$/;

export interface SamplePreview {
  id: string;
  hex: string;
  file: string; // a file name inside /samples/, never a path or address
}

export interface Sample {
  recordedAt: string;
  subject: string; // what the sample was recorded on, shown to the shopper
  skinHex: string;
  allGood: boolean;
  previews: SamplePreview[];
}

const obj = (v: unknown): Record<string, unknown> | null =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;

/** The recorded file is checked like any other input before it reaches the page. */
export function parseSample(raw: unknown): Sample | null {
  const r = obj(raw);
  if (!r || r.version !== 1) return null;
  const tone = obj(r.tone);
  if (!tone || typeof tone.skinHex !== "string" || !HEX.test(tone.skinHex)) return null;
  if (typeof r.recordedAt !== "string" || r.recordedAt.length > 40) return null;
  if (typeof r.subject !== "string" || r.subject.length === 0 || r.subject.length > 200) return null;
  const previews: SamplePreview[] = [];
  if (Array.isArray(r.previews)) {
    for (const p of r.previews) {
      const o = obj(p);
      if (o && typeof o.id === "string" && ID.test(o.id) && typeof o.hex === "string" && HEX.test(o.hex) && typeof o.file === "string" && FILE.test(o.file)) {
        previews.push({ id: o.id, hex: o.hex, file: o.file });
      }
    }
  }
  return { recordedAt: r.recordedAt, subject: r.subject, skinHex: tone.skinHex.toLowerCase(), allGood: tone.allGood === true, previews };
}

export function pickPreview(s: Sample, productId: string, swatchHex: string): SamplePreview | null {
  return (
    s.previews.find((p) => p.id === productId) ??
    s.previews.find((p) => p.hex.toLowerCase() === swatchHex.toLowerCase()) ??
    null
  );
}

export async function loadSample(): Promise<Sample | null> {
  try {
    const res = await fetch(assetUrl("samples/samples.json"), { credentials: "omit" });
    if (!res.ok) return null;
    return parseSample(await res.json());
  } catch {
    return null;
  }
}
