import { NextResponse } from "next/server";
import { CAPS, MAX_UNITS_PER_SESSION } from "@/config/caps";
import { totalBalance } from "@/server/budget";
import { loadServerConfig } from "@/server/config";
import { getMetrics } from "@/server/state";

let cached: { at: number; value: number | null } | null = null;

/** Remaining units, read from the YouCam balance endpoint (a free call), cached for a minute. */
async function balance(): Promise<number | null> {
  if (cached && Date.now() - cached.at < 60_000) return cached.value;
  let value: number | null = null;
  try {
    const cfg = loadServerConfig();
    const res = await fetch(`${cfg.apiBase}/s2s/v1.0/client/credit`, {
      headers: { Authorization: `Bearer ${cfg.apiKey}` },
      signal: AbortSignal.timeout(8000),
    });
    if (res.ok) value = totalBalance(await res.json());
  } catch {
    value = null;
  }
  cached = { at: Date.now(), value };
  return value;
}

export async function GET() {
  return NextResponse.json(
    {
      live: getMetrics().snapshot(),
      balance: await balance(),
      caps: { reserveUnits: CAPS.reserveUnits, dailyUnits: CAPS.dailyUnits, perSessionUnits: MAX_UNITS_PER_SESSION },
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
