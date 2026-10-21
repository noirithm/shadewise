// Foundation preview settings, as used in the verified Gate 0 call. Preview realism is not reviewed yet.
export const TRYON = { colorIntensity: 60, glowIntensity: 30, coverageIntensity: 50, skinSmooth: 0 } as const;

export const API_LIMITS = {
  requestTimeoutMs: 15_000,
  pollTimeoutMs: 45_000, // real tasks finished in 4 to 6.5 s
  pollFirstDelayMs: 1_000,
  pollMaxDelayMs: 4_000,
  pollBackoff: 1.5,
  maxTransientPollErrors: 3,
} as const;
