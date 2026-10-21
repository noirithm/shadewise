import { clearConsent, readConsent, saveConsent } from "./consent";
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
}

const preview = (c: Ctx) => `<img class="preview" src="${c.previewUrl ?? ""}" alt="${S.previewAlt}">`;
const framedNote = (c: Ctx) => (c.autoFramed ? '<p class="note">' + S.autoFramedNote + "</p>" : "");
const dbg = (c: Ctx) => (c.debugText ? `<pre class="debug">${escapeHtml(c.debugText)}</pre>` : "");

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
        btn("camera", S.useCamera, true) + btn("upload", S.uploadPhoto),
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
        S.passedTitle,
        `${preview(ctx)}<p>${S.passedBody}</p>${framedNote(ctx)}${dbg(ctx)}`,
        btn("retake", S.retake, true),
      );
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
    case "budget_exhausted":
      return card(S.budgetTitle, `<p>${S.budgetBody}</p>`, "");
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
  private debugText: string | null = null;
  private autoFramed = false;

  private get debugOn(): boolean {
    return this.hasAttribute("debug") || new URLSearchParams(location.search).has("gate-debug");
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
      this.clearPhoto();
      this.debugText = null;
      this.autoFramed = false;
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
    } else if (SIMPLE_ACTIONS[action]) {
      this.dispatch(SIMPLE_ACTIONS[action]);
    }
  }

  private render(): void {
    this.panel.innerHTML = view(this.state, {
      previewUrl: this.photo?.url ?? null,
      debugText: this.debugText,
      autoFramed: this.autoFramed,
    });
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
    this.panel.querySelector<HTMLElement>("[data-focus]")?.focus();
    if (this.state.name === "quality_check") void this.runGate();
  }
}

if (!customElements.get("shadewise-widget")) {
  customElements.define("shadewise-widget", ShadeWiseWidget);
}
