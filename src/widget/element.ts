import { analyzeOnServer, newSessionId, type AnalysisResult, type Preview } from "./api";
import { loadCatalogue, parseIdList, resolveItems, type Item } from "./catalogue";
import { R } from "./resultStrings";
import { buildResultModel, fillResultDom, renderResultHtml, summaryText, type PreviewRef, type ResultModel } from "./resultView";
import { LIMITS } from "../config/limits";
import { assetUrl } from "./assets";
import { clearConsent, readConsent, saveConsent } from "./consent";
import { loadSample, pickPreview, type Sample } from "./sample";
import { analyzePhoto, type GateReport } from "./gate/analyze";
import { fileToJpeg, renderToJpeg, type PreparedPhoto } from "./image";
import { checkFileBasics, isTooSmall } from "./imageCheck";
import { initialState, reduce, type WidgetEvent, type WidgetState } from "./machine";
import { STYLES } from "./styles";
import { ERROR_COPY, REFUSED, S } from "./strings";

const SIMPLE_ACTIONS: Record<string, WidgetEvent> = {
  "consent-no": { type: "CONSENT_DECLINED" },
  camera: { type: "CHOOSE_CAMERA" },
  upload: { type: "CHOOSE_UPLOAD" },
  back: { type: "RETAKE" },
  retake: { type: "RETAKE" },
  close: { type: "RESET" },
};

const HEX = /^#[0-9a-fA-F]{6}$/;
const DEFAULT_SWATCH = "#b88f76";

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function card(title: string, body: string, buttons: string): string {
  return `<section class="card" aria-labelledby="t">
    <h2 id="t" tabindex="-1" data-focus>${title}</h2>
    ${body}
    <div class="row">${buttons}</div>
    <div class="foot">
      <button class="link" type="button" data-action="delete">${S.deleteData}</button>
      <button class="link" type="button" data-action="close">${S.close}</button>
    </div>
  </section>`;
}

const btn = (action: string, label: string, primary = false) =>
  `<button class="btn${primary ? " primary" : ""}" type="button" data-action="${action}">${label}</button>`;

interface Ctx {
  previewUrl: string | null;
  debugText: string | null;
  autoFramed: boolean;
  gateOnly: boolean;
  result: AnalysisResult | null;
  sample: Sample | null;
  sampleState: "loading" | "ready" | "failed";
  productId: string;
  swatch: string;
  model: ResultModel | null;
}

const preview = (c: Ctx) => `<img class="preview" src="${c.previewUrl ?? ""}" alt="${S.previewAlt}">`;
const framedNote = (c: Ctx) => (c.autoFramed ? `<p class="note">${S.autoFramedNote}</p>` : "");
const dbg = (c: Ctx) => (c.debugText ? `<pre class="debug">${escapeHtml(c.debugText)}</pre>` : "");

function resultBody(c: Ctx): string {
  const r = c.result;
  if (!r) return `<p>${S.laterBody}</p>`;
  const shown = r.previews[0]?.status === "ok";
  return (
    `<p>${S.resultMeasured}</p>` +
    `<div class="chiprow"><span class="chip" data-chip role="img" aria-label="${S.resultMeasured}"></span><code data-hex></code></div>` +
    (shown
      ? `<figure class="fig"><img class="preview" data-preview alt="${S.previewAlt2}"><figcaption>${S.aiPreview}</figcaption></figure>`
      : `<p class="note">${S.previewMissing}</p>`) +
    `<p class="note">${S.resultNote}</p>`
  );
}

function sampleBody(c: Ctx): string {
  const badge = `<p><span class="badge">${S.sampleBadge}</span></p>`;
  if (c.sampleState === "loading") return `${badge}<p role="status">${S.sampleLoading}</p>`;
  if (c.sampleState === "failed" || !c.sample) return `${badge}<p>${S.sampleUnavailable}</p>`;
  const p = pickPreview(c.sample, c.productId, c.swatch);
  return (
    badge +
    `<p>${S.sampleBody}</p>` +
    `<p>${S.resultMeasured}</p>` +
    `<div class="chiprow"><span class="chip" data-chip role="img" aria-label="${S.resultMeasured}"></span><code data-hex></code></div>` +
    (p
      ? `<figure class="fig"><img class="preview" data-sample-img alt="${S.previewAlt2}"><figcaption>${S.sampleFigcaption}</figcaption></figure>`
      : `<p class="note">${S.sampleNoPreview}</p>`) +
    `<p class="note">${escapeHtml(c.sample.subject)} Recorded ${escapeHtml(c.sample.recordedAt.slice(0, 10))}.</p>`
  );
}

function view(state: WidgetState, ctx: Ctx): string {
  switch (state.name) {
    case "idle":
      return `<button class="btn primary" type="button" data-action="open" data-focus>${S.openButton}</button>`;
    case "consent":
      return card(
        S.consentTitle,
        `<p>${S.consentIntro}</p><ul>${S.consentPoints.map((p) => `<li>${p}</li>`).join("")}</ul><p class="note">${S.consentDisclaimer}</p>`,
        btn("consent-yes", S.agree, true) + btn("consent-no", S.decline),
      );
    case "source":
      return card(
        S.sourceTitle,
        `<p>${S.sourceHint}</p>`,
        btn("camera", S.useCamera, true) + btn("upload", S.uploadPhoto) + btn("sample", S.viewSample),
      );
    case "capture":
      return state.via === "camera"
        ? card(
            S.cameraTitle,
            `<div class="stage"><video playsinline muted autoplay aria-label="Camera preview"></video></div><p class="note">${S.cameraHint}</p><p id="err" class="err" role="alert"></p>`,
            `<button class="btn primary" type="button" data-action="snap" disabled>${S.takePhoto}</button>` +
              btn("upload", S.uploadInstead) +
              btn("back", S.back),
          )
        : card(
            S.uploadTitle,
            `<p>${S.uploadHint}</p><input id="file" type="file" accept="image/jpeg,image/png" hidden><p id="err" class="err" role="alert"></p>`,
            btn("pick", S.chooseFile, true) + btn("back", S.back),
          );
    case "quality_check":
      return card(
        S.checkingTitle,
        `${preview(ctx)}<p class="note">${S.checkingBody}</p>${dbg(ctx)}`,
        btn("retake", S.retake),
      );
    case "analyzing":
      return card(
        ctx.gateOnly ? S.gateOnlyTitle : S.analyzingTitle,
        `${preview(ctx)}<p role="status">${ctx.gateOnly ? S.gateOnlyBody : S.analyzingBody}</p>${framedNote(ctx)}${dbg(ctx)}`,
        btn("retake", ctx.gateOnly ? S.retake : S.cancelAnalysis, ctx.gateOnly),
      );
    case "verdict":
      return card(S.resultTitle, ctx.model ? renderResultHtml(ctx.model) : resultBody(ctx), btn("retake", S.retake, true));
    case "refused":
      return card(
        REFUSED.title,
        `<p>${REFUSED.intro}</p><ul>${state.reasons.map((r) => `<li>${escapeHtml(r)}</li>`).join("")}</ul>${dbg(ctx)}`,
        btn("retake", REFUSED.action, true),
      );
    case "error": {
      const c = ERROR_COPY[state.code];
      return card(c.title, `<p>${c.message}</p>`, btn("retake", c.action, true));
    }
    case "sample":
      return card(
        S.sampleTitle,
        ctx.model && ctx.sampleState === "ready" ? renderResultHtml(ctx.model) : sampleBody(ctx),
        btn("retake", S.sampleBack, true),
      );
    case "budget_exhausted":
      return card(S.budgetTitle, `<p>${S.budgetBody}</p>`, btn("sample", S.viewSample, true));
    default:
      return card(S.laterTitle, `<p>${S.laterBody}</p>`, "");
  }
}

export class ShadeWiseWidget extends HTMLElement {
  private state: WidgetState = initialState;
  private panel!: HTMLDivElement;
  private live!: HTMLDivElement;
  private firstRender = true;
  private stream: MediaStream | null = null;
  private photo: { blob: Blob; url: string } | null = null; // memory only, never persisted
  private gateRun = 0;
  private analysisRun = 0;
  private analysisAbort: AbortController | null = null;
  private debugText: string | null = null;
  private autoFramed = false;
  private result: AnalysisResult | null = null;
  private model: ResultModel | null = null;
  private items: Item[] = [];
  private itemsPromise: Promise<Item[]> | null = null;
  private validity = 0; // capture-quality score of the current photo; 0 until the gate has scored it
  private livePreviews: Record<string, PreviewRef> = {};
  private previewBusy = new Set<string>();
  private skipFocus = false;
  private session = newSessionId();
  private sample: Sample | null = null;
  private sampleState: "loading" | "ready" | "failed" = "loading";
  private sampleTried = false;

  private get debugOn(): boolean {
    return this.hasAttribute("debug") || new URLSearchParams(location.search).has("gate-debug");
  }
  private get gateOnly(): boolean {
    return this.hasAttribute("gate-only");
  }
  private get productId(): string {
    const v = this.getAttribute("product-id") ?? "";
    return /^[A-Za-z0-9_-]{1,40}$/.test(v) ? v : "demo";
  }
  private get swatch(): string {
    const v = this.getAttribute("swatch") ?? "";
    return HEX.test(v) ? v : DEFAULT_SWATCH;
  }

  connectedCallback(): void {
    if (this.shadowRoot) return;
    const root = this.attachShadow({ mode: "open" });
    root.innerHTML = `<style>${STYLES}</style><div class="live" aria-live="polite"></div><div class="panel"></div>`;
    this.live = root.querySelector(".live") as HTMLDivElement;
    this.panel = root.querySelector(".panel") as HTMLDivElement;
    this.panel.addEventListener("click", (e) => this.onClick(e));
    this.panel.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && this.state.name !== "idle") this.dispatch({ type: "RESET" });
    });
    this.panel.addEventListener("change", (e) => {
      const input = e.target as HTMLInputElement;
      if (input.id === "file" && input.files?.[0]) void this.onFile(input.files[0], input);
    });
    this.render();
  }

  disconnectedCallback(): void {
    this.gateRun++;
    this.analysisRun++;
    this.analysisAbort?.abort();
    this.stopCamera();
    this.clearPhoto();
  }

  /** For the demo test page only: shows a non-result state so copy and layout can be reviewed. */
  previewState(state: WidgetState): void {
    if (state.name === "verdict") return; // results are never faked
    this.state = state;
    this.render();
  }

  private dispatch(event: WidgetEvent): void {
    if (event.type === "RETAKE" || event.type === "RESET") {
      this.gateRun++; // drop any check still running
      this.analysisRun++;
      this.analysisAbort?.abort();
      this.clearPhoto();
      this.debugText = null;
      this.autoFramed = false;
      this.result = null;
      this.model = null;
      this.livePreviews = {};
      this.previewBusy.clear();
      this.validity = 0;
    }
    this.state = reduce(this.state, event);
    this.render();
  }

  private announce(text: string): void {
    this.live.textContent = "";
    setTimeout(() => {
      this.live.textContent = text;
    }, 50);
  }

  private setError(msg: string): void {
    const el = this.panel.querySelector<HTMLElement>("#err");
    if (el) el.textContent = msg;
  }

  private setPhoto(p: PreparedPhoto): void {
    this.clearPhoto();
    this.photo = { blob: p.blob, url: URL.createObjectURL(p.blob) };
  }

  private replacePhoto(blob: Blob): void {
    this.clearPhoto();
    this.photo = { blob, url: URL.createObjectURL(blob) };
  }

  private clearPhoto(): void {
    if (this.photo) URL.revokeObjectURL(this.photo.url);
    this.photo = null;
  }

  private stopCamera(): void {
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
  }

  private async startCamera(): Promise<void> {
    this.stopCamera();
    const video = this.panel.querySelector<HTMLVideoElement>("video");
    if (!video) return;
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error("camera unsupported");
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 1280 } },
        audio: false,
      });
      const stillWanted =
        video.isConnected && this.state.name === "capture" && this.state.via === "camera";
      if (!stillWanted) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      this.stream = stream;
      video.muted = true;
      video.srcObject = stream;
      await video.play();
      this.panel.querySelector('[data-action="snap"]')?.removeAttribute("disabled");
    } catch {
      this.stopCamera();
      if (this.state.name === "capture" && this.state.via === "camera") {
        this.dispatch({ type: "CAMERA_DENIED" });
        this.setError(S.cameraDenied);
      }
    }
  }

  private async snap(): Promise<void> {
    const video = this.panel.querySelector<HTMLVideoElement>("video");
    if (!video || !video.videoWidth) return;
    try {
      const photo = await renderToJpeg(video, video.videoWidth, video.videoHeight);
      this.setPhoto(photo);
      this.dispatch({ type: "PHOTO_READY" });
    } catch {
      this.setError(S.errRead);
    }
  }

  private async onFile(file: File, input: HTMLInputElement): Promise<void> {
    this.setError("");
    try {
      const head = new Uint8Array(await file.slice(0, 12).arrayBuffer());
      const problem = checkFileBasics(file.size, head);
      if (problem === "unsupported") return this.setError(S.errUnsupported);
      if (problem === "too_big") return this.setError(S.errTooBig);
      const photo = await fileToJpeg(file);
      if (isTooSmall(photo.srcWidth, photo.srcHeight)) return this.setError(S.errTooSmall);
      this.setPhoto(photo);
      this.dispatch({ type: "PHOTO_READY" });
    } catch {
      this.setError(S.errRead);
    } finally {
      input.value = ""; // lets the same file be chosen again
    }
  }

  /** The free on-device gate. Nothing is sent anywhere. */
  private async runGate(): Promise<void> {
    const photo = this.photo;
    if (!photo) return;
    const run = ++this.gateRun;
    const stale = () => run !== this.gateRun || this.state.name !== "quality_check";
    try {
      const report = await analyzePhoto(photo.blob);
      if (stale()) return;
      if (report.photo) this.replacePhoto(report.photo);
      this.autoFramed = !!report.autoFramed;
      this.debugText = this.debugOn ? JSON.stringify(report.debug, null, 2) : null;
      this.emitDebug(report);
      this.validity = report.result.score;
      if (report.result.passed) this.track("gate_passed");
      else {
        const failed = report.result.checks.filter((c) => c.status === "fail").map((c) => c.id);
        this.track("gate_refused", { reasons: failed.length ? failed : ["low_score"] });
      }
      if (report.result.passed) {
        this.dispatch({ type: "GATE_PASSED" });
      } else {
        const reasons = report.result.tips.length ? [...report.result.tips] : [S.gateFallbackTip];
        this.dispatch({ type: "GATE_FAILED", reasons });
      }
    } catch {
      if (stale()) return;
      this.dispatch({ type: "GATE_UNAVAILABLE" });
    }
  }

  /** The paid step. Only reached after the free gate passes. */
  private async runAnalysis(): Promise<void> {
    const photo = this.photo;
    if (!photo || this.gateOnly) return; // gate-only pages (the fairness recorder) never call the API
    const run = ++this.analysisRun;
    this.analysisAbort?.abort();
    const ctl = new AbortController();
    this.analysisAbort = ctl;
    const timer = setTimeout(() => ctl.abort(new DOMException("timeout", "TimeoutError")), LIMITS.clientTimeoutMs);
    const stale = () => run !== this.analysisRun || this.state.name !== "analyzing";
    this.announce(S.analyzingAnnounce);
    try {
      const items = await this.ensureItems();
      if (stale()) return;
      const out = await analyzeOnServer(photo.blob, this.session, [{ id: items[0].id, hex: items[0].hex }], ctl.signal);
      if (stale()) return;
      if (out.kind === "ok") {
        this.result = out.result;
        this.livePreviews = {};
        this.mergePreviews(out.result.previews);
        this.buildModel();
        this.dispatch({ type: "ANALYSIS_DONE" });
        if (this.model) this.announce(summaryText(this.model));
        if (this.model) {
          this.track("result", { label: this.model.primary.verdict.label, confidence: this.model.primary.verdict.confidence });
        }
      } else if (out.kind === "refused") {
        this.dispatch({ type: "GATE_FAILED", reasons: out.tips.length ? out.tips : [S.gateFallbackTip] });
      } else if (out.kind === "budget") {
        this.dispatch({ type: "BUDGET_EXHAUSTED" });
      } else {
        this.dispatch({ type: "ANALYSIS_FAILED", code: out.code });
      }
    } catch {
      if (stale()) return;
      const timedOut = ctl.signal.reason instanceof DOMException && ctl.signal.reason.name === "TimeoutError";
      this.dispatch({ type: "ANALYSIS_FAILED", code: timedOut ? "timeout" : "api_error" });
    } finally {
      clearTimeout(timer);
      if (this.analysisAbort === ctl) this.analysisAbort = null;
    }
  }

  /** Debug mode only: numbers and verdict, never any image data. Used by the fairness recorder. */
  private emitDebug(report: GateReport): void {
    if (!this.debugOn) return;
    const r = report.result;
    this.dispatchEvent(
      new CustomEvent("shadewise:gate", {
        bubbles: true,
        composed: true,
        detail: {
          passed: r.passed,
          score: r.score,
          confidence: r.confidence,
          failed: r.checks.filter((c) => c.status === "fail").map((c) => c.id),
          warned: r.checks.filter((c) => c.status === "warn").map((c) => c.id),
          autoFramed: !!report.autoFramed,
          numbers: report.debug,
        },
      }),
    );
  }

  private onClick(e: Event): void {
    const target = (e.target as HTMLElement).closest<HTMLElement>("[data-action]");
    if (!target) return;
    const action = target.dataset.action as string;

    if (action === "open") {
      this.dispatch({ type: "OPEN" });
      if (readConsent()) this.dispatch({ type: "CONSENT_GIVEN" });
    } else if (action === "consent-yes") {
      saveConsent();
      this.dispatch({ type: "CONSENT_GIVEN" });
    } else if (action === "delete") {
      clearConsent();
      this.dispatch({ type: "RESET" });
      this.announce(S.deleted);
    } else if (action === "pick") {
      this.panel.querySelector<HTMLInputElement>("#file")?.click();
    } else if (action === "snap") {
      void this.snap();
    } else if (action === "preview") {
      void this.requestPreview(target.dataset.itemId ?? "");
    } else if (action === "sample") {
      this.dispatch({ type: "SHOW_SAMPLE" });
    } else if (SIMPLE_ACTIONS[action]) {
      this.dispatch(SIMPLE_ACTIONS[action]);
    }
  }

  /** Anonymous counting for the merchant dashboard. Test pages never count, and counting can never break the widget. */
  private track(type: string, extra: Record<string, unknown> = {}): void {
    if (this.gateOnly || this.debugOn) return;
    try {
      void fetch(assetUrl("api/events"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, session: this.session, ...extra }),
        keepalive: true,
        credentials: "omit",
      }).catch(() => {});
    } catch {
      /* ignore */
    }
  }

  /** The page's own shade first, then up to two to compare. Loaded once; always returns at least one. */
  private ensureItems(): Promise<Item[]> {
    if (!this.itemsPromise) {
      this.itemsPromise = (async () => {
        const src = this.getAttribute("catalogue-src");
        const catalogue = src ? await loadCatalogue(src, assetUrl("")) : null;
        this.items = resolveItems(catalogue, this.productId, this.getAttribute("swatch"), parseIdList(this.getAttribute("compare")));
        return this.items;
      })();
    }
    return this.itemsPromise;
  }

  private mergePreviews(list: Preview[]): void {
    for (const p of list) {
      this.livePreviews[p.id] =
        p.status === "ok" && p.imageUrl ? { status: "ok", url: p.imageUrl } : { status: p.status === "skipped" ? "skipped" : "failed" };
    }
  }

  private buildModel(): void {
    if (!this.result) {
      this.model = null;
      return;
    }
    this.model = buildResultModel({
      source: "live",
      skinHex: this.result.skinHex,
      qualityConfirmed: this.result.allGood,
      validity: this.validity,
      items: this.items,
      previews: this.livePreviews,
      busy: [...this.previewBusy],
    });
  }

  private buildSampleModel(s: Sample): void {
    const previews: Record<string, PreviewRef> = {};
    for (const it of this.items) {
      const p = pickPreview(s, it.id, it.hex);
      // only a preview rendered with this exact shade colour may be shown for it
      previews[it.id] =
        p && p.hex.toLowerCase() === it.hex.toLowerCase() ? { status: "ok", url: assetUrl("samples/" + p.file) } : { status: "none" };
    }
    this.model = buildResultModel({
      source: "sample",
      skinHex: s.skinHex,
      qualityConfirmed: s.allGood,
      validity: 1,
      items: this.items,
      previews,
      busy: [],
    });
  }

  /** Re-draw the result without moving the shopper's focus back to the top. */
  private refreshResult(focusId: string): void {
    this.buildModel();
    this.skipFocus = true;
    this.render();
    [...this.panel.querySelectorAll<HTMLElement>("[data-preview-btn]")].find((el) => el.dataset.previewBtn === focusId)?.focus();
  }

  /** One more shade's AI preview, on the photo already in memory. The server caches the measurement. */
  private async requestPreview(id: string): Promise<void> {
    const photo = this.photo;
    const it = this.items.find((i) => i.id === id);
    if (!photo || !it || this.previewBusy.has(id) || this.state.name !== "verdict") return;
    const run = this.analysisRun;
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), LIMITS.clientTimeoutMs);
    this.previewBusy.add(id);
    this.refreshResult(id);
    try {
      const out = await analyzeOnServer(photo.blob, this.session, [{ id: it.id, hex: it.hex }], ctl.signal);
      if (run !== this.analysisRun) return;
      if (out.kind === "ok") this.mergePreviews(out.result.previews);
      else this.livePreviews[id] = { status: out.kind === "budget" ? "skipped" : "failed" };
    } catch {
      if (run !== this.analysisRun) return;
      this.livePreviews[id] = { status: "failed" };
    } finally {
      clearTimeout(timer);
      this.previewBusy.delete(id);
    }
    if (run !== this.analysisRun || this.state.name !== "verdict") return;
    this.refreshResult(id);
    this.announce(this.livePreviews[id]?.status === "ok" ? `${it.shade}: ${R.aiPreview} ready.` : `${it.shade}: ${R.previewFailed}`);
  }

  /** Values from the server go in through the DOM, never into HTML strings. */
  private fillResult(): void {
    if (this.state.name !== "verdict" || !this.result) return;
    const r = this.result;
    const chip = this.panel.querySelector<HTMLElement>("[data-chip]");
    if (chip) chip.style.background = r.skinHex;
    const code = this.panel.querySelector<HTMLElement>("[data-hex]");
    if (code) code.textContent = r.skinHex;
    const img = this.panel.querySelector<HTMLImageElement>("[data-preview]");
    const p = r.previews[0];
    if (img && p?.status === "ok" && p.imageUrl) img.src = p.imageUrl;
  }

  private async ensureSample(): Promise<void> {
    if (this.sample || this.sampleTried) return;
    this.sampleTried = true;
    this.sampleState = "loading";
    const s = await loadSample();
    this.sample = s;
    this.sampleState = s ? "ready" : "failed";
    if (s) {
      await this.ensureItems();
      this.buildSampleModel(s);
      this.track("sample_viewed");
    }
    if (this.state.name === "sample") this.render();
  }

  /** Values from the recorded file go in through the DOM, never into HTML strings. */
  private fillSample(): void {
    if (this.state.name !== "sample" || !this.sample) return;
    const s = this.sample;
    const chip = this.panel.querySelector<HTMLElement>("[data-chip]");
    if (chip) chip.style.background = s.skinHex;
    const code = this.panel.querySelector<HTMLElement>("[data-hex]");
    if (code) code.textContent = s.skinHex;
    const img = this.panel.querySelector<HTMLImageElement>("[data-sample-img]");
    const p = pickPreview(s, this.productId, this.swatch);
    if (img && p) img.src = assetUrl("samples/" + p.file);
  }

  private render(): void {
    this.panel.innerHTML = view(this.state, {
      previewUrl: this.photo?.url ?? null,
      debugText: this.debugText,
      autoFramed: this.autoFramed,
      gateOnly: this.gateOnly,
      result: this.result,
      sample: this.sample,
      sampleState: this.sampleState,
      productId: this.productId,
      swatch: this.swatch,
      model: this.model,
    });
    this.fillResult();
    this.fillSample();
    if (this.model && (this.state.name === "verdict" || this.state.name === "sample")) fillResultDom(this.panel);
    if (this.state.name === "capture" && this.state.via === "camera") {
      void this.startCamera();
    } else {
      this.stopCamera();
    }
    if (this.firstRender) {
      this.firstRender = false;
      return;
    }
    // Moving focus to the new screen's heading is what announces the change to screen readers.
    if (this.skipFocus) this.skipFocus = false;
    else this.panel.querySelector<HTMLElement>("[data-focus]")?.focus();
    if (this.state.name === "quality_check") void this.runGate();
    if (this.state.name === "analyzing") void this.runAnalysis();
    if (this.state.name === "sample") void this.ensureSample();
  }
}

if (!customElements.get("shadewise-widget")) {
  customElements.define("shadewise-widget", ShadeWiseWidget);
}
