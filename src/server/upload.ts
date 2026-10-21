import { CAPTURE } from "../config/capture";
import { sniffImageType, type ImageType } from "../widget/imageCheck";

export const SERVER_LIMITS = { maxBytes: 5 * 1024 * 1024, maxLongSide: 2000 } as const;

export type UploadProblem = "empty" | "too_big" | "unsupported" | "unreadable" | "too_small" | "too_large_dimensions";

export type UploadCheck =
  | { ok: true; type: ImageType; width: number; height: number }
  | { ok: false; problem: UploadProblem };

export function imageSize(b: Uint8Array, type: ImageType): { width: number; height: number } | null {
  if (type === "image/png") {
    if (b.length < 24) return null;
    const isIhdr = b[12] === 0x49 && b[13] === 0x48 && b[14] === 0x44 && b[15] === 0x52;
    if (!isIhdr) return null;
    const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
    return { width: v.getUint32(16), height: v.getUint32(20) };
  }
  let i = 2;
  while (i + 9 <= b.length) {
    if (b[i] !== 0xff) {
      i++;
      continue;
    }
    const m = b[i + 1];
    if (m === 0xff) {
      i++;
      continue;
    }
    if (m === 0xd8 || m === 0x01 || (m >= 0xd0 && m <= 0xd7)) {
      i += 2;
      continue;
    }
    const len = (b[i + 2] << 8) | b[i + 3];
    if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) {
      return { height: (b[i + 5] << 8) | b[i + 6], width: (b[i + 7] << 8) | b[i + 8] };
    }
    if (len < 2) return null;
    i += 2 + len;
  }
  return null;
}

/** Decides by content, never by file name or the client's say-so. */
export function validateUpload(bytes: Uint8Array): UploadCheck {
  if (bytes.length === 0) return { ok: false, problem: "empty" };
  if (bytes.length > SERVER_LIMITS.maxBytes) return { ok: false, problem: "too_big" };
  const type = sniffImageType(bytes);
  if (!type) return { ok: false, problem: "unsupported" };
  const size = imageSize(bytes, type);
  if (!size || size.width < 1 || size.height < 1) return { ok: false, problem: "unreadable" };
  if (Math.min(size.width, size.height) < CAPTURE.minSide) return { ok: false, problem: "too_small" };
  if (Math.max(size.width, size.height) > SERVER_LIMITS.maxLongSide) return { ok: false, problem: "too_large_dimensions" };
  return { ok: true, type, ...size };
}
