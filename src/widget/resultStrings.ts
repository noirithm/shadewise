import type { Confidence, VerdictLabel } from "../shared/verdict";
import type { Recommendation } from "../shared/compare";

export const R = {
  title: "Your shade result",
  yourSkin: "Your measured skin colour",
  shadeColour: "Shade colour",
  verdict: {
    good_match: "Good match",
    close_match: "Close match",
    poor_match: "Poor match",
    cant_tell: "Can't tell",
  } satisfies Record<VerdictLabel, string>,
  verdictIcon: { good_match: "✓", close_match: "≈", poor_match: "✕", cant_tell: "?" } satisfies Record<VerdictLabel, string>,
  confidence: "Confidence",
  confidenceName: { high: "High", medium: "Medium", low: "Low" } satisfies Record<Confidence, string>,
  difference: (de: string, goodMax: string) => `Colour difference ${de} (lower is closer). Up to ${goodMax} counts as a good match.`,
  why: "Why",
  retakeLead: "Retake your photo to get an answer.",
  cantTellSummary: "can't tell. Please retake your photo.",
  aiPreview: "AI preview",
  previewAlt: (shade: string) => `AI preview of ${shade} on your photo`,
  previewNote: "The preview is illustrative. The verdict comes from the measured colours, not from this image.",
  previewFailed: "The preview couldn't be made this time. The verdict is not affected.",
  previewPaused: "The AI preview is not available right now. The verdict is not affected.",
  showPreview: "Show AI preview",
  previewBusy: "Making the preview...",
  compareTitle: "Compare shades",
  thisProduct: "this product",
  rec: { buy: "Buy", consider: "Consider", skip: "Skip", retake: "Retake needed" } satisfies Record<Recommendation, string>,
  disclaimer: "Cosmetic guidance only, not medical advice. Colours depend on the lighting and camera of your photo.",
} as const;
