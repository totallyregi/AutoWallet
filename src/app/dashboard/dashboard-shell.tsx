"use client";

import Link from "next/link";
import { logoutAction } from "./actions";
import { DashboardClient } from "./dashboard-client";
import { DisplayCurrencyProvider, useDisplayCurrency } from "@/lib/display-currency-context";
import { useEffect } from "react";
import { useTheme } from "@/components/theme-provider";
import type { GmailConnectionState } from "./gmail-types";

function CurrencySelect() {
  const { displayCurrency, setDisplayCurrency } = useDisplayCurrency();
  return (
    <div className="flex items-center rounded-xl border border-[var(--aw-border)] p-1" role="radiogroup" aria-label="Display currency">
      {(["SGD", "USD", "EUR"] as const).map((c) => (
        <button
          key={c}
          type="button"
          role="radio"
          aria-checked={displayCurrency === c}
          onClick={() => setDisplayCurrency(c)}
          className={`rounded-lg px-2.5 py-1 text-xs font-bold transition ${
            displayCurrency === c
              ? "bg-gradient-to-br from-emerald-400 to-teal-400 text-emerald-950 shadow"
              : "text-[var(--aw-muted)] hover:text-[var(--foreground)]"
          }`}
        >
          {c}
        </button>
      ))}
    </div>
  );
}

/** Demo data is in SGD, so show SGD unless the visitor has already picked a currency. */
function DemoCurrencyDefault() {
  const { setDisplayCurrency } = useDisplayCurrency();
  useEffect(() => {
    try {
      if (!localStorage.getItem("autowallet:displayCurrency")) setDisplayCurrency("SGD");
    } catch {
      // storage unavailable: keep the default
    }
  }, [setDisplayCurrency]);
  return null;
}

function ThemeToggle() {
  const { theme, setTheme, ready } = useTheme();
  const dark = !ready || theme === "dark";
  return (
    <button
      type="button"
      onClick={() => setTheme(dark ? "light" : "dark")}
      className="flex h-9 w-9 items-center justify-center rounded-xl border border-[var(--aw-border)] text-[var(--aw-muted)] transition hover:rotate-12 hover:text-[var(--foreground)]"
      aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
    >
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round">
        {dark ? (
          <path d="M12 3v2m0 14v2M3 12h2m14 0h2M5.6 5.6l1.4 1.4m10 10 1.4 1.4M5.6 18.4 7 17m10-10 1.4-1.4M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8z" />
        ) : (
          <path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z" />
        )}
      </svg>
    </button>
  );
}

type DashboardShellProps = {
  userEmail: string | null;
  userName: string | null;
  googleOAuthEnabled: boolean;
  gmailConnection: GmailConnectionState;
  gmailDisplayEmail: string | null;
  isDemo?: boolean;
};

export function DashboardShell({
  userEmail,
  userName,
  googleOAuthEnabled,
  gmailConnection,
  gmailDisplayEmail,
  isDemo = false,
}: DashboardShellProps) {
  const identity = isDemo ? "Demo wallet" : userEmail ?? userName ?? "Account";
  const initial = (isDemo ? "D" : (userName ?? userEmail ?? "A")).charAt(0).toUpperCase();

  return (
    <DisplayCurrencyProvider>
      {isDemo && <DemoCurrencyDefault />}
      <header className="sticky top-0 z-30 border-b border-[var(--aw-border)] bg-[var(--background)]/75 backdrop-blur-xl">
        <div className="mx-auto flex h-16 w-full max-w-[1500px] items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
          <Link href="/dashboard" className="flex items-center gap-2.5 font-bold tracking-tight">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-emerald-400 to-teal-500 text-xs font-extrabold text-emerald-950 shadow-[0_6px_20px_-6px_rgba(52,211,153,0.8)]">AW</span>
            <span className="hidden sm:inline">AutoWallet</span>
          </Link>
          <div className="flex items-center gap-2 sm:gap-3">
            <CurrencySelect />
            <ThemeToggle />
            <div className="hidden items-center gap-2 rounded-xl border border-[var(--aw-border)] py-1 pl-1 pr-3 md:flex">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-400/15 text-xs font-bold text-emerald-500">{initial}</span>
              <span className="max-w-[200px] truncate text-sm text-[var(--aw-muted)]">{identity}</span>
            </div>
            <form action={logoutAction}>
              <button type="submit" className="rounded-xl px-3 py-2 text-sm font-semibold text-[var(--aw-muted)] transition hover:text-[var(--foreground)]">
                {isDemo ? "Exit demo" : "Sign out"}
              </button>
            </form>
          </div>
        </div>
      </header>

      {isDemo && (
        <div className="border-b border-emerald-400/20 bg-gradient-to-r from-emerald-500/15 via-teal-500/10 to-transparent">
          <div className="mx-auto flex w-full max-w-[1500px] flex-wrap items-center justify-between gap-3 px-4 py-2.5 text-sm sm:px-6 lg:px-8">
            <p className="flex items-center gap-2">
              <span className="aw-pulse h-2 w-2 rounded-full bg-emerald-400" />
              <span><b>Demo wallet</b> with 3 months of sample spending. Edit, delete, or try up to 5 AI receipt and text imports.</span>
            </p>
            <Link href="/signup" className="aw-btn-primary h-8 px-3 text-xs">Create your own wallet</Link>
          </div>
        </div>
      )}

      <div className="mx-auto flex min-h-full w-full max-w-[1500px] flex-col px-4 py-6 sm:px-6 lg:px-8">
        <DashboardClient
          googleOAuthEnabled={googleOAuthEnabled}
          gmailConnection={gmailConnection}
          gmailDisplayEmail={gmailDisplayEmail}
        />
      </div>
    </DisplayCurrencyProvider>
  );
}
