// Structured logs that can never carry an image or a key.
const BLOCKED = /(key|token|authorization|secret|password|image|photo|blob|bytes|buffer|base64|data)/i;

function isBinary(v: unknown): boolean {
  return (
    v instanceof Uint8Array ||
    v instanceof ArrayBuffer ||
    (typeof Blob !== "undefined" && v instanceof Blob)
  );
}

export function safeFields(fields: Record<string, unknown>, secrets: string[] = []): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(fields)) {
    if (BLOCKED.test(k) || isBinary(v)) {
      out[k] = "[redacted]";
    } else if (typeof v === "string") {
      let s = v;
      for (const sec of secrets) if (sec && s.includes(sec)) s = s.split(sec).join("[redacted]");
      out[k] = s.length > 200 ? s.slice(0, 200) + "..." : s;
    } else if (typeof v === "number" || typeof v === "boolean" || v === null) {
      out[k] = v;
    } else {
      out[k] = "[object]";
    }
  }
  return out;
}

export function log(event: string, fields: Record<string, unknown> = {}): void {
  const secrets = [process.env.YOUCAM_API_KEY ?? ""];
  console.log(JSON.stringify({ t: new Date().toISOString(), event, ...safeFields(fields, secrets) }));
}
