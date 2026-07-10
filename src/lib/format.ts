/** Mask string for private values. */
export const MASK = "••••";

export function formatMoney(n: number, currency = "USD", opts: { compact?: boolean } = {}) {
  if (!isFinite(n)) n = 0;
  const compact = !!opts.compact && Math.abs(n) >= 1000;
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
      maximumFractionDigits: compact ? 1 : 2,
      minimumFractionDigits: compact ? 0 : 2,
      notation: compact ? "compact" : "standard",
    }).format(n);
  } catch {
    return `${currency} ${n.toFixed(2)}`;
  }
}

export function maskMoney(
  n: number,
  currency: string,
  privacy: boolean,
  opts?: { compact?: boolean },
) {
  return privacy ? MASK : formatMoney(n, currency, opts);
}

/** @deprecated use formatMoney(n, "USD") */
export function formatUSD(n: number, opts: { compact?: boolean } = {}) {
  return formatMoney(n, "USD", opts);
}

/** @deprecated use maskMoney(n, "USD", privacy) */
export function maskUSD(n: number, privacy: boolean, opts?: { compact?: boolean }) {
  return privacy ? MASK : formatMoney(n, "USD", opts);
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

export function maskNumber(n: number, privacy: boolean, digits = 4) {
  return privacy ? MASK : formatNumber(n, digits);
}
