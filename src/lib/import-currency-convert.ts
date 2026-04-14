/**
 * Convert extracted receipt amounts to the user's preferred import currency
 * using Frankfurter's latest USD-based rates at import time.
 */

export const IMPORT_STORE_CURRENCIES = ["USD", "SGD", "EUR"] as const;
export type ImportStoreCurrency = (typeof IMPORT_STORE_CURRENCIES)[number];

const FALLBACK_USD_RATES: Record<string, number> = {
  EUR: 0.92,
  SGD: 1.35,
};

export function roundMoney2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function normalizeRawCurrency(raw: string | null | undefined): string {
  return (raw || "USD").trim().toUpperCase();
}

export function normalizePreferredImportCurrency(
  raw: string | null | undefined,
): ImportStoreCurrency | null {
  if (!raw || typeof raw !== "string") return null;
  const u = raw.trim().toUpperCase();
  if (u === "USD" || u === "SGD" || u === "EUR") return u;
  return null;
}

export async function fetchFrankfurterUsdLatestRates(): Promise<Record<string, number>> {
  const res = await fetch("https://api.frankfurter.dev/v1/latest?from=USD");
  if (!res.ok) return { ...FALLBACK_USD_RATES };
  const data = (await res.json()) as { rates?: Record<string, number> };
  if (!data.rates || typeof data.rates !== "object") return { ...FALLBACK_USD_RATES };
  return { ...FALLBACK_USD_RATES, ...data.rates };
}

/**
 * `rates[c]` = units of `c` per 1 USD. Converts `amount` expressed in `fromCurrency` into `toCurrency`.
 */
export function convertViaUsdRates(
  amount: number,
  fromCurrency: string,
  toCurrency: string,
  rates: Record<string, number>,
): number | null {
  const from = normalizeRawCurrency(fromCurrency);
  const to = normalizeRawCurrency(toCurrency);
  if (!Number.isFinite(amount) || amount <= 0) return null;
  if (from === to) return roundMoney2(amount);

  const merged = { ...FALLBACK_USD_RATES, ...rates };
  const rFrom = merged[from];
  const toUsd =
    from === "USD" ? amount : amount / (rFrom && rFrom > 0 ? rFrom : Number.NaN);
  if (!Number.isFinite(toUsd)) return null;
  const out =
    to === "USD" ? toUsd : toUsd * (merged[to] && merged[to] > 0 ? merged[to] : Number.NaN);
  if (!Number.isFinite(out) || out <= 0) return null;
  return roundMoney2(out);
}

/**
 * `rates[c]` = units of currency `c` per 1 USD (Frankfurter `from=USD`).
 * Converts `amount` in `fromCurrency` into `preferred` when they differ.
 */
export function convertExtractedToImportCurrency(
  amount: number,
  fromCurrencyRaw: string | null | undefined,
  preferred: ImportStoreCurrency,
  rates: Record<string, number>,
): { amount: number; currency: string; fxNote: string | null } {
  const from = normalizeRawCurrency(fromCurrencyRaw);
  if (!Number.isFinite(amount) || amount <= 0) {
    return { amount, currency: from, fxNote: null };
  }
  if (from === preferred) {
    return { amount: roundMoney2(amount), currency: preferred, fxNote: null };
  }

  const rFrom = rates[from];
  const toUsd =
    from === "USD" ? amount : amount / (rFrom && rFrom > 0 ? rFrom : Number.NaN);
  if (!Number.isFinite(toUsd)) {
    return {
      amount: roundMoney2(amount),
      currency: from,
      fxNote: `Could not convert unsupported currency ${from}; stored original amount.`,
    };
  }

  const rTo = rates[preferred];
  const out =
    preferred === "USD"
      ? toUsd
      : toUsd * (rTo && rTo > 0 ? rTo : Number.NaN);
  if (!Number.isFinite(out) || out <= 0) {
    return {
      amount: roundMoney2(amount),
      currency: from,
      fxNote: `Could not convert to ${preferred}; stored original ${from} amount.`,
    };
  }

  const isoDay = new Date().toISOString().slice(0, 10);
  return {
    amount: roundMoney2(out),
    currency: preferred,
    fxNote: `Converted from ${from} ${roundMoney2(amount)} using Frankfurter latest USD-based rates (${isoDay} UTC).`,
  };
}

export function applyImportWithCachedRates(
  amount: number,
  fromCurrencyRaw: string | null | undefined,
  preferred: ImportStoreCurrency | null,
  rates: Record<string, number> | null,
): { amount: number; currency: string; fxNote: string | null } {
  const from = normalizeRawCurrency(fromCurrencyRaw);
  if (!preferred || !rates) {
    return { amount: roundMoney2(amount), currency: from, fxNote: null };
  }
  return convertExtractedToImportCurrency(amount, fromCurrencyRaw, preferred, rates);
}

/** Single fetch; for routes that import one transaction at a time. */
export async function resolveImportAmountAndCurrency(
  amount: number,
  fromCurrencyRaw: string | null | undefined,
  preferred: ImportStoreCurrency | null,
): Promise<{ amount: number; currency: string; fxNote: string | null }> {
  const from = normalizeRawCurrency(fromCurrencyRaw);
  if (!preferred) {
    return { amount: roundMoney2(amount), currency: from, fxNote: null };
  }
  const rates = await fetchFrankfurterUsdLatestRates();
  return convertExtractedToImportCurrency(amount, fromCurrencyRaw, preferred, rates);
}
