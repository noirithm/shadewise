import { z } from "zod";

export const VerdictLabelSchema = z.enum(["good_match", "close_match", "poor_match", "cant_tell"]);
export const ConfidenceSchema = z.enum(["high", "medium", "low"]);

/** Every sentence shown to a shopper comes from a template and carries a code for traceability. */
export const ReasonSchema = z.object({ code: z.string().min(1), text: z.string().min(1) });

export const VerdictSchema = z.object({
  itemId: z.string(),
  label: VerdictLabelSchema,
  confidence: ConfidenceSchema,
  deltaE: z.number().nullable(), // CIEDE2000 distance, null when we can't tell
  reasons: z.array(ReasonSchema).min(1),
  retake: z.boolean(), // true when a better photo would give an answer
});

export type VerdictLabel = z.infer<typeof VerdictLabelSchema>;
export type Confidence = z.infer<typeof ConfidenceSchema>;
export type Reason = z.infer<typeof ReasonSchema>;
export type Verdict = z.infer<typeof VerdictSchema>;
