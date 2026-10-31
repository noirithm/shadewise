"use client";

import { useEffect, useState } from "react";
import { SEED_LABEL, SEED_SNAPSHOT } from "@/config/seed";
import type { Snapshot } from "@/server/metrics";

interface Payload {
  live: Snapshot;
  balance: number | null;
  caps: { reserveUnits: number; dailyUnits: number; perSessionUnits: number };
}

const LABELS: Record<string, string> = { good_match: "Good match", close_match: "Close match", poor_match: "Poor match", cant_tell: "Can't tell, retake" };
const CONF: Record<string, string> = { high: "High", medium: "Medium", low: "Low" };
const REASONS: Record<string, string> = {
  face_count: "No face, or more than one face",
  face_size: "Face too small",
  framing: "Face cut off by the edge",
  yaw: "Head turned sideways",
  pitch: "Camera tilted up or down",
  roll: "Head tilted",
  brightness: "Too dark",
  bright_spots: "Bright spots or glare",
  shadows: "Shadows on the face",
  evenness: "Light from one side only",
  sharpness: "Out of focus",
  motion_blur: "Blurred by movement",
  colour_cast: "Coloured light",
  low_score: "Several small problems added up",
};
const WORDS: Record<string, string> = {
  reserve: "Kept in reserve",
  balance_unknown: "Balance unreadable",
  session_cap: "Session limit",
  daily_cap: "Daily limit",
  timeout: "Timed out",
  api_error: "Service error",
  rate_limited: "Rate limited",
  upload_failed: "Upload failed",
  unsupported_file: "Unsupported file",
};

const pct = (x: number | null) => (x === null ? "no data yet" : `${Math.round(x * 100)}%`);
const num = (x: number | null, d = 1) => (x === null ? "no data yet" : x.toFixed(d));
const entries = (m: Record<string, number>) => Object.entries(m).sort((a, b) => b[1] - a[1]);

function Table({ caption, head, rows }: { caption: string; head: [string, string, string?]; rows: (string | number)[][] }) {
  return (
    <div className="scroll" role="region" aria-label={caption} tabIndex={0}>
      <table>
        <caption className="small" style={{ textAlign: "left", paddingBottom: ".25rem" }}>
          {caption}
        </caption>
        <thead>
          <tr>
            {head.filter(Boolean).map((h) => (
              <th key={h} scope="col">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={head.filter(Boolean).length}>Nothing recorded yet.</td>
            </tr>
          ) : (
            rows.map((r) => (
              <tr key={String(r[0])}>
                {r.map((c, i) => (i === 0 ? <th key={i} scope="row">{c}</th> : <td key={i}>{c}</td>))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

function Block({ s, unitPrice }: { s: Snapshot; unitPrice: number | null }) {
  const labelRows = ["good_match", "close_match", "poor_match", "cant_tell"].map((k) => [
    LABELS[k],
    s.results.byLabel[k] ?? 0,
    s.results.total ? pct((s.results.byLabel[k] ?? 0) / s.results.total) : "no data yet",
  ]);
  const confRows = ["high", "medium", "low"].map((k) => [CONF[k], s.results.byConfidence[k] ?? 0]);
  const reasonRows = entries(s.gate.reasons).map(([k, n]) => [REASONS[k] ?? k, n]);
  const cost = unitPrice !== null && s.avgUnitsPerPaidSession !== null ? `about ₹${(s.avgUnitsPerPaidSession * unitPrice).toFixed(2)} per paid session` : null;
  return (
    <>
      <div className="stats">
        <div className="stat"><b>{s.started}</b><span>Sessions that took a photo</span></div>
        <div className="stat"><b>{pct(s.results.confidentShare)}</b><span>Reached a confident verdict ({s.results.confidentSessions} of {s.started})</span></div>
        <div className="stat"><b>{pct(s.gate.retakeThenSuccessRate)}</b><span>Retake-then-success ({s.gate.retakeThenSuccess} of {s.gate.sessionsWithRefusal} refused shoppers)</span></div>
        <div className="stat"><b>{num(s.avgUnitsPerPaidSession)}</b><span>Units per paid session{cost ? `, ${cost}` : ""}</span></div>
        <div className="stat"><b>{s.unitsSpent}</b><span>Units spent in total ({s.paidSessions} paid sessions)</span></div>
      </div>
      <h3>Verdicts shown</h3>
      <Table caption="Verdict distribution" head={["Verdict", "Count", "Share of verdicts"]} rows={labelRows} />
      <Table caption="Confidence of those verdicts" head={["Confidence", "Count"]} rows={confRows} />
      <h3>Why photos were refused before any paid analysis</h3>
      <Table caption="Refusal reasons" head={["Reason", "Photos"]} rows={reasonRows} />
      <p className="small">
        {s.gate.passed} photos passed the free on-device check and {s.gate.refused} were refused. {s.cachedAnalyses} of {s.analyses} analyses were repeats served from the session cache at no cost.
      </p>
      {(Object.keys(s.denied).length > 0 || Object.keys(s.errors).length > 0) && (
        <Table
          caption="Live checks that did not complete"
          head={["Cause", "Count"]}
          rows={[...entries(s.denied), ...entries(s.errors)].map(([k, n]) => [WORDS[k] ?? k, n])}
        />
      )}
    </>
  );
}

export function DashboardClient() {
  const [data, setData] = useState<Payload | null>(null);
  const [failed, setFailed] = useState(false);
  const [updated, setUpdated] = useState<Date | null>(null);
  const [price, setPrice] = useState("");

  const [tick, setTick] = useState(0); // bumping this reloads the numbers

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/metrics", { cache: "no-store" });
        if (!res.ok) throw new Error("bad status");
        const json = (await res.json()) as Payload;
        if (!cancelled) {
          setData(json);
          setFailed(false);
          setUpdated(new Date());
        }
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tick]);

  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 15_000);
    return () => clearInterval(t);
  }, []);
  const reload = () => setTick((n) => n + 1);

  const unitPrice = price.trim() !== "" && Number.isFinite(Number(price)) && Number(price) >= 0 ? Number(price) : null;

  return (
    <div className="dash">
      <p className="dash-note">
        Aggregate numbers only. No photos, names or addresses are stored, and a random session id is kept only in memory. These numbers describe how the tool behaves. They make
        no claim about sales or returns.
      </p>
      <div className="dash-tools">
        <label>
          Your price per unit (₹, optional){" "}
          <input inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} aria-describedby="unit-help" />
        </label>
        <button type="button" onClick={reload}>Refresh</button>
        <span id="unit-help" className="small">The cost per session is shown in units. Enter your price per unit to see it in rupees.</span>
      </div>

      <section className="dash-section" aria-labelledby="live-title">
        <h2 id="live-title">Live numbers</h2>
        {data ? (
          <>
            <p className="dash-note">
              Counted by this server since {new Date(data.live.since).toLocaleString()}. They reset whenever the server restarts, so treat them as a live view, not a record.
              {updated ? ` Updated ${updated.toLocaleTimeString()}.` : ""}
            </p>
            <div className="stats">
              <div className="stat">
                <b>{data.balance === null ? "unavailable" : data.balance}</b>
                <span>Units left on the YouCam account. {data.caps.reserveUnits} are kept in reserve and never spent; a session uses at most {data.caps.perSessionUnits}.</span>
              </div>
            </div>
            <Block s={data.live} unitPrice={unitPrice} />
          </>
        ) : failed ? (
          <p role="alert">The live numbers could not be loaded. <button type="button" onClick={reload}>Try again</button></p>
        ) : (
          <p role="status">Loading the live numbers...</p>
        )}
      </section>

      <section className="dash-section" aria-labelledby="demo-title">
        <h2 id="demo-title">Demo data</h2>
        <p className="dash-note dash-demo"><strong>{SEED_LABEL}</strong> It is here only to show what the dashboard looks like with traffic.</p>
        <Block s={SEED_SNAPSHOT} unitPrice={unitPrice} />
      </section>
    </div>
  );
}
