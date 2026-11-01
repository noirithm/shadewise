import { describe, expect, it } from "vitest";
import { CSP, securityHeaders } from "@/config/security";

const prod = { NODE_ENV: "production" } as Record<string, string | undefined>;
const get = (h: { key: string; value: string }[], k: string) => h.find((x) => x.key === k)?.value;

describe("securityHeaders", () => {
  it("sends nothing in development, where the dev server needs looser rules", () => {
    expect(securityHeaders({ NODE_ENV: "development" })).toEqual([]);
    expect(securityHeaders({})).toEqual([]);
  });
  it("sends the full set in production", () => {
    const keys = securityHeaders(prod).map((h) => h.key);
    for (const k of ["Content-Security-Policy", "X-Content-Type-Options", "Referrer-Policy", "Permissions-Policy", "X-Frame-Options", "Strict-Transport-Security"]) {
      expect(keys).toContain(k);
    }
  });
  it("can switch the content policy to report-only without removing it", () => {
    const h = securityHeaders({ ...prod, CSP_REPORT_ONLY: "1" });
    expect(h.map((x) => x.key)).toContain("Content-Security-Policy-Report-Only");
    expect(h.map((x) => x.key)).not.toContain("Content-Security-Policy");
  });
  it("allows the camera for our own pages only, and nothing else the page does not need", () => {
    const pp = get(securityHeaders(prod), "Permissions-Policy") as string;
    expect(pp).toContain("camera=(self)");
    expect(pp).toContain("microphone=()");
    expect(pp).toContain("geolocation=()");
  });
});

describe("content security policy", () => {
  const directive = (name: string) => CSP.split("; ").find((d) => d.startsWith(name + " ")) ?? "";
  it("starts from 'self' and forbids plugins, base tags and framing by other sites", () => {
    expect(directive("default-src")).toBe("default-src 'self'");
    expect(directive("object-src")).toBe("object-src 'none'");
    expect(directive("base-uri")).toBe("base-uri 'self'");
    expect(directive("frame-ancestors")).toBe("frame-ancestors 'self'");
  });
  it("lets the page talk only to itself, so a photo cannot be sent to another site by injected script", () => {
    expect(directive("connect-src")).toBe("connect-src 'self'");
  });
  it("loads scripts only from our own site, with no wildcard or remote hosts", () => {
    const s = directive("script-src");
    expect(s).toContain("'self'");
    expect(s).not.toMatch(/\*|https?:/);
  });
  it("keeps the two script exceptions the face engine and Next.js need, and documents why", () => {
    const s = directive("script-src");
    expect(s).toContain("'wasm-unsafe-eval'");
    expect(s).toContain("'unsafe-eval'"); // required by the on-device face engine; found by running it in a real browser
    expect(s).toContain("'unsafe-inline'");
  });
  it("allows the shopper's own photo (blob) and https preview images, nothing broader for media", () => {
    expect(directive("img-src")).toContain("blob:");
    expect(directive("media-src")).toBe("media-src 'self' blob:");
  });
});
