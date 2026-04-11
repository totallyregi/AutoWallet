"use client";

import type { ParseJobConfig, ParseJobResultRow } from "./parse-job-types";

export type ParseFinishedJobGmail = {
  kind: "gmail";
  rows: { sourceId: string; title: string; subtitle?: string }[];
  onOpenEmail?: (gmailMessageId: string) => void;
};

export type ParseFinishedJobReceipt = {
  kind: "receipt";
  sources: {
    sourceId: string;
    name: string;
    isPdf: boolean;
    previewUrl?: string;
  }[];
};

export type ParseFinishedJobText = {
  kind: "text";
  pastedText: string;
};

export type ParseFinishedJobView =
  | ParseFinishedJobGmail
  | ParseFinishedJobReceipt
  | ParseFinishedJobText;

/** Serializable shape for localStorage (no functions / blob URLs). */
export type ParseHistorySnapshot =
  | { kind: "gmail"; rows: ParseFinishedJobGmail["rows"] }
  | {
      kind: "receipt";
      sources: { sourceId: string; name: string; isPdf: boolean }[];
    }
  | ParseFinishedJobText;

function ReceiptPreview({
  url,
  isPdf,
  name,
}: {
  url: string;
  isPdf: boolean;
  name: string;
}) {
  if (isPdf) {
    return (
      <iframe
        src={url}
        title={name}
        className="h-48 w-full rounded border border-zinc-200 dark:border-zinc-700"
      />
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element -- blob object URL previews
    <img
      src={url}
      alt=""
      className="max-h-48 w-full max-w-md rounded border border-zinc-200 object-contain dark:border-zinc-700"
    />
  );
}

export function jobViewFromParseJobConfig(job: ParseJobConfig): ParseFinishedJobView {
  if (job.kind === "gmail") {
    return {
      kind: "gmail",
      rows: job.rows.map((r) => ({
        sourceId: r.gmailMessageId,
        title: r.subject,
        subtitle: r.from,
      })),
      onOpenEmail: job.onOpenEmail,
    };
  }
  if (job.kind === "receipt") {
    return {
      kind: "receipt",
      sources: job.sources.map((s) => ({
        sourceId: s.id,
        name: s.name,
        isPdf: s.isPdf,
        previewUrl: s.previewUrl,
      })),
    };
  }
  return { kind: "text", pastedText: job.pastedText };
}

export function snapshotFromJobView(job: ParseFinishedJobView): ParseHistorySnapshot {
  if (job.kind === "gmail") {
    return { kind: "gmail", rows: job.rows };
  }
  if (job.kind === "receipt") {
    return {
      kind: "receipt",
      sources: job.sources.map(({ sourceId, name, isPdf }) => ({
        sourceId,
        name,
        isPdf,
      })),
    };
  }
  return { kind: "text", pastedText: job.pastedText };
}

export function jobViewFromSnapshot(
  snap: ParseHistorySnapshot,
  opts?: { onOpenEmail?: (gmailMessageId: string) => void },
): ParseFinishedJobView {
  if (snap.kind === "gmail") {
    return { kind: "gmail", rows: snap.rows, onOpenEmail: opts?.onOpenEmail };
  }
  if (snap.kind === "receipt") {
    return { kind: "receipt", sources: snap.sources };
  }
  return { kind: "text", pastedText: snap.pastedText };
}

type ParseJobFinishedSummaryProps = {
  job: ParseFinishedJobView;
  results: ParseJobResultRow[];
};

export function ParseJobFinishedSummary({
  job,
  results,
}: ParseJobFinishedSummaryProps) {
  return (
    <>
      {job.kind === "text" && (
        <div className="mb-4 rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 dark:border-zinc-800 dark:bg-zinc-900/40">
          <p className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
            Original text
          </p>
          <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap break-words text-xs text-zinc-800 dark:text-zinc-200">
            {job.pastedText}
          </pre>
        </div>
      )}

      <div className="space-y-2">
        {results.map((row) => {
          const receiptSrc =
            job.kind === "receipt"
              ? job.sources.find((s) => s.sourceId === row.sourceId)
              : undefined;

          return (
            <div
              key={row.sourceId}
              className="rounded-md border border-zinc-200 px-3 py-2 dark:border-zinc-800"
            >
              {job.kind === "gmail" && (
                <div className="flex items-center justify-between gap-3">
                  {job.onOpenEmail ? (
                    <button
                      type="button"
                      onClick={() => job.onOpenEmail?.(row.sourceId)}
                      className="min-w-0 truncate text-left text-sm font-medium hover:underline"
                    >
                      {row.title || "(No subject)"}
                    </button>
                  ) : (
                    <span className="min-w-0 truncate text-sm font-medium">
                      {row.title || "(No subject)"}
                    </span>
                  )}
                  <span className="text-xs text-zinc-500">{row.status}</span>
                </div>
              )}
              {job.kind === "gmail" && row.subtitle && (
                <p className="text-xs text-zinc-500">{row.subtitle}</p>
              )}

              {job.kind === "receipt" && (
                <div className="flex items-center justify-between gap-3">
                  <span className="min-w-0 truncate text-sm font-medium">
                    {row.title}
                  </span>
                  <span className="text-xs text-zinc-500">{row.status}</span>
                </div>
              )}

              {job.kind === "receipt" && receiptSrc?.previewUrl && (
                <div className="mt-2">
                  <ReceiptPreview
                    url={receiptSrc.previewUrl}
                    isPdf={receiptSrc.isPdf}
                    name={receiptSrc.name}
                  />
                </div>
              )}

              {job.kind === "text" && (
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm font-medium">Parse outcome</span>
                  <span className="text-xs text-zinc-500">{row.status}</span>
                </div>
              )}

              {row.status === "parsed" && (
                <div className="mt-1 text-xs text-zinc-600 dark:text-zinc-300">
                  {row.skippedDeclined && (
                    <p className="mb-1 text-zinc-500 dark:text-zinc-400">
                      No charge was posted (declined or failed authorization).
                    </p>
                  )}
                  <p>
                    Created {row.createdCount ?? 0} transaction(s) from{" "}
                    {row.lineCount ?? row.createdCount ?? 0} detected line(s).
                  </p>
                  {row.createdTransactions &&
                    row.createdTransactions.length > 0 && (
                      <ul className="mt-1 list-disc pl-4">
                        {row.createdTransactions.map((tx, idx) => (
                          <li key={`${row.sourceId}-${idx}`}>
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
              {row.status === "duplicate" && (
                <div className="mt-1 text-xs text-zinc-600 dark:text-zinc-300">
                  <p>Already imported — no new transaction created.</p>
                  {row.createdTransactions &&
                    row.createdTransactions.length > 0 && (
                      <ul className="mt-1 list-disc pl-4">
                        {row.createdTransactions.map((tx, idx) => (
                          <li key={`${row.sourceId}-dup-${idx}`}>
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
          );
        })}
      </div>
    </>
  );
}
