"use client";

import type { GmailTableRow } from "./gmail-types";

export type BatchParseResultRow = {
  gmailMessageId: string;
  subject: string;
  from: string;
  status: "parsed" | "duplicate" | "error";
  error?: string;
  createdCount?: number;
  lineCount?: number;
  createdTransactions?: {
    merchant: string | null;
    amount: number;
    currency: string;
    occurredAt: string;
    kind: "charge" | "reversal";
  }[];
};

type GmailBatchParseModalProps = {
  open: boolean;
  running: boolean;
  done: number;
  total: number;
  currentLabel?: string;
  results: BatchParseResultRow[];
  onClose: () => void;
  onOpenEmail: (gmailMessageId: string) => void;
  selectedRows: GmailTableRow[];
};

export function GmailBatchParseModal({
  open,
  running,
  done,
  total,
  currentLabel,
  results,
  onClose,
  onOpenEmail,
  selectedRows,
}: GmailBatchParseModalProps) {
  if (!open) return null;

  const percent = total > 0 ? Math.round((done / total) * 100) : 0;
  const hasFinished = !running && total > 0 && done >= total;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-black/50 p-4 sm:items-center"
      role="presentation"
      onClick={!running ? onClose : undefined}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="batch-parse-title"
        className="flex max-h-[88vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-xl dark:border-zinc-700 dark:bg-zinc-950"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-zinc-200 px-5 py-4 dark:border-zinc-800">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3
                id="batch-parse-title"
                className="text-lg font-semibold text-zinc-900 dark:text-zinc-100"
              >
                {running
                  ? total === 1
                    ? "Parsing email…"
                    : "Parsing selected emails…"
                  : total === 1
                    ? "Parse result"
                    : "Batch parse results"}
              </h3>
              <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                {done}/{total} processed
                {currentLabel ? ` · Current: ${currentLabel}` : ""}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              disabled={running}
              className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm disabled:opacity-50 dark:border-zinc-700"
            >
              Close
            </button>
          </div>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
            <div
              className="h-full bg-zinc-900 transition-all dark:bg-zinc-100"
              style={{ width: `${percent}%` }}
            />
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {!hasFinished && (
            <ul className="space-y-2">
              {selectedRows.map((row) => (
                <li
                  key={row.gmailMessageId}
                  className="flex items-center justify-between gap-3 rounded-md border border-zinc-200 px-3 py-2 text-sm dark:border-zinc-800"
                >
                  <button
                    type="button"
                    onClick={() => onOpenEmail(row.gmailMessageId)}
                    className="min-w-0 flex-1 truncate text-left hover:underline"
                  >
                    {row.subject || "(No subject)"}
                  </button>
                  <span className="text-xs text-zinc-500">
                    {results.find((r) => r.gmailMessageId === row.gmailMessageId)
                      ? "Processed"
                      : "Pending"}
                  </span>
                </li>
              ))}
            </ul>
          )}

          {hasFinished && (
            <div className="space-y-2">
              {results.map((row) => (
                <div
                  key={row.gmailMessageId}
                  className="rounded-md border border-zinc-200 px-3 py-2 dark:border-zinc-800"
                >
                  <div className="flex items-center justify-between gap-3">
                    <button
                      type="button"
                      onClick={() => onOpenEmail(row.gmailMessageId)}
                      className="min-w-0 truncate text-left text-sm font-medium hover:underline"
                    >
                      {row.subject || "(No subject)"}
                    </button>
                    <span className="text-xs text-zinc-500">{row.status}</span>
                  </div>
                  <p className="text-xs text-zinc-500">{row.from}</p>
                  {row.status === "parsed" && (
                    <div className="mt-1 text-xs text-zinc-600 dark:text-zinc-300">
                      <p>
                        Created {row.createdCount ?? 0} transaction(s) from{" "}
                        {row.lineCount ?? row.createdCount ?? 0} detected line(s).
                      </p>
                      {row.createdTransactions && row.createdTransactions.length > 0 && (
                        <ul className="mt-1 list-disc pl-4">
                          {row.createdTransactions.map((tx, idx) => (
                            <li key={`${row.gmailMessageId}-${idx}`}>
                              {tx.kind === "reversal" ? "Reversal" : "Charge"} ·{" "}
                              {tx.merchant || "Unknown merchant"} ·{" "}
                              {new Intl.NumberFormat(undefined, {
                                style: "currency",
                                currency: tx.currency || "USD",
                              }).format(tx.amount)}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}
                  {row.error && (
                    <p className="mt-1 text-xs text-red-600 dark:text-red-400">
                      {row.error}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

