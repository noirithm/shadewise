import { z } from "zod";
import { CAPS, MAX_UNITS_PER_SESSION } from "../config/caps";

// Shape of GET /s2s/v1.0/client/credit (verified by call): a list of unit pots with expiry.
export const CreditSchema = z.object({
  results: z.array(z.object({ amount: z.number(), expiry: z.number().optional() })),
});

export function totalBalance(raw: unknown, nowMs: number = Date.now()): number {
  const p = CreditSchema.parse(raw);
  return p.results.filter((r) => r.expiry === undefined || r.expiry > nowMs).reduce((s, r) => s + r.amount, 0);
}

export type DenyReason = "balance_unknown" | "reserve" | "session_cap" | "daily_cap";
export type Decision = { allow: true } | { allow: false; reason: DenyReason };

export interface SpendRequest {
  cost: number;
  balance: number | null; // from the real balance call; null means we could not read it
  sessionSpent: number;
  dailySpent: number;
}

/** Fails closed: if we cannot read the balance, we do not spend. */
export function decideSpend(r: SpendRequest): Decision {
  if (r.balance === null || !Number.isFinite(r.balance)) return { allow: false, reason: "balance_unknown" };
  if (r.balance - r.cost < CAPS.reserveUnits) return { allow: false, reason: "reserve" };
  if (r.sessionSpent + r.cost > MAX_UNITS_PER_SESSION) return { allow: false, reason: "session_cap" };
  if (r.dailySpent + r.cost > CAPS.dailyUnits) return { allow: false, reason: "daily_cap" };
  return { allow: true };
}

/** Best-effort counters in memory. The real balance check above is the hard guard. */
export class Ledger {
  private day = "";
  private daily = 0;
  private sessions = new Map<string, { spent: number; at: number }>();

  constructor(
    private now: () => number = Date.now,
    private ttlMs: number = 30 * 60 * 1000,
  ) {}

  private roll(): void {
    const d = new Date(this.now()).toISOString().slice(0, 10);
    if (d !== this.day) {
      this.day = d;
      this.daily = 0;
    }
    const cutoff = this.now() - this.ttlMs;
    for (const [k, v] of this.sessions) if (v.at < cutoff) this.sessions.delete(k);
  }

  state(sessionId: string): { dailySpent: number; sessionSpent: number } {
    this.roll();
    return { dailySpent: this.daily, sessionSpent: this.sessions.get(sessionId)?.spent ?? 0 };
  }

  /** Reserve before a paid call, refund if it fails: units are only charged on success. */
  record(sessionId: string, units: number): void {
    this.roll();
    this.daily += units;
    const s = this.sessions.get(sessionId) ?? { spent: 0, at: 0 };
    s.spent += units;
    s.at = this.now();
    this.sessions.set(sessionId, s);
  }

  refund(sessionId: string, units: number): void {
    this.roll();
    this.daily = Math.max(0, this.daily - units);
    const s = this.sessions.get(sessionId);
    if (s) s.spent = Math.max(0, s.spent - units);
  }
}
