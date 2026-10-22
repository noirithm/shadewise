export function parseOrigins(raw: string | undefined): string[] {
  return (raw ?? "")
    .split(",")
    .map((s) => s.trim().replace(/\/$/, ""))
    .filter(Boolean);
}

export interface Cors {
  allowed: boolean;
  headers: Record<string, string>;
}

/** Same-origin and non-browser callers pass. Other sites must be listed exactly: no wildcards. */
export function corsFor(origin: string | null, selfOrigin: string, allowed: string[]): Cors {
  if (!origin) return { allowed: true, headers: {} };
  const o = origin.replace(/\/$/, "");
  if (o === selfOrigin) return { allowed: true, headers: {} };
  if (allowed.includes(o)) {
    return {
      allowed: true,
      headers: {
        "Access-Control-Allow-Origin": o,
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, x-sw-session",
        "Access-Control-Max-Age": "600",
        Vary: "Origin",
      },
    };
  }
  return { allowed: false, headers: {} };
}
