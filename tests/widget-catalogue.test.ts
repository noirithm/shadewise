import { afterEach, describe, expect, it, vi } from "vitest";
import { CATALOGUE } from "@/config/catalogue";
import { DEFAULT_SWATCH, loadCatalogue, parseCatalogue, parseIdList, resolveItems, type Item } from "@/widget/catalogue";

const good = { id: "demo-04", name: "Skin Tint Foundation", shade: "Honey 04", hex: "#B88F76", priceInr: 949 };

describe("parseCatalogue: a brand's server is not trusted", () => {
  it("accepts an array or an object with items, and the real demo catalogue", () => {
    expect(parseCatalogue([good])).toEqual([good]);
    expect(parseCatalogue({ label: "Demo catalogue", items: [good] })).toEqual([good]);
    const all = parseCatalogue({ items: CATALOGUE.map(({ id, name, shade, hex, priceInr }) => ({ id, name, shade, hex, priceInr })) });
    expect(all).toHaveLength(CATALOGUE.length);
  });
  it("drops items with a bad id, colour, shade or price, and keeps the good ones", () => {
    const bad = [
      { ...good, id: "has space" },
      { ...good, id: "<img src=x>" },
      { ...good, id: "a".repeat(41) },
      { ...good, hex: "red" },
      { ...good, hex: "#12345" },
      { ...good, shade: "" },
      { ...good, shade: "x".repeat(61) },
      { ...good, priceInr: -1 },
      { ...good, priceInr: 9.5 },
      { ...good, priceInr: "949" },
      { ...good, priceInr: 2_000_000 },
      null,
      "text",
      42,
    ];
    const r = parseCatalogue([...bad, { ...good, id: "ok" }]);
    expect(r?.map((i) => i.id)).toEqual(["ok"]);
  });
  it("keeps only the first of a repeated id", () => {
    expect(parseCatalogue([good, { ...good, shade: "Other" }])?.map((i) => i.shade)).toEqual(["Honey 04"]);
  });
  it("returns null for anything that is not a usable catalogue", () => {
    for (const junk of [null, undefined, "x", 3, {}, [], { items: "nope" }, { items: [] }, [{ id: "!" }]]) {
      expect(parseCatalogue(junk)).toBeNull();
    }
  });
  it("treats a missing product line as empty rather than failing", () => {
    expect(parseCatalogue([{ id: "a", shade: "S", hex: "#AABBCC", priceInr: 100 }])?.[0].name).toBe("");
  });
  it("does not let hostile text change meaning: it is kept as plain data for the renderer to escape", () => {
    const r = parseCatalogue([{ ...good, shade: `<script>alert(1)</script>` }]);
    expect(r?.[0].shade).toBe("<script>alert(1)</script>");
  });
});

describe("parseIdList", () => {
  it("keeps valid ids, drops junk and duplicates, and allows at most two to compare", () => {
    expect(parseIdList("demo-05, demo-10")).toEqual(["demo-05", "demo-10"]);
    expect(parseIdList("demo-05,demo-05,<b>,demo-10,demo-01")).toEqual(["demo-05", "demo-10"]);
    expect(parseIdList(null)).toEqual([]);
    expect(parseIdList("")).toEqual([]);
  });
});

describe("resolveItems", () => {
  const cat: Item[] = CATALOGUE.map(({ id, name, shade, hex, priceInr }) => ({ id, name, shade, hex, priceInr }));
  it("puts the page's product first, then the shades to compare", () => {
    const r = resolveItems(cat, "demo-04", null, ["demo-05", "demo-10"]);
    expect(r.map((i) => i.id)).toEqual(["demo-04", "demo-05", "demo-10"]);
  });
  it("ignores unknown ids, repeats of the main product, and anything beyond three shades", () => {
    expect(resolveItems(cat, "demo-04", null, ["nope", "demo-04", "demo-05"]).map((i) => i.id)).toEqual(["demo-04", "demo-05"]);
    expect(resolveItems(cat, "demo-04", null, ["demo-05", "demo-10", "demo-01"]).length).toBeLessThanOrEqual(3);
  });
  it("falls back to the page's own swatch when there is no catalogue", () => {
    const r = resolveItems(null, "my-shade", "#AABBCC", ["demo-05"]);
    expect(r).toEqual([{ id: "my-shade", name: "", shade: "my-shade", hex: "#AABBCC", priceInr: 0 }]);
  });
  it("never fails to return a main product, even with a bad swatch", () => {
    expect(resolveItems(null, "p", "not-a-colour", [])[0].hex).toBe(DEFAULT_SWATCH);
    expect(resolveItems(null, "p", null, [])).toHaveLength(1);
  });
});

describe("loadCatalogue", () => {
  afterEach(() => vi.unstubAllGlobals());
  it("loads and validates, resolving relative addresses against the widget's own site", async () => {
    const f = vi.fn(async () => new Response(JSON.stringify({ items: [good] })));
    vi.stubGlobal("fetch", f);
    expect(await loadCatalogue("/api/catalogue", "https://widget.example/")).toEqual([good]);
    const calls = f.mock.calls as unknown as unknown[][];
    expect(String(calls[0][0])).toBe("https://widget.example/api/catalogue");
    expect((calls[0][1] as RequestInit).credentials).toBe("omit");
  });
  it("returns null on a bad status, bad json, a network error or a non-web address", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("no", { status: 500 })));
    expect(await loadCatalogue("/x", "https://w.example/")).toBeNull();
    vi.stubGlobal("fetch", vi.fn(async () => new Response("not json")));
    expect(await loadCatalogue("/x", "https://w.example/")).toBeNull();
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("offline"); }));
    expect(await loadCatalogue("/x", "https://w.example/")).toBeNull();
    const f = vi.fn();
    vi.stubGlobal("fetch", f);
    expect(await loadCatalogue("javascript:alert(1)", "https://w.example/")).toBeNull();
    expect(await loadCatalogue("data:text/json,[]", "https://w.example/")).toBeNull();
    expect(f).not.toHaveBeenCalled();
  });
});
