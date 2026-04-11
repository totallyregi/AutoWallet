"use client";

import { ParseJobFinishedSummary, jobViewFromParseJobConfig } from "./parse-job-finished-summary";
import type { ParseJobConfig, ParseJobResultRow } from "./parse-job-types";

export type {
  ParseJobConfig,
  ParseJobResultLine,
  ParseJobResultRow,
  ReceiptParseSource,
} from "./parse-job-types";

type ParseJobModalProps = {
  open: boolean;
  running: boolean;
  done: number;
  total: number;
  currentLabel?: string;
  results: ParseJobResultRow[];
  job: ParseJobConfig | null;
  onClose: () => void;
};

function modalTitles(
  job: ParseJobConfig | null,
  running: boolean,
  total: number,
): { title: string } {
  if (!job) return { title: running ? "Parsing…" : "Parse result" };
  if (job.kind === "gmail") {
    if (running) {
      return {
        title: total === 1 ? "Parsing email…" : "Parsing selected emails…",
      };
    }
    return {
      title: total === 1 ? "Parse result" : "Batch parse results",
    };
  }
  if (job.kind === "receipt") {
    if (running) {
      return {
        title: total === 1 ? "Parsing receipt…" : "Parsing receipts…",
      };
    }
    return { title: total === 1 ? "Parse result" : "Parse results" };
  }
  if (running) return { title: "Parsing text…" };
  return { title: "Parse result" };
}

function ReceiptPreview({
  url,
  isPdf,
  name,
  compact,
}: {
  url: string;
  isPdf: boolean;
  name: string;
  compact?: boolean;
}) {
  if (isPdf) {
    return (
      <iframe
        src={url}
        title={name}
        className={
          compact
            ? "h-16 w-full max-w-[120px] rounded border border-zinc-200 dark:border-zinc-700"
            : "h-48 w-full rounded border border-zinc-200 dark:border-zinc-700"
        }
      />
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element -- blob object URL previews
    <img
      src={url}
      alt=""
      className={
        compact
          ? "h-12 w-12 rounded border border-zinc-200 object-cover dark:border-zinc-700"
          : "max-h-48 w-full max-w-md rounded border border-zinc-200 object-contain dark:border-zinc-700"
      }
    />
  );
}

export function ParseJobModal({
  open,
  running,
  done,
  total,
  currentLabel,
  results,
  job,
  onClose,
}: ParseJobModalProps) {
  if (!open || !job) return null;

  const percent = total > 0 ? Math.round((done / total) * 100) : 0;
  const hasFinished = !running && total > 0 && done >= total;
  const { title } = modalTitles(job, running, total);

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-black/50 p-4 sm:items-center"
      role="presentation"
      onClick={!running ? onClose : undefined}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="parse-job-title"
        className="flex max-h-[88vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-xl dark:border-zinc-700 dark:bg-zinc-950"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-zinc-200 px-5 py-4 dark:border-zinc-800">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3
                id="parse-job-title"
                className="text-lg font-semibold text-zinc-900 dark:text-zinc-100"
              >
                {title}
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
          {!hasFinished && job.kind === "gmail" && (
            <ul className="space-y-2">
              {job.rows.map((row) => (
                <li
                  key={row.gmailMessageId}
                  className="flex items-center justify-between gap-3 rounded-md border border-zinc-200 px-3 py-2 text-sm dark:border-zinc-800"
                >
                  <button
                    type="button"
                    onClick={() => job.onOpenEmail(row.gmailMessageId)}
                    className="min-w-0 flex-1 truncate text-left hover:underline"
                  >
                    {row.subject || "(No subject)"}
                  </button>
                  <span className="text-xs text-zinc-500">
                    {results.find((r) => r.sourceId === row.gmailMessageId)
                      ? "Processed"
                      : "Pending"}
                  </span>
                </li>
              ))}
            </ul>
          )}

          {!hasFinished && job.kind === "receipt" && (
            <ul className="space-y-2">
              {job.sources.map((src) => (
                <li
                  key={src.id}
                  className="flex items-center gap-3 rounded-md border border-zinc-200 px-3 py-2 text-sm dark:border-zinc-800"
                >
                  <ReceiptPreview
                    url={src.previewUrl}
                    isPdf={src.isPdf}
                    name={src.name}
                    compact
                  />
                  <span className="min-w-0 flex-1 truncate font-medium">
                    {src.name}
                  </span>
                  <span className="text-xs text-zinc-500">
                    {results.find((r) => r.sourceId === src.id)
                      ? "Processed"
                      : "Pending"}
                  </span>
                </li>
              ))}
            </ul>
          )}

          {!hasFinished && job.kind === "text" && (
            <ul className="space-y-2">
              <li className="rounded-md border border-zinc-200 px-3 py-2 text-sm dark:border-zinc-800">
                <span className="font-medium">Pasted content</span>
                <span className="ml-2 text-xs text-zinc-500">
                  {results.length > 0 ? "Processed" : "Pending"}
                </span>
              </li>
            </ul>
          )}

          {hasFinished && (
            <ParseJobFinishedSummary
              job={jobViewFromParseJobConfig(job)}
              results={results}
            />
          )}
        </div>
      </div>
    </div>
  );
}
