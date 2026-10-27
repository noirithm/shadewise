import { describe, expect, it } from "vitest";
import { CATALOGUE } from "@/config/catalogue";
import type { Item } from "@/widget/catalogue";
import { escapeHtml } from "@/widget/html";
import { buildResultModel, renderResultHtml, summaryText, type PreviewRef, type ResultInput } from "@/widget/resultView";

const item = (id: string): Item => {
  const p = CATALOGUE.find((x) => x.id === id)!;
  return { id: p.id, name: p.name, shade: p.shade, hex: p.hex, priceInr: p.priceInr };
};
const MEDIUM = "#B08060"; // a skin colour as a number, not a photo
const ok = (url = "https://example.invalid/p.jpg"): PreviewRef => ({ status: "ok", url });

function input(over: Partial<ResultInput> = {}): ResultInput {
  return {
    source: "live",
    skinHex: MEDIUM,
    qualityConfirmed: true,
    validity: 1,
    items: [item("demo-05")],
    previews: { "demo-05": ok() },
    busy: [],
    ...over,
  };
}
const html = (over: Partial<ResultInput> = {}) => renderResultHtml(buildResultModel(input(over)));

describe("escapeHtml", () => {
  it("escapes the characters that can break out of text or an attribute", () => {
    expect(escapeHtml(`<img src="x" onerror='a&b'>`)).toBe("&lt;img src=&quot;x&quot; onerror=&#39;a&amp;b&#39;&gt;");
  });
});

describe("buildResultModel", () => {
  it("judges the main shade and has no comparison for a single shade", () => {
    const m = buildResultModel(input());
    expect(m.primary.verdict.label).toBe("close_match");
    expect(m.comparison).toBeNull();
    expect(m.ranked).toEqual([]);
  });
  it("ranks several shades, with the page's product still available as the main result", () => {
    const m = buildResultModel(input({ items: [item("demo-04"), item("demo-05"), item("demo-10")], previews: {} }));
    expect(m.primary.item.id).toBe("demo-04");
    expect(m.ranked.map((s) => s.item.id)).toEqual(["demo-05", "demo-04", "demo-10"]);
    expect(m.ranked.map((s) => s.recommendation)).toEqual(["buy", "consider", "skip"]);
    expect(m.primary.rank).toBe(2);
  });
  it("shows can't tell for every shade when the photo quality is too low", () => {
    const m = buildResultModel(input({ validity: 0.3, items: [item("demo-04"), item("demo-05")] }));
    expect(m.primary.verdict.label).toBe("cant_tell");
    expect(m.ranked.every((s) => s.recommendation === "retake")).toBe(true);
  });
});

describe("renderResultHtml", () => {
  it("shows the verdict in words and symbols, the confidence, the number and the reasons", () => {
    const h = html();
    expect(h).toContain("Close match");
    expect(h).toContain("Confidence: <strong>Medium</strong>");
    expect(h).toMatch(/Colour difference 3\.\d \(lower is closer\)\. Up to 3\.5 counts as a good match\./);
    expect(h).toContain("This shade is near your measured skin colour");
    expect(h).toContain('aria-hidden="true">≈</span>'); // never colour alone
    expect(h).toContain("₹999");
    expect(h).toContain("Caramel 05");
  });
  it("labels the preview as an AI preview and says it never overrides the verdict", () => {
    const h = html();
    expect(h).toContain("AI preview");
    expect(h).toContain("The verdict comes from the measured colours, not from this image.");
    expect(h).toContain('data-src="https://example.invalid/p.jpg"');
  });
  it("still shows the whole verdict when the preview failed or was paused", () => {
    const failed = html({ previews: { "demo-05": { status: "failed" } } });
    expect(failed).toContain("Close match");
    expect(failed).toContain("The preview couldn&#39;t be made this time. The verdict is not affected.");
    expect(failed).not.toContain("<img");
    expect(html({ previews: { "demo-05": { status: "skipped" } } })).toContain("not available right now");
  });
  it("asks for a retake, with no swatches and no preview, when it can't tell", () => {
    const h = html({ validity: 0.3 });
    expect(h).toContain("Can&#39;t tell");
    expect(h).toContain("Retake your photo to get an answer.");
    expect(h).toContain("0.30 out of 1");
    expect(h).not.toContain("data-swatch");
    expect(h).not.toContain("<img");
    expect(h).not.toContain("Confidence:");
  });
  it("lists the comparison with recommendations, trade-offs and a preview button for shades without one", () => {
    const h = html({ items: [item("demo-04"), item("demo-05"), item("demo-10")], previews: { "demo-04": ok() } });
    expect(h).toContain("Compare shades");
    expect(h).toContain(">Buy<");
    expect(h).toContain(">Consider<");
    expect(h).toContain(">Skip<");
    expect(h).toContain("(this product)");
    expect(h).toContain("Honey 04 costs ₹50 less than Caramel 05");
    expect(h).toContain('data-action="preview" data-item-id="demo-05"');
    expect(h).toContain('data-action="preview" data-item-id="demo-10"');
    expect(h).not.toContain('data-item-id="demo-04"'); // the main shade already has its preview
  });
  it("shows a busy preview as disabled without losing the button", () => {
    const h = html({ items: [item("demo-04"), item("demo-05")], previews: {}, busy: ["demo-05"] });
    expect(h).toContain('aria-disabled="true" data-action="preview" data-item-id="demo-05"');
    expect(h).toContain("Making the preview...");
  });
  it("recorded sample mode is clearly labelled and never offers live previews", () => {
    const h = html({ source: "sample", items: [item("demo-04"), item("demo-05")], previews: { "demo-04": ok("https://example.invalid/s.jpg") } });
    expect(h).toContain("Recorded sample, not your photo");
    expect(h).toContain("It is not a result for you.");
    expect(h).toContain("AI preview (recorded)");
    expect(h).not.toContain('data-action="preview"');
    expect(h).toContain("No recorded preview for this shade.");
  });
  it("escapes hostile catalogue text everywhere it appears", () => {
    const evil: Item = { id: "evil", name: "x", shade: `<img src=x onerror=alert(1)>`, hex: "#B88F76", priceInr: 949 };
    const h = html({ items: [evil, item("demo-05")], previews: { evil: ok(`https://example.invalid/"><script>alert(1)</script>`) } });
    expect(h).not.toContain("<img src=x");
    expect(h).not.toContain("<script");
    expect(h).toContain("&lt;img src=x onerror=alert(1)&gt;");
    expect(h).toContain("&quot;&gt;&lt;script&gt;");
  });
  it("uses no inline styles, so it works on pages with a strict style policy", () => {
    const h = html({ items: [item("demo-04"), item("demo-05"), item("demo-10")] });
    expect(h).not.toMatch(/\sstyle=/);
    expect(h).not.toMatch(/\son[a-z]+=/i);
  });
  it("never prints a broken value", () => {
    for (const over of [{}, { validity: 0.3 }, { qualityConfirmed: false }, { items: [item("demo-04"), item("demo-05")] }]) {
      expect(html(over)).not.toMatch(/NaN|undefined|\bnull\b|\[object/);
    }
  });
  it("always includes the not-medical-advice note", () => {
    expect(html()).toContain("Cosmetic guidance only, not medical advice.");
    expect(html({ validity: 0.3 })).toContain("not medical advice");
  });
});

describe("summaryText (announced to screen readers)", () => {
  it("says the shade, the verdict and the confidence", () => {
    expect(summaryText(buildResultModel(input()))).toBe("Caramel 05: Close match. Confidence: Medium.");
  });
  it("tells the shopper to retake when it can't tell", () => {
    expect(summaryText(buildResultModel(input({ validity: 0.3 })))).toBe("Caramel 05: can't tell. Please retake your photo.");
  });
});
