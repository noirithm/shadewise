import { describe, expect, it } from "vitest";
import { validateUpload } from "@/server/upload";

function jpeg(w: number, h: number): Uint8Array {
  return new Uint8Array([
    0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04, 0x00, 0x00,
    0xff, 0xc0, 0x00, 0x0b, 0x08, h >> 8, h & 255, w >> 8, w & 255, 0x01, 0x01, 0x11, 0x00,
  ]);
}
function png(w: number, h: number): Uint8Array {
  const b = new Uint8Array(32);
  b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
  new DataView(b.buffer).setUint32(16, w);
  new DataView(b.buffer).setUint32(20, h);
  return b;
}

describe("validateUpload", () => {
  it("accepts a normal jpeg and png and reads their size", () => {
    expect(validateUpload(jpeg(667, 1000))).toEqual({ ok: true, type: "image/jpeg", width: 667, height: 1000 });
    expect(validateUpload(png(800, 600))).toEqual({ ok: true, type: "image/png", width: 800, height: 600 });
  });
  it("rejects by content, not by name: text pretending to be a photo", () => {
    expect(validateUpload(new TextEncoder().encode("hello, I am a jpg"))).toEqual({ ok: false, problem: "unsupported" });
  });
  it("rejects empty, oversized and unreadable uploads", () => {
    expect(validateUpload(new Uint8Array())).toEqual({ ok: false, problem: "empty" });
    expect(validateUpload(new Uint8Array(6 * 1024 * 1024))).toEqual({ ok: false, problem: "too_big" });
    expect(validateUpload(new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 4, 0, 0, 1, 2, 3, 4]))).toEqual({ ok: false, problem: "unreadable" });
  });
  it("rejects images too small or too large to analyse", () => {
    expect(validateUpload(jpeg(200, 300))).toEqual({ ok: false, problem: "too_small" });
    expect(validateUpload(jpeg(3000, 2000))).toEqual({ ok: false, problem: "too_large_dimensions" });
  });
});
