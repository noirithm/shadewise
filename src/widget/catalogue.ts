export interface Item {
  id: string;
  name: string; // product line, may be empty
  shade: string;
  hex: string;
  priceInr: number; // 0 means unknown
}

export const DEFAULT_SWATCH = "#b88f76";
const ID = /^[A-Za-z0-9_-]{1,40}$/;
const HEX = /^#[0-9a-fA-F]{6}$/;
export const MAX_ITEMS = 3;

const text = (v: unknown, max: number): string | null =>
  typeof v === "string" && v.trim().length > 0 && v.length <= max ? v.trim() : null;

/** The catalogue comes from a brand's server, so every field is checked before the page uses it. */
export function parseCatalogue(raw: unknown): Item[] | null {
  const obj = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : null;
  const list = Array.isArray(raw) ? raw : obj && Array.isArray(obj.items) ? obj.items : null;
  if (!list) return null;
  const out: Item[] = [];
  const seen = new Set<string>();
  for (const r of list.slice(0, 200)) {
    const o = r && typeof r === "object" ? (r as Record<string, unknown>) : null;
    if (!o) continue;
    const shade = text(o.shade, 60);
    const price = o.priceInr;
    if (typeof o.id !== "string" || !ID.test(o.id) || seen.has(o.id)) continue;
    if (typeof o.hex !== "string" || !HEX.test(o.hex)) continue;
    if (!shade) continue;
    if (typeof price !== "number" || !Number.isInteger(price) || price < 0 || price > 1_000_000) continue;
    seen.add(o.id);
    out.push({ id: o.id, name: text(o.name, 60) ?? "", shade, hex: o.hex, priceInr: price });
  }
  return out.length ? out : null;
}

export function parseIdList(raw: string | null): string[] {
  if (!raw) return [];
  const ids = raw.split(",").map((s) => s.trim()).filter((s) => ID.test(s));
  return [...new Set(ids)].slice(0, MAX_ITEMS - 1);
}

/** Relative addresses resolve against the widget's own site, not the page it is embedded in. */
export async function loadCatalogue(src: string, base: string): Promise<Item[] | null> {
  try {
    const url = new URL(src, base);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    const res = await fetch(url.toString(), { credentials: "omit", signal: AbortSignal.timeout(5000) });
    if (!res.ok) return null;
    return parseCatalogue(await res.json());
  } catch {
    return null;
  }
}

/** The page's product first, then up to two shades to compare. Always returns at least one item. */
export function resolveItems(
  catalogue: Item[] | null,
  productId: string,
  swatchAttr: string | null,
  compareIds: string[],
): Item[] {
  const byId = new Map((catalogue ?? []).map((i) => [i.id, i] as const));
  const primary: Item =
    byId.get(productId) ?? {
      id: productId,
      name: "",
      shade: productId,
      hex: swatchAttr && HEX.test(swatchAttr) ? swatchAttr : DEFAULT_SWATCH,
      priceInr: 0,
    };
  const others = compareIds
    .filter((id) => id !== primary.id)
    .map((id) => byId.get(id))
    .filter((i): i is Item => i !== undefined);
  return [primary, ...others].slice(0, MAX_ITEMS);
}
