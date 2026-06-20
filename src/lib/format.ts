export function formatUSD(n: number, opts: { compact?: boolean } = {}) {
  if (!isFinite(n)) return "$0.00";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: opts.compact ? 2 : 2,
    minimumFractionDigits: 2,
    notation: opts.compact && Math.abs(n) >= 10000 ? "compact" : "standard",
  }).format(n);
}

export function formatPct(n: number, digits = 2) {
  if (!isFinite(n)) return "0.00%";
  const sign = n > 0 ? "+" : "";
  return `${sign}${n.toFixed(digits)}%`;
}

export function formatNumber(n: number, digits = 4) {
  if (!isFinite(n)) return "0";
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: digits }).format(n);
}
