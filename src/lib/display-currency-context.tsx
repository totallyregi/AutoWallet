"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

const STORAGE_KEY = "finance-tracker:displayCurrency";

/** Currencies supported for display (conversion via Frankfurter, USD-based). */
export type DisplayCurrency = "USD" | "SGD" | "EUR";

type RatesMap = Record<string, number>;

const FALLBACK_USD_RATES: RatesMap = {
  EUR: 0.86,
  SGD: 1.34,
};

const DisplayCurrencyContext = createContext<{
  displayCurrency: DisplayCurrency;
  setDisplayCurrency: (c: DisplayCurrency) => void;
  ratesReady: boolean;
  /** Convert stored amount (in `sourceCurrency`) to a number in `displayCurrency`. */
  convertToDisplay: (amount: number, sourceCurrency?: string | null) => number;
  formatMoney: (amount: number, sourceCurrency?: string | null) => string;
  /** For chart axes: values already treated as USD-equivalent aggregates. */
  formatMoneyFromUsdAggregate: (amountUsd: number) => string;
  formatCompactFromUsdAggregate: (amountUsd: number) => string;
} | null>(null);

function readStoredDisplayCurrency(): DisplayCurrency {
  if (typeof window === "undefined") return "USD";
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === "USD" || v === "SGD" || v === "EUR") return v;
  } catch {
    // ignore
  }
  return "USD";
}

/**
 * `rates[c]` = how many units of `c` per 1 USD (Frankfurter `from=USD` response `rates`).
 */
function convertToDisplayAmount(
  amount: number,
  sourceCurrency: string,
  rates: RatesMap,
  display: DisplayCurrency,
): number {
  const from = sourceCurrency.toUpperCase();
  const to = display;
  if (from === to) return amount;
  const rFrom = rates[from];
  const toUsd =
    from === "USD" ? amount : amount / (rFrom && rFrom > 0 ? rFrom : 1);
  if (to === "USD") return toUsd;
  return toUsd * (rates[to] ?? FALLBACK_USD_RATES[to] ?? 1);
}

export function DisplayCurrencyProvider({ children }: { children: React.ReactNode }) {
  const [displayCurrency, setDisplayState] = useState<DisplayCurrency>("USD");
  const [rates, setRates] = useState<RatesMap>(FALLBACK_USD_RATES);
  const [ratesReady, setRatesReady] = useState(false);

  useEffect(() => {
    queueMicrotask(() => setDisplayState(readStoredDisplayCurrency()));
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("https://api.frankfurter.dev/v1/latest?from=USD");
        if (!res.ok) return;
        const data = (await res.json()) as { rates?: RatesMap };
        if (cancelled || !data.rates || typeof data.rates !== "object") return;
        setRates({ ...FALLBACK_USD_RATES, ...data.rates });
      } catch {
        // keep fallback
      } finally {
        if (!cancelled) setRatesReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const setDisplayCurrency = useCallback((c: DisplayCurrency) => {
    try {
      localStorage.setItem(STORAGE_KEY, c);
    } catch {
      // ignore
    }
    setDisplayState(c);
  }, []);

  const convertToDisplay = useCallback(
    (amount: number, sourceCurrency?: string | null) => {
      const src = (sourceCurrency || "USD").toUpperCase();
      return convertToDisplayAmount(amount, src, rates, displayCurrency);
    },
    [rates, displayCurrency],
  );

  const formatMoney = useCallback(
    (amount: number, sourceCurrency?: string | null) => {
      const n = convertToDisplay(amount, sourceCurrency);
      return new Intl.NumberFormat(undefined, {
        style: "currency",
        currency: displayCurrency,
      }).format(n);
    },
    [convertToDisplay, displayCurrency],
  );

  const formatMoneyFromUsdAggregate = useCallback(
    (amountUsd: number) => {
      const n =
        displayCurrency === "USD"
          ? amountUsd
          : amountUsd * (rates[displayCurrency] ?? FALLBACK_USD_RATES[displayCurrency] ?? 1);
      return new Intl.NumberFormat(undefined, {
        style: "currency",
        currency: displayCurrency,
      }).format(n);
    },
    [rates, displayCurrency],
  );

  const formatCompactFromUsdAggregate = useCallback(
    (amountUsd: number) => {
      const n =
        displayCurrency === "USD"
          ? amountUsd
          : amountUsd * (rates[displayCurrency] ?? FALLBACK_USD_RATES[displayCurrency] ?? 1);
      return new Intl.NumberFormat(undefined, {
        notation: "compact",
        maximumFractionDigits: 1,
        style: "currency",
        currency: displayCurrency,
      }).format(n);
    },
    [rates, displayCurrency],
  );

  const value = useMemo(
    () => ({
      displayCurrency,
      setDisplayCurrency,
      ratesReady,
      convertToDisplay,
      formatMoney,
      formatMoneyFromUsdAggregate,
      formatCompactFromUsdAggregate,
    }),
    [
      displayCurrency,
      setDisplayCurrency,
      ratesReady,
      convertToDisplay,
      formatMoney,
      formatMoneyFromUsdAggregate,
      formatCompactFromUsdAggregate,
    ],
  );

  return (
    <DisplayCurrencyContext.Provider value={value}>
      {children}
    </DisplayCurrencyContext.Provider>
  );
}

export function useDisplayCurrency() {
  const ctx = useContext(DisplayCurrencyContext);
  if (!ctx) {
    throw new Error("useDisplayCurrency must be used within DisplayCurrencyProvider");
  }
  return ctx;
}
