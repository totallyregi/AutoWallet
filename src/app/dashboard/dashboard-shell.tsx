"use client";

import Link from "next/link";
import { logoutAction } from "./actions";
import { DashboardClient } from "./dashboard-client";
import { DisplayCurrencyProvider, useDisplayCurrency } from "@/lib/display-currency-context";
import type { GmailConnectionState } from "./gmail-types";

function CurrencySelect() {
  const { displayCurrency, setDisplayCurrency } = useDisplayCurrency();
  return (
    <label className="flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-400">
      <span className="hidden whitespace-nowrap sm:inline">Display</span>
      <select
        className="h-9 min-w-[5.5rem] rounded-lg border border-zinc-300 bg-white px-2 text-sm font-medium text-zinc-900 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100"
        value={displayCurrency}
        onChange={(e) =>
          setDisplayCurrency(e.target.value as "USD" | "SGD" | "EUR")
        }
        aria-label="Display currency"
      >
        <option value="USD">USD</option>
        <option value="SGD">SGD</option>
        <option value="EUR">EUR</option>
      </select>
    </label>
  );
}

type DashboardShellProps = {
  userEmail: string | null;
  userName: string | null;
  googleOAuthEnabled: boolean;
  gmailConnection: GmailConnectionState;
  gmailDisplayEmail: string | null;
};

export function DashboardShell({
  userEmail,
  userName,
  googleOAuthEnabled,
  gmailConnection,
  gmailDisplayEmail,
}: DashboardShellProps) {
  const identity = userEmail ?? userName ?? "Account";

  return (
    <DisplayCurrencyProvider>
      <div className="mx-auto flex min-h-full w-full max-w-[1500px] flex-col px-4 py-6 sm:px-6 lg:px-8">
        <nav className="mb-10 flex flex-wrap items-center justify-between gap-4">
          <Link href="/dashboard" className="text-lg font-semibold tracking-tight">
            Finance Tracker
          </Link>
          <div className="flex flex-wrap items-center justify-end gap-3 sm:gap-4">
            <CurrencySelect />
            <span className="hidden max-w-[220px] truncate text-sm text-zinc-600 sm:inline dark:text-zinc-400">
              {identity}
            </span>
            <form action={logoutAction}>
              <button
                type="submit"
                className="text-sm font-medium text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
              >
                Sign out
              </button>
            </form>
          </div>
        </nav>
        <DashboardClient
          googleOAuthEnabled={googleOAuthEnabled}
          gmailConnection={gmailConnection}
          gmailDisplayEmail={gmailDisplayEmail}
        />
      </div>
    </DisplayCurrencyProvider>
  );
}
