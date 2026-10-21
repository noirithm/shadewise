import { z } from "zod";
import { API_LIMITS, TRYON } from "../config/tryon";
import { normalizeSkinTone, normalizeTryOn, type ToneMeasurement } from "../shared/youcam";
import type { ImageType } from "../widget/imageCheck";
import { TIPS } from "../widget/gate/tips";
import { totalBalance } from "./budget";

export type YouCamErrorKind =
  | "rate_limited"
  | "auth"
  | "unavailable"
  | "upload_failed"
  | "photo_rejected" // the API could not use the photo; `tip` says how to fix it
  | "task_failed"
  | "timeout"
  | "bad_response" // the API answered, but not in a shape we recognise
  | "bad_request"; // our own request was refused (a bug on our side)

export interface ErrorOpts {
  /** True when units may have been spent. The API only charges on success; after a timeout we cannot know. */
  maybeCharged?: boolean;
  tip?: string;
  apiCode?: string;
  status?: number;
}

/** Messages are fixed strings: they never contain the key, raw API text or image data. */
export class YouCamError extends Error {
  readonly kind: YouCamErrorKind;
  readonly opts: ErrorOpts;
  constructor(kind: YouCamErrorKind, message: string, opts: ErrorOpts = {}) {
    super(message);
    this.name = "YouCamError";
    this.kind = kind;
    this.opts = opts;
  }
  get maybeCharged(): boolean {
    return this.opts.maybeCharged === true;
  }
  get tip(): string | undefined {
    return this.opts.tip;
  }
}

const rec = (v: unknown): Record<string, unknown> | null =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;

function codeFrom(v: unknown): string | undefined {
  if (typeof v === "string") return v;
  const r = rec(v);
  if (r) for (const k of ["code", "error", "error_code"]) if (typeof r[k] === "string") return r[k] as string;
  return undefined;
}

/** The real error body shape is not verified yet, so look in the likely places. */
export function errorCodeOf(json: unknown): string | undefined {
  const j = rec(json);
  const d = rec(j?.data);
  const raw =
    codeFrom(d?.error) ?? codeFrom(d?.error_code) ?? codeFrom(j?.error) ?? codeFrom(j?.error_code) ?? codeFrom(j?.code);
  if (!raw) return undefined;
  const s = raw.toLowerCase().replace(/[^a-z0-9_]/g, "").slice(0, 60);
  return s || undefined;
}

/** The API's documented face error codes, as shopper-friendly tips. */
export function photoTip(code: string): string | undefined {
  if (/below_min_image_size/.test(code)) return TIPS.smallPhoto;
  if (/face_position_too_small/.test(code)) return TIPS.tooFar;
  if (/out_of_boundary/.test(code)) return TIPS.cropped;
  if (/face_position_invalid/.test(code)) return TIPS.noFace;
  if (/tilt/.test(code)) return TIPS.roll;
  if (/upward|downward/.test(code)) return TIPS.pitch;
  if (/leftward|rightward|not_forward|angle_invalid/.test(code)) return TIPS.yaw;
  return undefined;
}

export interface ClientDeps {
  apiKey: string;
  apiBase: string;
  fetch?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
}

export interface PollOptions {
  timeoutMs?: number;
  firstDelayMs?: number;
  maxDelayMs?: number;
}

const FileRegisterSchema = z.object({
  data: z.object({
    files: z
      .array(
        z.object({
          file_id: z.string().min(1),
          requests: z.array(z.object({ method: z.string().optional(), url: z.string().min(1) })).min(1),
        }),
      )
      .min(1),
  }),
});

const TaskCreatedSchema = z.object({ data: z.object({ task_id: z.string().min(1) }) });

const HEX = /^#[0-9a-fA-F]{6}$/;

export function createYouCamClient(deps: ClientDeps) {
  const f = deps.fetch ?? fetch;
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const now = deps.now ?? Date.now;
  const base = deps.apiBase.replace(/\/$/, "");

  async function call(method: "GET" | "POST", path: string, body?: unknown): Promise<unknown> {
    let res: Response;
    try {
      res = await f(`${base}${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${deps.apiKey}`,
          ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(API_LIMITS.requestTimeoutMs),
      });
    } catch {
      throw new YouCamError("unavailable", "Could not reach the YouCam API");
    }
    let json: unknown = null;
    try {
      json = await res.json();
    } catch {
      json = null;
    }
    const bodyStatus = rec(json)?.status;
    const status = Math.max(res.status, typeof bodyStatus === "number" ? bodyStatus : 0);

    if (status === 429) throw new YouCamError("rate_limited", "The YouCam API rate limit was reached", { status });
    if (status === 401 || status === 403) throw new YouCamError("auth", "The YouCam API rejected our credentials", { status });
    if (status >= 500) throw new YouCamError("unavailable", `The YouCam API is unavailable (HTTP ${status})`, { status });
    if (status >= 400) {
      const code = errorCodeOf(json);
      const tip = code ? photoTip(code) : undefined;
      if (tip) throw new YouCamError("photo_rejected", "The YouCam API could not use this photo", { apiCode: code, tip, status });
      throw new YouCamError("bad_request", `The YouCam API refused the request (HTTP ${status})`, { apiCode: code, status });
    }
    return json;
  }

  async function getBalance(): Promise<number> {
    const json = await call("GET", "/s2s/v1.0/client/credit");
    try {
      return totalBalance(json, now());
    } catch {
      throw new YouCamError("bad_response", "The balance response was not in the expected shape");
    }
  }

  /** Register the file, then upload the bytes to the pre-signed address. Neither step is charged. */
  async function uploadImage(bytes: Uint8Array, type: ImageType): Promise<string> {
    const ext = type === "image/png" ? "png" : "jpg";
    const reg = FileRegisterSchema.safeParse(
      await call("POST", "/s2s/v2.0/file", {
        files: [{ content_type: type, file_name: `photo.${ext}`, file_size: bytes.length }],
      }),
    );
    if (!reg.success) throw new YouCamError("bad_response", "The file registration response was not in the expected shape");
    const file = reg.data.data.files[0];
    const req = file.requests[0];
    let url: URL;
    try {
      url = new URL(req.url);
    } catch {
      throw new YouCamError("bad_response", "The upload address was not valid");
    }
    if (url.protocol !== "https:") throw new YouCamError("bad_response", "The upload address was not secure");

    let res: Response;
    try {
      res = await f(url.toString(), {
        method: req.method ?? "PUT",
        headers: { "Content-Type": type }, // no API key goes to the storage host
        body: bytes as unknown as BodyInit,
        signal: AbortSignal.timeout(API_LIMITS.requestTimeoutMs * 2),
      });
    } catch {
      throw new YouCamError("upload_failed", "The photo could not be uploaded");
    }
    if (!res.ok) throw new YouCamError("upload_failed", `The photo upload was refused (HTTP ${res.status})`, { status: res.status });
    return file.file_id;
  }

  async function createTask(feature: string, body: unknown): Promise<string> {
    const parsed = TaskCreatedSchema.safeParse(await call("POST", `/s2s/v2.0/task/${feature}`, body));
    if (!parsed.success) throw new YouCamError("bad_response", "The task response was not in the expected shape");
    return parsed.data.data.task_id;
  }

  async function poll(feature: string, taskId: string, opts: PollOptions = {}): Promise<unknown> {
    const timeoutMs = opts.timeoutMs ?? API_LIMITS.pollTimeoutMs;
    const maxDelay = opts.maxDelayMs ?? API_LIMITS.pollMaxDelayMs;
    let delay = opts.firstDelayMs ?? API_LIMITS.pollFirstDelayMs;
    const start = now();
    let transient = 0;

    for (;;) {
      await sleep(delay);
      delay = Math.min(Math.round(delay * API_LIMITS.pollBackoff), maxDelay);

      let json: unknown;
      try {
        json = await call("GET", `/s2s/v2.0/task/${feature}/${taskId}`);
        transient = 0;
      } catch (e) {
        if (!(e instanceof YouCamError)) throw e;
        const retryable = e.kind === "unavailable" || e.kind === "rate_limited";
        if (retryable && ++transient < API_LIMITS.maxTransientPollErrors) {
          if (now() - start > timeoutMs) throw new YouCamError("timeout", "The YouCam task did not finish in time", { maybeCharged: true });
          continue;
        }
        // The task exists, so we cannot be sure it was not charged.
        throw new YouCamError(e.kind, e.message, { ...e.opts, maybeCharged: true });
      }

      const status = rec(rec(json)?.data)?.task_status;
      if (status === "success") return json;
      if (status === "error") {
        const code = errorCodeOf(json);
        const tip = code ? photoTip(code) : undefined;
        if (tip) throw new YouCamError("photo_rejected", "The YouCam API could not use this photo", { apiCode: code, tip });
        throw new YouCamError("task_failed", "The YouCam task failed", { apiCode: code }); // failed tasks are not charged
      }
      if (now() - start > timeoutMs) {
        throw new YouCamError("timeout", "The YouCam task did not finish in time", { maybeCharged: true });
      }
    }
  }

  async function analyzeSkinTone(fileId: string, opts?: PollOptions): Promise<ToneMeasurement> {
    const id = await createTask("skin-tone-analysis", { src_file_id: fileId });
    const raw = await poll("skin-tone-analysis", id, opts);
    try {
      return normalizeSkinTone(raw);
    } catch {
      throw new YouCamError("bad_response", "The skin tone result was not in the expected shape", { maybeCharged: true });
    }
  }

  async function tryOn(fileId: string, swatchHex: string, opts?: PollOptions): Promise<{ imageUrl: string }> {
    if (!HEX.test(swatchHex)) throw new YouCamError("bad_request", "The shade colour was not a valid hex colour");
    const id = await createTask("makeup-vto", {
      src_file_id: fileId,
      effects: [
        { category: "skin_smooth", skinSmoothStrength: TRYON.skinSmooth, skinSmoothColorIntensity: TRYON.skinSmooth },
        {
          category: "foundation",
          palettes: [
            {
              color: swatchHex,
              colorIntensity: TRYON.colorIntensity,
              glowIntensity: TRYON.glowIntensity,
              coverageIntensity: TRYON.coverageIntensity,
            },
          ],
        },
      ],
      version: "1.0",
    });
    const raw = await poll("makeup-vto", id, opts);
    try {
      return normalizeTryOn(raw);
    } catch {
      throw new YouCamError("bad_response", "The try-on result was not in the expected shape", { maybeCharged: true });
    }
  }

  return { getBalance, uploadImage, analyzeSkinTone, tryOn };
}

export type YouCamClient = ReturnType<typeof createYouCamClient>;
