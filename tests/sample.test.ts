import { afterEach, describe, expect, it, vi } from "vitest";
import { loadSample, parseSample, pickPreview } from "@/widget/sample";
import { reduce } from "@/widget/machine";

const good = {
  version: 1,
  recordedAt: "2026-10-18T10:00:00Z",
  subject: "AI-generated example face, not a real person",
  tone: { skinHex: "#B48868", allGood: true },
  previews: [
    { id: "demo-04", hex: "#B88F76", file: "demo-04.jpg" },
    { id: "demo-05", hex: "#A57656", file: "demo-05.png" },
  ],
};

describe("parseSample", () => {
  it("accepts a recorded sample and lower-cases the colour", () => {
    const s = parseSample(good)!;
    expect(s.skinHex).toBe("#b48868");
    expect(s.previews).toHaveLength(2);
  });
  it("rejects anything that is not the expected shape", () => {
    for (const bad of [null, "x", [], {}, { ...good, version: 2 }, { ...good, tone: { skinHex: "red" } }, { ...good, subject: "" }, { ...good, subject: "x".repeat(300) }]) {
      expect(parseSample(bad)).toBeNull();
    }
  });
  it("drops preview entries with unsafe file names or bad colours, instead of trusting them", () => {
    const s = parseSample({
      ...good,
      previews: [
        { id: "a", hex: "#B88F76", file: "../../secret.jpg" },
        { id: "b", hex: "#B88F76", file: "https://evil.example/x.jpg" },
        { id: "c", hex: "blue", file: "c.jpg" },
        { id: "<img>", hex: "#B88F76", file: "d.jpg" },
        { id: "ok", hex: "#B88F76", file: "ok.jpg" },
      ],
    })!;
    expect(s.previews.map((p) => p.id)).toEqual(["ok"]);
  });
});

describe("pickPreview", () => {
  const s = parseSample(good)!;
  it("prefers the product id, then falls back to the swatch colour", () => {
    expect(pickPreview(s, "demo-05", "#000000")?.file).toBe("demo-05.png");
    expect(pickPreview(s, "other", "#b88f76")?.file).toBe("demo-04.jpg");
  });
  it("says so when no preview was recorded for the shade", () => {
    expect(pickPreview(s, "other", "#123456")).toBeNull();
  });
});

describe("loadSample", () => {
  afterEach(() => vi.unstubAllGlobals());
  it("loads and checks the recorded file", async () => {
    const f = vi.fn(async () => new Response(JSON.stringify(good)));
    vi.stubGlobal("fetch", f);
    expect((await loadSample())?.skinHex).toBe("#b48868");
    const calls = f.mock.calls as unknown as unknown[][];
    expect(String(calls[0][0])).toContain("samples/samples.json");
  });
  it("returns null when the file is missing, broken or unreachable", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("nope", { status: 404 })));
    expect(await loadSample()).toBeNull();
    vi.stubGlobal("fetch", vi.fn(async () => new Response("not json")));
    expect(await loadSample()).toBeNull();
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("offline"); }));
    expect(await loadSample()).toBeNull();
  });
});

describe("sample mode transitions", () => {
  it("can be reached from the photo choice and from the budget screen", () => {
    expect(reduce({ name: "source" }, { type: "SHOW_SAMPLE" }).name).toBe("sample");
    expect(reduce({ name: "budget_exhausted" }, { type: "SHOW_SAMPLE" }).name).toBe("sample");
  });
  it("lets the shopper go back to using their own photo, or close", () => {
    expect(reduce({ name: "sample" }, { type: "RETAKE" }).name).toBe("source");
    expect(reduce({ name: "sample" }, { type: "RESET" }).name).toBe("idle");
  });
  it("is not reachable by accident from other screens", () => {
    expect(reduce({ name: "idle" }, { type: "SHOW_SAMPLE" }).name).toBe("idle");
    expect(reduce({ name: "analyzing" }, { type: "SHOW_SAMPLE" }).name).toBe("analyzing");
  });
});
