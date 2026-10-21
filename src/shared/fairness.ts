export const TONES = ["light", "medium", "deep"] as const;
export type Tone = (typeof TONES)[number];
export type Intent = "good" | "bad";

export const MIN_N = 5; // fewer photos than this per group is not enough to judge
export const MAX_GAP = 0.15; // largest acceptable difference between tone groups

export interface FairnessRecord {
  tone: string;
  lighting: string;
  device: string;
  intent: Intent;
  fault: string;
  passed: boolean;
  score: number;
  failed: string[];
  warned: string[];
}

export interface Row {
  tone: Tone;
  intent: Intent;
  n: number;
  passed: number;
}

export interface Summary {
  rows: Row[];
  reasons: Record<Tone, Record<string, number>>; // why good photos were refused, by tone
  flags: string[];
  excluded: number; // records without a usable tone group
}

/** Good photos: share refused (false refusal). Bad photos: share wrongly passed. */
export function errorRate(row: Row): number | null {
  if (row.n === 0) return null;
  return row.intent === "good" ? 1 - row.passed / row.n : row.passed / row.n;
}

export function summarize(records: FairnessRecord[]): Summary {
  const rows: Row[] = [];
  const reasons = Object.fromEntries(TONES.map((t) => [t, {}])) as Record<Tone, Record<string, number>>;
  let excluded = 0;
  for (const tone of TONES) {
    for (const intent of ["good", "bad"] as const) {
      rows.push({ tone, intent, n: 0, passed: 0 });
    }
  }
  for (const r of records) {
    if (!(TONES as readonly string[]).includes(r.tone)) {
      excluded++;
      continue;
    }
    const row = rows.find((x) => x.tone === r.tone && x.intent === r.intent);
    if (!row) continue;
    row.n++;
    if (r.passed) row.passed++;
    if (r.intent === "good" && !r.passed) {
      for (const id of r.failed) reasons[row.tone][id] = (reasons[row.tone][id] ?? 0) + 1;
    }
  }

  const flags: string[] = [];
  for (const intent of ["good", "bad"] as const) {
    const ofIntent = rows.filter((r) => r.intent === intent);
    for (const r of ofIntent) {
      if (r.n < MIN_N) flags.push(`Not enough ${intent} photos for ${r.tone} skin (${r.n} of ${MIN_N} needed).`);
    }
    const eligible = ofIntent.filter((r) => r.n >= MIN_N);
    if (eligible.length >= 2) {
      const rated = eligible.map((r) => ({ r, rate: errorRate(r) as number })).sort((a, b) => a.rate - b.rate);
      const lo = rated[0];
      const hi = rated[rated.length - 1];
      if (hi.rate - lo.rate > MAX_GAP) {
        const what = intent === "good" ? "good photos are refused" : "bad photos are wrongly passed";
        flags.push(
          `Disparity: ${what} ${Math.round((hi.rate - lo.rate) * 100)} points more often for ${hi.r.tone} skin than for ${lo.r.tone} skin.`,
        );
      }
    }
  }
  return { rows, reasons, flags, excluded };
}

export function parseCsv(text: string): FairnessRecord[] {
  const lines = text.trim().split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return [];
  const header = lines[0].split(",");
  const out: FairnessRecord[] = [];
  for (const line of lines.slice(1)) {
    const cells = line.split(",");
    const get = (k: string) => cells[header.indexOf(k)] ?? "";
    const intent = get("intent");
    if (intent !== "good" && intent !== "bad") continue;
    out.push({
      tone: get("tone"),
      lighting: get("lighting"),
      device: get("device"),
      intent,
      fault: get("fault"),
      passed: get("passed") === "true",
      score: Number(get("score")),
      failed: get("failed").split("|").filter(Boolean),
      warned: get("warned").split("|").filter(Boolean),
    });
  }
  return out;
}
