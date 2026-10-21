import { describe, expect, it } from "vitest";
import { parseCsv, summarize, type FairnessRecord } from "@/shared/fairness";

const rec = (tone: string, intent: "good" | "bad", passed: boolean, failed: string[] = []): FairnessRecord => ({
  tone, lighting: "daylight-window", device: "phone-front", intent, fault: intent === "bad" ? "dark" : "none",
  passed, score: passed ? 1 : 0.5, failed, warned: [],
});
const many = (n: number, f: (i: number) => FairnessRecord) => Array.from({ length: n }, (_, i) => f(i));

describe("summarize", () => {
  it("reports no disparity when every tone group behaves the same", () => {
    const records = ["light", "medium", "deep"].flatMap((t) => many(6, () => rec(t, "good", true)));
    const s = summarize(records);
    expect(s.flags.some((f) => f.startsWith("Disparity"))).toBe(false);
  });

  it("flags deep skin when good photos are refused much more often", () => {
    const records = [
      ...many(6, () => rec("light", "good", true)),
      ...many(6, () => rec("medium", "good", true)),
      ...many(6, (i) => rec("deep", "good", i < 3, i < 3 ? [] : ["brightness"])),
    ];
    const s = summarize(records);
    expect(s.flags.some((f) => f.startsWith("Disparity") && f.includes("deep"))).toBe(true);
    expect(s.reasons.deep.brightness).toBe(3);
  });

  it("flags bad photos that slip through for one tone group", () => {
    const records = [
      ...many(5, () => rec("light", "bad", false)),
      ...many(5, (i) => rec("deep", "bad", i < 3)),
    ];
    expect(summarize(records).flags.some((f) => f.includes("wrongly passed"))).toBe(true);
  });

  it("asks for more data instead of judging tiny groups", () => {
    const s = summarize(many(2, () => rec("deep", "good", false)));
    expect(s.flags.some((f) => f.startsWith("Not enough good photos for deep"))).toBe(true);
    expect(s.flags.some((f) => f.startsWith("Disparity"))).toBe(false);
  });

  it("leaves out records without a tone group", () => {
    expect(summarize([rec("skip", "good", true), rec("", "good", true)]).excluded).toBe(2);
  });
});

describe("parseCsv", () => {
  it("reads the recorder's columns", () => {
    const csv = [
      "ts,tone,lighting,device,intent,fault,passed,score,confidence,failed,warned,autoFramed",
      "2026-10-17T10:00:00Z,deep,low-light,phone-front,good,none,false,0.65,low,brightness|face_size,motion_blur,false",
      "bad row without intent",
    ].join("\n");
    const rows = parseCsv(csv);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ tone: "deep", passed: false, failed: ["brightness", "face_size"] });
  });
});
