import { createHash } from "node:crypto";
import type { ToneMeasurement } from "../shared/youcam";

export interface CachedAnalysis {
  fileId: string; // the uploaded file's id at the API; never the image itself
  tone: ToneMeasurement;
  previews: Map<string, string>; // swatch hex (lower case) to preview url
}

export function hashBytes(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

/** Short-lived, in memory, keyed by session and photo hash. Holds no image data. */
export class SessionCache {
  private map = new Map<string, { value: CachedAnalysis; at: number }>();

  constructor(
    private now: () => number = Date.now,
    private ttlMs: number = 20 * 60_000,
    private max: number = 200,
  ) {}

  private k(sessionId: string, hash: string): string {
    return `${sessionId}:${hash}`;
  }

  get(sessionId: string, hash: string): CachedAnalysis | undefined {
    const key = this.k(sessionId, hash);
    const e = this.map.get(key);
    if (!e) return undefined;
    if (this.now() - e.at > this.ttlMs) {
      this.map.delete(key);
      return undefined;
    }
    return e.value;
  }

  set(sessionId: string, hash: string, value: CachedAnalysis): void {
    this.map.set(this.k(sessionId, hash), { value, at: this.now() });
    while (this.map.size > this.max) {
      const oldest = this.map.keys().next().value;
      if (oldest === undefined) break;
      this.map.delete(oldest);
    }
  }
}
