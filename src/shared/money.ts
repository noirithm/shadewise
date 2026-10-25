/** Rupees with thousands separators. Prices here are well under a lakh, so plain grouping is exact. */
export function inr(n: number): string {
  const r = Math.round(Math.abs(n));
  return (n < 0 ? "-" : "") + "₹" + String(r).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}
