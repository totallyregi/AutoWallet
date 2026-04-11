"use client";

import type { GmailFullMessagePreview } from "@/lib/gmail-sync";
import type { GmailConnectionState, GmailTableRow } from "./gmail-types";
import { EmailBodyPreviewDialog } from "./email-body-preview-dialog";
import { signIn } from "next-auth/react";
import { useCallback, useEffect, useState } from "react";

type EmailPreviewState = {
  row: GmailTableRow;
  loading: boolean;
  error: string | null;
  detail: GmailFullMessagePreview | null;
};

type GmailMessagesPreviewProps = {
  googleOAuthEnabled: boolean;
  gmailConnection: GmailConnectionState;
  gmailDisplayEmail: string | null;
  reconnectCallbackUrl: string;
  gmailLoading: boolean;
  onRefresh: () => void;
  rows: GmailTableRow[];
  gmailPagesLength: number;
  gmailPageIndex: number;
  gmailNextToken: string | null;
  gmailCanGoNext: boolean;
  onPrevPage: () => void;
  onNextPage: () => void;
  onParseOne: (gmailMessageId: string) => void;
  parseBusyId: string | null;
  selectedMessageIds: string[];
  maxBatchSelection: number;
  onToggleSelected: (row: GmailTableRow, checked: boolean) => void;
  onToggleSelectPage: (rows: GmailTableRow[], checked: boolean) => void;
  onParseSelected: () => void;
  forceOpenEmailId?: string | null;
  onForceOpenConsumed?: () => void;
  allLoadedRows?: GmailTableRow[];
};

export function GmailMessagesPreview({
  googleOAuthEnabled,
  gmailConnection,
  gmailDisplayEmail,
  reconnectCallbackUrl,
  gmailLoading,
  onRefresh,
  rows,
  gmailPagesLength,
  gmailPageIndex,
  gmailNextToken,
  gmailCanGoNext,
  onPrevPage,
  onNextPage,
  onParseOne,
  parseBusyId,
  selectedMessageIds,
  maxBatchSelection,
  onToggleSelected,
  onToggleSelectPage,
  onParseSelected,
  forceOpenEmailId,
  onForceOpenConsumed,
  allLoadedRows,
}: GmailMessagesPreviewProps) {
  const [emailPreview, setEmailPreview] = useState<EmailPreviewState | null>(
    null,
  );

  const closeEmailPreview = useCallback(() => setEmailPreview(null), []);

  const openEmailPreview = useCallback(async (row: GmailTableRow) => {
    setEmailPreview({ row, loading: true, error: null, detail: null });
    try {
      const res = await fetch(
        `/api/gmail/messages/${encodeURIComponent(row.gmailMessageId)}/preview`,
      );
      const data = (await res.json()) as {
        error?: string;
        bodyText?: string;
      };
      if (!res.ok) throw new Error(data.error ?? "Failed to load email");
      setEmailPreview({
        row,
        loading: false,
        error: null,
        detail: data as GmailFullMessagePreview,
      });
    } catch (e) {
      setEmailPreview({
        row,
        loading: false,
        error: e instanceof Error ? e.message : "Failed to load email",
        detail: null,
      });
    }
  }, []);

  useEffect(() => {
    if (!forceOpenEmailId) return;
    const pool = allLoadedRows && allLoadedRows.length > 0 ? allLoadedRows : rows;
    const row = pool.find((r) => r.gmailMessageId === forceOpenEmailId);
    if (row) {
      void openEmailPreview(row);
      onForceOpenConsumed?.();
    }
  }, [
    allLoadedRows,
    forceOpenEmailId,
    onForceOpenConsumed,
    openEmailPreview,
    rows,
  ]);

  /** Partially parsed emails remain selectable so user can finish parsing. */
  const isSelectableForBatch = (m: GmailTableRow) =>
    (m.parseStatus ?? "open") !== "complete";

  const selectableOnPage = rows.filter(isSelectableForBatch);
  const selectedSelectableOnPage = selectableOnPage.filter((m) =>
    selectedMessageIds.includes(m.gmailMessageId),
  );
  const allPageSelected =
    selectableOnPage.length > 0 &&
    selectedSelectableOnPage.length === selectableOnPage.length;
  const somePageSelected =
    selectedSelectableOnPage.length > 0 && !allPageSelected;
  const atBatchLimit = selectedMessageIds.length >= maxBatchSelection;

  return (
    <>
      <div className="rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
        <div className="flex flex-col gap-4 border-b border-zinc-200 p-5 dark:border-zinc-800 sm:flex-row sm:items-start sm:justify-between sm:p-6">
          <div>
            <h2 className="text-lg font-medium tracking-tight">
              Gmail messages
            </h2>
            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
              Click a row for full text. Use Parse to import into transactions.
            </p>
          </div>
          <button
            type="button"
            onClick={onRefresh}
            disabled={gmailLoading}
            className="h-9 shrink-0 rounded-lg border border-zinc-300 px-3 text-sm font-medium hover:bg-zinc-50 disabled:opacity-60 dark:border-zinc-700 dark:hover:bg-zinc-900/50"
          >
            {gmailLoading ? "Refreshing…" : "Refresh"}
          </button>
        </div>

        {googleOAuthEnabled && (
          <div className="flex flex-col gap-3 border-b border-zinc-200 px-5 py-4 dark:border-zinc-800 sm:flex-row sm:items-center sm:justify-between sm:px-6">
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              {gmailConnection === "connected" && (
                <>
                  <span className="font-medium text-emerald-700 dark:text-emerald-400">
                    Gmail connected
                  </span>
                  {gmailDisplayEmail ? (
                    <> · Inbox: {gmailDisplayEmail}</>
                  ) : (
                    <> · Using your linked Google account</>
                  )}
                </>
              )}
              {gmailConnection === "needs_reconnect" && (
                <>
                  <span className="font-medium text-amber-800 dark:text-amber-200/90">
                    Gmail needs reconnect
                  </span>
                  {gmailDisplayEmail ? (
                    <>
                      {" "}
                      · Signed in as {gmailDisplayEmail}; use the button to grant
                      Gmail access.
                    </>
                  ) : (
                    <> · Use the button to grant Gmail access.</>
                  )}
                </>
              )}
              {gmailConnection === "not_linked" && (
                <>
                  <span className="font-medium text-zinc-800 dark:text-zinc-200">
                    Gmail not linked
                  </span>
                  {gmailDisplayEmail ? (
                    <>
                      {" "}
                      · {gmailDisplayEmail} — sign in with Google or reconnect to
                      link your inbox.
                    </>
                  ) : (
                    <> · Sign in with Google or use Reconnect to link your inbox.</>
                  )}
                </>
              )}
            </p>
            <button
              type="button"
              onClick={() =>
                signIn(
                  "google",
                  { callbackUrl: reconnectCallbackUrl },
                  { prompt: "consent", access_type: "offline" },
                )
              }
              className="h-9 shrink-0 rounded-lg border border-zinc-300 bg-white px-3 text-sm font-medium text-zinc-800 hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
            >
              Reconnect Google (Gmail)
            </button>
          </div>
        )}

        {!googleOAuthEnabled && (
          <p className="border-b border-zinc-200 px-5 py-4 text-sm text-zinc-500 dark:border-zinc-800 dark:text-zinc-400 sm:px-6">
            Google sign-in is not configured on this deployment, so Gmail is
            unavailable.
          </p>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-200 px-5 py-3 dark:border-zinc-800 sm:px-6">
          <div className="flex flex-wrap items-center gap-3">
            <p className="text-xs text-zinc-500">
              {gmailPagesLength > 0
                ? `Page ${gmailPageIndex + 1} of ${gmailPagesLength}${
                    gmailNextToken ? "+" : ""
                  }`
                : null}
            </p>
            <p className="text-xs text-zinc-500">
              Selected: {selectedMessageIds.length}/{maxBatchSelection}
            </p>
            <button
              type="button"
              disabled={selectedMessageIds.length === 0}
              onClick={onParseSelected}
              className="h-8 rounded-md bg-zinc-900 px-3 text-xs font-medium text-white hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
            >
              Parse selected
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={onPrevPage}
              disabled={gmailLoading || gmailPageIndex <= 0}
              className="h-9 rounded-lg border border-zinc-300 px-3 text-sm font-medium hover:bg-zinc-50 disabled:opacity-40 dark:border-zinc-700 dark:hover:bg-zinc-900/50"
            >
              Previous
            </button>
            <button
              type="button"
              onClick={onNextPage}
              disabled={gmailLoading || !gmailCanGoNext}
              className="h-9 rounded-lg border border-zinc-300 px-3 text-sm font-medium hover:bg-zinc-50 disabled:opacity-40 dark:border-zinc-700 dark:hover:bg-zinc-900/50"
            >
              Next
            </button>
          </div>
        </div>

        <div className="overflow-x-auto px-1 pb-1 sm:px-2 sm:pb-2">
          <table className="w-full table-auto text-left text-sm">
            <thead className="border-b border-zinc-200 bg-zinc-50 text-xs uppercase text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900/40">
              <tr>
                <th className="w-[42px] px-3 py-2">
                  <input
                    type="checkbox"
                    checked={allPageSelected}
                    ref={(el) => {
                      if (el) el.indeterminate = somePageSelected;
                    }}
                    onChange={(e) => onToggleSelectPage(rows, e.target.checked)}
                    aria-label="Select all messages on this page"
                  />
                </th>
                <th className="w-[28%] px-3 py-2">From</th>
                <th className="w-[28%] px-3 py-2">Subject</th>
                <th className="w-[20%] px-3 py-2">Date</th>
                <th className="hidden px-3 py-2 2xl:table-cell">Snippet</th>
                <th className="w-[130px] px-3 py-2 text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {gmailLoading ? (
                <tr>
                  <td
                    colSpan={6}
                    className="px-3 py-8 text-center text-zinc-500"
                  >
                    Loading messages…
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    className="px-3 py-8 text-center text-zinc-500"
                  >
                    No messages match your filters.
                  </td>
                </tr>
              ) : (
                rows.map((m) => (
                  <tr
                    key={m.gmailMessageId}
                    tabIndex={0}
                    role="button"
                    aria-label={`Open email preview: ${m.subject || "No subject"}`}
                    onClick={() => void openEmailPreview(m)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        void openEmailPreview(m);
                      }
                    }}
                    className="cursor-pointer border-b border-zinc-100 transition-colors hover:bg-zinc-50 dark:border-zinc-800/80 dark:hover:bg-zinc-900/40"
                  >
                    <td
                      className="px-3 py-2"
                      onClick={(e) => e.stopPropagation()}
                      onKeyDown={(e) => e.stopPropagation()}
                    >
                      <input
                        type="checkbox"
                        checked={selectedMessageIds.includes(m.gmailMessageId)}
                        disabled={
                          !isSelectableForBatch(m) ||
                          (!selectedMessageIds.includes(m.gmailMessageId) &&
                            atBatchLimit)
                        }
                        onChange={(e) => onToggleSelected(m, e.target.checked)}
                        aria-label={`Select ${m.subject || "email"}`}
                      />
                    </td>
                    <td className="max-w-[240px] truncate px-3 py-2">{m.from}</td>
                    <td className="max-w-[240px] truncate px-3 py-2">
                      {m.subject}
                    </td>
                    <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">
                      {m.date ? new Date(m.date).toLocaleString() : "—"}
                    </td>
                    <td className="hidden max-w-[280px] truncate px-3 py-2 text-zinc-600 dark:text-zinc-400 2xl:table-cell">
                      {m.snippet || "—"}
                    </td>
                    <td
                      className="px-3 py-2 text-right"
                      onClick={(e) => e.stopPropagation()}
                      onKeyDown={(e) => e.stopPropagation()}
                    >
                      {m.parseStatus === "complete" ? (
                        <span className="inline-flex h-8 items-center rounded-md border border-emerald-300 bg-emerald-50 px-3 text-xs font-medium text-emerald-700 dark:border-emerald-700/60 dark:bg-emerald-900/20 dark:text-emerald-300">
                          Tracked
                        </span>
                      ) : (
                        <button
                          type="button"
                          disabled={parseBusyId === m.gmailMessageId}
                          onClick={() => onParseOne(m.gmailMessageId)}
                          className={
                            m.parseStatus === "partial"
                              ? "h-8 rounded-md border border-amber-400 bg-amber-50 px-3 text-xs font-medium text-amber-950 hover:bg-amber-100 disabled:opacity-60 dark:border-amber-600 dark:bg-amber-950/40 dark:text-amber-100 dark:hover:bg-amber-900/50"
                              : "h-8 rounded-md bg-zinc-900 px-3 text-xs font-medium text-white hover:bg-zinc-800 disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900"
                          }
                        >
                          {parseBusyId === m.gmailMessageId
                            ? "Parsing…"
                            : m.parseStatus === "partial"
                              ? "Parse (Partially)"
                              : "Parse"}
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {emailPreview && (
        <EmailBodyPreviewDialog
          key={emailPreview.row.gmailMessageId}
          open
          onClose={closeEmailPreview}
          loading={emailPreview.loading}
          error={emailPreview.error}
          detail={emailPreview.detail}
          fallbackSubject={emailPreview.row.subject}
          fallbackFrom={emailPreview.row.from}
          fallbackDate={emailPreview.row.date}
        />
      )}
    </>
  );
}
