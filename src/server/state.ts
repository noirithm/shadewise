import { Metrics } from "./metrics";

// One counter set per server instance, kept on globalThis so development reloads do not reset it.
const g = globalThis as unknown as { __shadewiseMetrics?: Metrics };

export function getMetrics(): Metrics {
  return (g.__shadewiseMetrics ??= new Metrics());
}
