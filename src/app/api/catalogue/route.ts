import { NextResponse, type NextRequest } from "next/server";
import { CATALOGUE, CATALOGUE_LABEL } from "@/config/catalogue";
import { corsFor, parseOrigins } from "@/server/cors";

/** The demo catalogue, in the shape the widget expects. A real brand would serve its own. */
export function GET(req: NextRequest) {
  const cors = corsFor(req.headers.get("origin"), req.nextUrl.origin, parseOrigins(process.env.ALLOWED_ORIGINS));
  if (!cors.allowed) return new NextResponse(null, { status: 403 });
  const items = CATALOGUE.map(({ id, name, shade, hex, priceInr }) => ({ id, name, shade, hex, priceInr }));
  return NextResponse.json(
    { label: CATALOGUE_LABEL, items },
    { headers: { "Cache-Control": "public, max-age=300", ...cors.headers } },
  );
}
