import { describe, expect, it } from "vitest";
import { RateLimiter } from "@/server/ratelimit";
import { corsFor, parseOrigins } from "@/server/cors";
import { SessionCache, hashBytes } from "@/server/cache";

describe("RateLimiter", () => {
  it("allows up to the limit, then says how long to wait", () => {
    let t = 0;
    const l = new RateLimiter(3, 60_000, () => t);
    expect(l.take("a")).toEqual({ ok: true });
    t = 1000;
    expect(l.take("a")).toEqual({ ok: true });
    t = 2000;
    expect(l.take("a")).toEqual({ ok: true });
    t = 3000;
    expect(l.take("a")).toEqual({ ok: false, retryAfterSec: 57 });
  });
  it("lets requests through again once the window has passed", () => {
    let t = 0;
    const l = new RateLimiter(1, 1000, () => t);
    l.take("a");
    expect(l.take("a").ok).toBe(false);
    t = 1001;
    expect(l.take("a").ok).toBe(true);
  });
  it("counts each key separately", () => {
    const l = new RateLimiter(1, 1000, () => 0);
    expect(l.take("a").ok).toBe(true);
    expect(l.take("b").ok).toBe(true);
    expect(l.take("a").ok).toBe(false);
  });
});

describe("cors", () => {
  const self = "https://shadewise.example";
  const allowed = parseOrigins("https://shop.example/, https://other.example");
  it("parses the allowlist and trims trailing slashes", () => {
    expect(allowed).toEqual(["https://shop.example", "https://other.example"]);
    expect(parseOrigins(undefined)).toEqual([]);
  });
  it("lets same-origin and non-browser callers through without CORS headers", () => {
    expect(corsFor(null, self, allowed)).toEqual({ allowed: true, headers: {} });
    expect(corsFor(self, self, allowed)).toEqual({ allowed: true, headers: {} });
  });
  it("allows a listed site and echoes exactly that origin", () => {
    const c = corsFor("https://shop.example", self, allowed);
    expect(c.allowed).toBe(true);
    expect(c.headers["Access-Control-Allow-Origin"]).toBe("https://shop.example");
    expect(c.headers.Vary).toBe("Origin");
  });
  it("refuses unlisted sites, the string null, and lookalikes", () => {
    for (const o of ["https://evil.example", "null", "https://shop.example.evil.com", "http://shop.example"]) {
      expect(corsFor(o, self, allowed).allowed).toBe(false);
    }
  });
});

describe("SessionCache", () => {
  const value = { fileId: "f", tone: { skinHex: "#b48868", faceQuality: null, allGood: true }, previews: new Map<string, string>() };
  it("hashes the same bytes the same way and different bytes differently", () => {
    expect(hashBytes(new Uint8Array([1, 2, 3]))).toBe(hashBytes(new Uint8Array([1, 2, 3])));
    expect(hashBytes(new Uint8Array([1, 2, 3]))).not.toBe(hashBytes(new Uint8Array([1, 2, 4])));
  });
  it("returns a stored entry for the same session and photo only", () => {
    const c = new SessionCache();
    c.set("s1", "h1", value);
    expect(c.get("s1", "h1")).toBe(value);
    expect(c.get("s2", "h1")).toBeUndefined();
    expect(c.get("s1", "h2")).toBeUndefined();
  });
  it("forgets entries after the ttl and keeps a bounded size", () => {
    let t = 0;
    const c = new SessionCache(() => t, 1000, 2);
    c.set("a", "1", value);
    t = 2000;
    expect(c.get("a", "1")).toBeUndefined();
    c.set("a", "1", value);
    c.set("a", "2", value);
    c.set("a", "3", value);
    expect(c.get("a", "1")).toBeUndefined();
    expect(c.get("a", "3")).toBe(value);
  });
});
