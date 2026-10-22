export const LIMITS = {
  perIp: { max: 10, windowMs: 10 * 60_000 }, // provisional; shared networks may need more
  perSession: { max: 6, windowMs: 10 * 60_000 },
  clientTimeoutMs: 60_000,
} as const;
