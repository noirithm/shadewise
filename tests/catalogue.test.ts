import { describe, expect, it } from "vitest";
import { CATALOGUE, CATALOGUE_LABEL } from "@/config/catalogue";

describe("demo catalogue", () => {
  it("has 6 to 10 products with unique, safe ids", () => {
    expect(CATALOGUE.length).toBeGreaterThanOrEqual(6);
    expect(CATALOGUE.length).toBeLessThanOrEqual(10);
    const ids = CATALOGUE.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[A-Za-z0-9_-]{1,40}$/);
  });
  it("uses valid swatch colours and whole-rupee prices", () => {
    for (const p of CATALOGUE) {
      expect(p.hex).toMatch(/^#[0-9A-Fa-f]{6}$/);
      expect(Number.isInteger(p.priceInr) && p.priceInr > 0).toBe(true);
    }
  });
  it("is clearly a demo: no real brand names and a visible label", () => {
    expect(CATALOGUE_LABEL).toMatch(/demo/i);
    for (const p of CATALOGUE) expect(p.brand).toMatch(/demo/i);
  });
});
