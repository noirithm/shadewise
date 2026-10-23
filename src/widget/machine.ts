export type ErrorCode =
  | "unsupported_file"
  | "upload_failed"
  | "timeout"
  | "api_error"
  | "rate_limited"
  | "offline"
  | "check_unavailable";

export type WidgetState =
  | { name: "idle" }
  | { name: "consent" }
  | { name: "source" }
  | { name: "capture"; via: "camera" | "upload" }
  | { name: "quality_check" }
  | { name: "analyzing" }
  | { name: "verdict" }
  | { name: "refused"; reasons: string[] }
  | { name: "error"; code: ErrorCode }
  | { name: "budget_exhausted" }
  | { name: "sample" };

export type WidgetEvent =
  | { type: "OPEN" }
  | { type: "CONSENT_GIVEN" }
  | { type: "CONSENT_DECLINED" }
  | { type: "CHOOSE_CAMERA" }
  | { type: "CHOOSE_UPLOAD" }
  | { type: "CAMERA_DENIED" }
  | { type: "PHOTO_READY" }
  | { type: "GATE_PASSED" }
  | { type: "GATE_FAILED"; reasons: string[] }
  | { type: "GATE_UNAVAILABLE" }
  | { type: "ANALYSIS_DONE" }
  | { type: "ANALYSIS_FAILED"; code: ErrorCode }
  | { type: "BUDGET_EXHAUSTED" }
  | { type: "SHOW_SAMPLE" }
  | { type: "RETAKE" }
  | { type: "RESET" }; // "delete my data" or close

export const initialState: WidgetState = { name: "idle" };

export function reduce(state: WidgetState, event: WidgetEvent): WidgetState {
  // RESET works from anywhere, so there are no dead ends.
  if (event.type === "RESET") return initialState;
  if (event.type === "BUDGET_EXHAUSTED") return { name: "budget_exhausted" };

  switch (state.name) {
    case "idle":
      return event.type === "OPEN" ? { name: "consent" } : state;
    case "consent":
      if (event.type === "CONSENT_GIVEN") return { name: "source" };
      if (event.type === "CONSENT_DECLINED") return initialState;
      return state;
    case "source":
      if (event.type === "SHOW_SAMPLE") return { name: "sample" };
      if (event.type === "CHOOSE_CAMERA") return { name: "capture", via: "camera" };
      if (event.type === "CHOOSE_UPLOAD") return { name: "capture", via: "upload" };
      return state;
    case "capture":
      if (event.type === "CAMERA_DENIED") return { name: "capture", via: "upload" };
      if (event.type === "PHOTO_READY") return { name: "quality_check" };
      if (event.type === "RETAKE") return { name: "source" };
      if (event.type === "CHOOSE_UPLOAD") return { name: "capture", via: "upload" };
      if (event.type === "CHOOSE_CAMERA") return { name: "capture", via: "camera" };
      return state;
    case "quality_check":
      if (event.type === "GATE_PASSED") return { name: "analyzing" };
      if (event.type === "GATE_FAILED") return { name: "refused", reasons: event.reasons };
      if (event.type === "GATE_UNAVAILABLE") return { name: "error", code: "check_unavailable" };
      if (event.type === "RETAKE") return { name: "source" };
      return state;
    case "analyzing":
      if (event.type === "ANALYSIS_DONE") return { name: "verdict" };
      if (event.type === "GATE_FAILED") return { name: "refused", reasons: event.reasons };
      if (event.type === "ANALYSIS_FAILED") return { name: "error", code: event.code };
      if (event.type === "RETAKE") return { name: "source" };
      return state;
    case "refused":
    case "error":
    case "verdict":
      return event.type === "RETAKE" ? { name: "source" } : state;
    case "budget_exhausted":
      return event.type === "SHOW_SAMPLE" ? { name: "sample" } : state;
    case "sample":
      return event.type === "RETAKE" ? { name: "source" } : state;
  }
}
