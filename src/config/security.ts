// Security headers for the live site. Applied only in production, because the development server needs looser rules.
//
// Set CSP_REPORT_ONLY=1 and redeploy to make the content policy report violations in the browser console
// instead of blocking them (a safety valve if a policy ever blocks something it should not).
export const CSP = [
  "default-src 'self'",
  // 'unsafe-inline' is needed for Next.js's own inline scripts. The on-device face engine (MediaPipe) loads its WebAssembly through
  // eval, so it needs 'unsafe-eval' and 'wasm-unsafe-eval'. Found by loading the real engine in a browser under a stricter policy.
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' 'wasm-unsafe-eval'",
  "style-src 'self' 'unsafe-inline'", // the widget's own styles live in a style tag inside its shadow tree
  "img-src 'self' data: blob: https:", // blob: for the shopper's own photo; https: for AI previews from the YouCam storage host
  "font-src 'self' data:",
  "connect-src 'self'", // our own pages only: the widget, face model files and our server API
  "media-src 'self' blob:",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'self'",
].join("; ");

export interface Header {
  key: string;
  value: string;
}

export function securityHeaders(env: Record<string, string | undefined> = process.env): Header[] {
  if (env.NODE_ENV !== "production") return [];
  return [
    { key: env.CSP_REPORT_ONLY === "1" ? "Content-Security-Policy-Report-Only" : "Content-Security-Policy", value: CSP },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    // the camera is allowed for our own pages only; nothing else the page does not need
    { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=(), payment=(), usb=()" },
    { key: "X-Frame-Options", value: "SAMEORIGIN" },
    { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  ];
}
