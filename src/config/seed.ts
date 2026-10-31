import type { Snapshot } from "../server/metrics";

// ILLUSTRATIVE DEMO DATA. Made up to show the dashboard layout. It is not from real shoppers and must always be labelled as demo data.
export const SEED_LABEL = "Demo data: made up to show the layout. Not from real shoppers.";

export const SEED_SNAPSHOT: Snapshot = {
  since: "demo",
  sessions: 240,
  started: 232,
  paidSessions: 168,
  unitsSpent: 3_652,
  avgUnitsPerPaidSession: 3_652 / 168,
  analyses: 197,
  cachedAnalyses: 29,
  gate: {
    passed: 176,
    refused: 96,
    reasons: { face_size: 31, brightness: 26, yaw: 14, evenness: 11, motion_blur: 9, shadows: 6, framing: 5 },
    sessionsWithRefusal: 64,
    retakeThenSuccess: 41,
    retakeThenSuccessRate: 41 / 64,
  },
  results: {
    total: 160,
    byLabel: { good_match: 61, close_match: 52, poor_match: 29, cant_tell: 18 },
    byConfidence: { high: 70, medium: 55, low: 35 },
    confidentSessions: 118,
    confidentShare: 118 / 232,
  },
  denied: {},
  errors: { timeout: 2, api_error: 1 },
  samplesViewed: 38,
};
