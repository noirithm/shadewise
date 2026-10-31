import { z } from "zod";
import { GATE_REASONS, type MetricEvent } from "./metrics";

const session = z.string().regex(/^[A-Za-z0-9_-]{16,64}$/);

/** Only fixed words are accepted, so nothing a visitor types or a photo contains can enter the counters. */
const EventSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("gate_passed"), session }).strict(),
  z.object({ type: z.literal("gate_refused"), session, reasons: z.array(z.enum(GATE_REASONS)).max(12) }).strict(),
  z
    .object({
      type: z.literal("result"),
      session,
      label: z.enum(["good_match", "close_match", "poor_match", "cant_tell"]),
      confidence: z.enum(["high", "medium", "low"]),
    })
    .strict(),
  z.object({ type: z.literal("sample_viewed"), session }).strict(),
]);

export function parseEvent(raw: unknown): MetricEvent | null {
  const r = EventSchema.safeParse(raw);
  return r.success ? (r.data as MetricEvent) : null;
}
