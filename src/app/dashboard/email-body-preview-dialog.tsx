"use client";

import type { GmailFullMessagePreview } from "@/lib/gmail-sync";
import { useEffect, useState } from "react";

type EmailBodyPreviewDialogProps = {
  open: boolean;
  onClose: () => void;
  loading: boolean;
  error: string | null;
  detail: GmailFullMessagePreview | null;
  /** Shown in header while loading or if detail headers missing */
  fallbackSubject?: string | null;
  fallbackFrom?: string | null;
  fallbackDate?: string | null;
};

export function EmailBodyPreviewDialog({
  open,
  onClose,
  loading,
  error,
  detail,
  fallbackSubject,
  fallbackFrom,
  fallbackDate,
}: EmailBodyPreviewDialogProps) {
  const [previewMode, setPreviewMode] = useState<"html" | "text">("html");

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const subject =
    detail?.subject || fallbackSubject || "(No subject)";
  const from = detail?.from || fallbackFrom || "—";
  const dateStr = detail?.date || fallbackDate;

  return (
    <div
      className="fixed inset-0 z-[70] flex items-end justify-center bg-black/50 p-4 backdrop-blur-[1px] sm:items-center"
      role="presentation"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="email-body-preview-title"
        className="flex max-h-[88vh] w-full max-w-3xl flex-col overflow-hidden aw-pop rounded-2xl border border-zinc-200 bg-white shadow-2xl dark:border-zinc-700 dark:bg-[#0c1311]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-start justify-between gap-4 border-b border-zinc-200 px-5 py-4 dark:border-zinc-800">
          <div className="min-w-0 flex-1">
            <h3
              id="email-body-preview-title"
              className="text-lg font-semibold leading-snug text-zinc-900 dark:text-zinc-100"
            >
              {subject}
            </h3>
            <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
              <span className="block truncate">From: {from}</span>
              <span className="mt-0.5 block">
                Date:{" "}
                {dateStr ? new Date(dateStr).toLocaleString() : "—"}
              </span>
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-lg border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-200 dark:hover:bg-zinc-800"
          >
            Close
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {loading && (
            <p className="text-sm text-zinc-500">Loading full message…</p>
          )}
          {error && (
            <p className="text-sm text-red-600 dark:text-red-400" role="alert">
              {error}
            </p>
          )}
          {!loading && !error && detail && (
            <div className="space-y-4">
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setPreviewMode("html")}
                  className={`rounded-md px-2.5 py-1 text-xs font-medium ${
                    previewMode === "html"
                      ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                      : "border border-zinc-300 text-zinc-700 dark:border-zinc-700 dark:text-zinc-300"
                  }`}
                >
                  HTML view
                </button>
                <button
                  type="button"
                  onClick={() => setPreviewMode("text")}
                  className={`rounded-md px-2.5 py-1 text-xs font-medium ${
                    previewMode === "text"
                      ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                      : "border border-zinc-300 text-zinc-700 dark:border-zinc-700 dark:text-zinc-300"
                  }`}
                >
                  Text view
                </button>
              </div>
              {detail.snippet && (
                <div>
                  <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-zinc-500">
                    Snippet
                  </p>
                  <p className="text-sm text-zinc-600 dark:text-zinc-400">
                    {detail.snippet}
                  </p>
                </div>
              )}
              <div>
                {previewMode === "html" && detail.bodyHtmlSanitized ? (
                  <div>
                    <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-zinc-500">
                      Body (sanitized HTML)
                    </p>
                    <div
                      className="prose prose-sm max-w-none overflow-x-auto rounded-md border border-zinc-200 p-3 dark:prose-invert dark:border-zinc-800"
                      dangerouslySetInnerHTML={{
                        __html: detail.bodyHtmlSanitized,
                      }}
                    />
                  </div>
                ) : (
                  <div>
                    <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-zinc-500">
                      Body (plain text)
                    </p>
                    <pre className="whitespace-pre-wrap break-words font-sans text-sm leading-relaxed text-zinc-800 dark:text-zinc-200">
                      {detail.bodyText.trim() ||
                        "No text body could be extracted (try HTML-only message)."}
                    </pre>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
