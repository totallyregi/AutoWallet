"use client";

import { useMemo, useState } from "react";
import {
  ParseJobFinishedSummary,
  jobViewFromSnapshot,
  type ParseHistorySnapshot,
} from "./parse-job-finished-summary";
import type { ParseJobResultRow } from "./parse-job-types";

export const PARSE_HISTORY_STORAGE_KEY = "autowallet:parseHistory";
const PARSE_HISTORY_MAX = 40;

export type ParseHistoryEntry = {
  id: string;
  completedAt: string;
  snapshot: ParseHistorySnapshot;
  results: ParseJobResultRow[];
};

function isParseHistoryEntry(x: unknown): x is ParseHistoryEntry {
  if (!x || typeof x !== "object") return false;
  const o = x as Record<string, unknown>;
  return (
    typeof o.id === "string" &&
    typeof o.completedAt === "string" &&
    o.snapshot != null &&
    typeof o.snapshot === "object" &&
    Array.isArray(o.results)
  );
}

export function readParseHistory(): ParseHistoryEntry[] {
  try {
    const raw = localStorage.getItem(PARSE_HISTORY_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isParseHistoryEntry);
  } catch {
    return [];
  }
}

export function prependParseHistoryEntry(entry: ParseHistoryEntry): void {
  try {
    const prev = readParseHistory();
    const next = [entry, ...prev].slice(0, PARSE_HISTORY_MAX);
    localStorage.setItem(PARSE_HISTORY_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // ignore quota / private mode
  }
}

export function truncatePasteForHistory(text: string, max = 2000): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max)}…`;
}

function kindLabel(snap: ParseHistorySnapshot): string {
  if (snap.kind === "gmail") return "Gmail";
  if (snap.kind === "receipt") return "Receipt";
  return "Pasted text";
}

function entrySummary(entry: ParseHistoryEntry): string {
  const n = entry.results.length;
  const ok = entry.results.filter((r) => r.status !== "error").length;
  return `${ok}/${n} succeeded`;
}

type ParseHistoryViewProps = {
  historyRevision: number;
  onOpenGmailMessage?: (gmailMessageId: string) => void;
};

export function ParseHistoryView({
  historyRevision,
  onOpenGmailMessage,
}: ParseHistoryViewProps) {
  const [detail, setDetail] = useState<ParseHistoryEntry | null>(null);

  const entries = useMemo(() => {
    void historyRevision;
    return readParseHistory();
  }, [historyRevision]);

  const sorted = useMemo(
    () =>
      [...entries].sort(
        (a, b) =>
          new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime(),
      ),
    [entries],
  );

  return (
    <section className="fade-slide-in space-y-4">
      <header className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
        <h1 className="text-2xl font-semibold tracking-tight">Parse history</h1>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          Recent parse runs from Gmail, receipts, and pasted text (stored in this
          browser). Open an entry to see the same detail as when parsing finished.
        </p>
      </header>

      {sorted.length === 0 ? (
        <p className="rounded-xl border border-zinc-200 bg-zinc-50/80 px-4 py-8 text-center text-sm text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900/30 dark:text-zinc-400">
          No parse history yet. Parse an email, receipt, or pasted text to build
          this log.
        </p>
      ) : (
        <ul className="space-y-2">
          {sorted.map((e) => (
            <li key={e.id}>
              <button
                type="button"
                onClick={() => setDetail(e)}
                className="w-full rounded-xl border border-zinc-200 bg-white px-4 py-3 text-left shadow-sm transition-colors hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950 dark:hover:bg-zinc-900/50"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                    {kindLabel(e.snapshot)} · {entrySummary(e)}
                  </span>
                  <span className="text-xs tabular-nums text-zinc-500">
                    {new Date(e.completedAt).toLocaleString()}
                  </span>
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}

      {detail && (
        <div
          className="fixed inset-0 z-[70] flex items-end justify-center bg-black/50 p-4 sm:items-center"
          role="presentation"
          onClick={() => setDetail(null)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="parse-history-detail-title"
            className="flex max-h-[88vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-xl dark:border-zinc-700 dark:bg-zinc-950"
            onClick={(ev) => ev.stopPropagation()}
          >
            <div className="border-b border-zinc-200 px-5 py-4 dark:border-zinc-800">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3
                    id="parse-history-detail-title"
                    className="text-lg font-semibold text-zinc-900 dark:text-zinc-100"
                  >
                    Parse run · {kindLabel(detail.snapshot)}
                  </h3>
                  <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                    {new Date(detail.completedAt).toLocaleString()} ·{" "}
                    {entrySummary(detail)}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setDetail(null)}
                  className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm dark:border-zinc-700"
                >
                  Close
                </button>
              </div>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
              <ParseJobFinishedSummary
                job={jobViewFromSnapshot(detail.snapshot, {
                  onOpenEmail: (id) => {
                    setDetail(null);
                    onOpenGmailMessage?.(id);
                  },
                })}
                results={detail.results}
              />
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
