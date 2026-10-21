import { describe, expect, it } from "vitest";
import { loadServerConfig } from "@/server/config";
import { safeFields } from "@/server/log";

describe("loadServerConfig", () => {
  it("loads a valid config and trims the base url", () => {
    const c = loadServerConfig({ YOUCAM_API_KEY: "abcdefghijklmnop", YOUCAM_API_BASE: "https://x.example/", ALLOWED_ORIGINS: "https://a.com, https://b.com" });
    expect(c.apiBase).toBe("https://x.example");
    expect(c.allowedOrigins).toEqual(["https://a.com", "https://b.com"]);
  });
  it("uses the verified default base url", () => {
    expect(loadServerConfig({ YOUCAM_API_KEY: "abcdefghijklmnop" }).apiBase).toBe("https://yce-api-01.makeupar.com");
  });
  it("names the bad variable but never echoes its value", () => {
    expect(() => loadServerConfig({ YOUCAM_API_KEY: "shrtkey1" })).toThrow(/YOUCAM_API_KEY/);
    try {
      loadServerConfig({ YOUCAM_API_KEY: "shrtkey1" });
    } catch (e) {
      expect(String(e)).not.toContain("shrtkey1");
    }
    expect(() => loadServerConfig({})).toThrow(/YOUCAM_API_KEY/);
  });
});

describe("safeFields (logs never carry images or keys)", () => {
  it("redacts sensitive field names and binary values", () => {
    const out = safeFields({ apiKey: "sk-123", photo: new Uint8Array(5), image: "data", status: 200, route: "/api/analyze" });
    expect(out.apiKey).toBe("[redacted]");
    expect(out.photo).toBe("[redacted]");
    expect(out.image).toBe("[redacted]");
    expect(out.status).toBe(200);
    expect(out.route).toBe("/api/analyze");
  });
  it("removes a secret that appears inside another string", () => {
    const out = safeFields({ message: "request to host failed with Bearer SECRETVALUE123" }, ["SECRETVALUE123"]);
    expect(String(out.message)).not.toContain("SECRETVALUE123");
  });
  it("truncates long strings and never throws on odd values", () => {
    const out = safeFields({ note: "x".repeat(500), weird: { a: 1 }, nothing: undefined });
    expect(String(out.note).length).toBeLessThan(210);
    expect(out.weird).toBe("[object]");
  });
});
