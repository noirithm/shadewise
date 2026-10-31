import type { Confidence, VerdictLabel } from "../shared/verdict";

// Aggregate, image-free counters. Sessions are random ids kept only in memory; no IP address, name or photo is ever stored.
export const GATE_REASONS = [
  "face_count", "face_size", "framing", "yaw", "pitch", "roll", "brightness",
  "bright_spots", "shadows", "evenness", "sharpness", "motion_blur", "colour_cast", "low_score",
] as const;
export type GateReason = (typeof GATE_REASONS)[number];

export type MetricEvent =
  | { type: "gate_passed"; session: string }
  | { type: "gate_refused"; session: string; reasons: GateReason[] }
  | { type: "result"; session: string; label: VerdictLabel; confidence: Confidence }
  | { type: "sample_viewed"; session: string };

export interface AnalysisRecord {
  session: string;
  units: number; // units actually spent by this request, from the spend ledger
  cached: boolean;
  outcome: "ok" | "invalid_upload" | "budget" | "refused" | "error";
  detail?: string; // a budget reason, error code or upload problem: fixed words from the server
}

export interface Snapshot {
  since: string;
  sessions: number; // every session seen
  started: number; // sessions that took a photo that reached the on-device check
  paidSessions: number; // sessions that spent units
  unitsSpent: number;
  avgUnitsPerPaidSession: number | null;
  analyses: number;
  cachedAnalyses: number;
  gate: {
    passed: number;
    refused: number;
    reasons: Record<string, number>;
    sessionsWithRefusal: number;
    retakeThenSuccess: number;
    retakeThenSuccessRate: number | null;
  };
  results: {
    total: number;
    byLabel: Record<string, number>;
    byConfidence: Record<string, number>;
    confidentSessions: number;
    confidentShare: number | null; // sessions with a confident verdict, out of sessions that started
  };
  denied: Record<string, number>;
  errors: Record<string, number>;
  samplesViewed: number;
}

interface SessionState {
  refused: number;
  passedGate: boolean;
  success: boolean; // reached a verdict other than "can't tell"
  retaked: boolean; // success came after at least one refusal
  confident: boolean; // success with high or medium confidence
  units: number;
}

const bump = (m: Record<string, number>, k: string) => {
  m[k] = (m[k] ?? 0) + 1;
};
const ratio = (a: number, b: number) => (b > 0 ? a / b : null);

export class Metrics {
  private sessions = new Map<string, SessionState>();
  private readonly since: string;
  private gatePassed = 0;
  private gateRefused = 0;
  private reasons: Record<string, number> = {};
  private resultsTotal = 0;
  private byLabel: Record<string, number> = {};
  private byConfidence: Record<string, number> = {};
  private analyses = 0;
  private cached = 0;
  private units = 0;
  private denied: Record<string, number> = {};
  private errors: Record<string, number> = {};
  private samples = 0;

  constructor(
    now: () => number = Date.now,
    private maxSessions: number = 5000,
  ) {
    this.since = new Date(now()).toISOString();
  }

  private state(id: string): SessionState {
    let s = this.sessions.get(id);
    if (!s) {
      s = { refused: 0, passedGate: false, success: false, retaked: false, confident: false, units: 0 };
      this.sessions.set(id, s);
      while (this.sessions.size > this.maxSessions) {
        const oldest = this.sessions.keys().next().value;
        if (oldest === undefined) break;
        this.sessions.delete(oldest);
      }
    }
    return s;
  }

  event(e: MetricEvent): void {
    const s = this.state(e.session);
    switch (e.type) {
      case "gate_passed":
        this.gatePassed++;
        s.passedGate = true;
        break;
      case "gate_refused":
        this.gateRefused++;
        s.refused++;
        for (const r of new Set(e.reasons)) bump(this.reasons, r);
        break;
      case "result":
        this.resultsTotal++;
        bump(this.byLabel, e.label);
        bump(this.byConfidence, e.confidence);
        if (e.label !== "cant_tell") {
          if (!s.success && s.refused > 0) s.retaked = true;
          s.success = true;
          if (e.confidence !== "low") s.confident = true;
        }
        break;
      case "sample_viewed":
        this.samples++;
        break;
    }
  }

  analysis(a: AnalysisRecord): void {
    const s = this.state(a.session);
    this.analyses++;
    if (a.cached) this.cached++;
    this.units += a.units;
    s.units += a.units;
    if (a.outcome === "budget") bump(this.denied, a.detail ?? "unknown");
    else if (a.outcome === "error" || a.outcome === "invalid_upload") bump(this.errors, a.detail ?? "unknown");
  }

  snapshot(): Snapshot {
    let started = 0;
    let paid = 0;
    let withRefusal = 0;
    let retake = 0;
    let confident = 0;
    for (const s of this.sessions.values()) {
      if (s.passedGate || s.refused > 0) started++;
      if (s.units > 0) paid++;
      if (s.refused > 0) {
        withRefusal++;
        if (s.retaked) retake++;
      }
      if (s.confident) confident++;
    }
    return {
      since: this.since,
      sessions: this.sessions.size,
      started,
      paidSessions: paid,
      unitsSpent: this.units,
      avgUnitsPerPaidSession: ratio(this.units, paid),
      analyses: this.analyses,
      cachedAnalyses: this.cached,
      gate: {
        passed: this.gatePassed,
        refused: this.gateRefused,
        reasons: { ...this.reasons },
        sessionsWithRefusal: withRefusal,
        retakeThenSuccess: retake,
        retakeThenSuccessRate: ratio(retake, withRefusal),
      },
      results: {
        total: this.resultsTotal,
        byLabel: { ...this.byLabel },
        byConfidence: { ...this.byConfidence },
        confidentSessions: confident,
        confidentShare: ratio(confident, started),
      },
      denied: { ...this.denied },
      errors: { ...this.errors },
      samplesViewed: this.samples,
    };
  }
}
