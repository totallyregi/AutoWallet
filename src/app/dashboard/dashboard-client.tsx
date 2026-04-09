"use client";

import type { GmailFullMessagePreview } from "@/lib/gmail-sync";
import type { TransactionJson } from "@/lib/transaction-json";
import { signIn } from "next-auth/react";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
} from "recharts";

const COLORS = [
  "#0ea5e9",
  "#8b5cf6",
  "#f97316",
  "#22c55e",
  "#eab308",
  "#ec4899",
  "#64748b",
];

const TABS = [
  { id: "overview", label: "Overview" },
  { id: "gmail", label: "Gmail" },
  { id: "capture", label: "Capture" },
  { id: "transactions", label: "Transactions" },
] as const;

const MONTH_OPTIONS = [
  { value: 1, label: "January" },
  { value: 2, label: "February" },
  { value: 3, label: "March" },
  { value: 4, label: "April" },
  { value: 5, label: "May" },
  { value: 6, label: "June" },
  { value: 7, label: "July" },
  { value: 8, label: "August" },
  { value: 9, label: "September" },
  { value: 10, label: "October" },
  { value: 11, label: "November" },
  { value: 12, label: "December" },
] as const;

type Summary = {
  total: number;
  byCategory: {
    slug: string;
    name: string;
    amount: number;
    percentage: number;
  }[];
};

type GmailMessagePreview = {
  gmailMessageId: string;
  from: string;
  subject: string;
  date: string;
  messageId: string;
  snippet: string;
  tracked?: boolean;
};

export type GmailConnectionState =
  | "oauth_disabled"
  | "not_linked"
  | "needs_reconnect"
  | "connected";

export function DashboardClient({
  googleOAuthEnabled,
  gmailConnection,
  gmailDisplayEmail,
}: {
  googleOAuthEnabled: boolean;
  gmailConnection: GmailConnectionState;
  gmailDisplayEmail: string | null;
}) {
  const [activeTab, setActiveTab] = useState<(typeof TABS)[number]["id"]>(
    "overview",
  );
  const [spendYear, setSpendYear] = useState(() => new Date().getFullYear());
  const [spendMonth, setSpendMonth] = useState(() => new Date().getMonth() + 1);
  const [transactions, setTransactions] = useState<TransactionJson[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const [pasteBusy, setPasteBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [senderEmail, setSenderEmail] = useState("");
  const [senderBusy, setSenderBusy] = useState(false);
  const [syncBusy, setSyncBusy] = useState(false);
  const [gmailLoading, setGmailLoading] = useState(false);
  const [gmailAfter, setGmailAfter] = useState("");
  const [gmailBefore, setGmailBefore] = useState("");
  const [gmailSearch, setGmailSearch] = useState("");
  const [gmailPages, setGmailPages] = useState<GmailMessagePreview[][]>([]);
  const [gmailPageIndex, setGmailPageIndex] = useState(0);
  const [gmailNextToken, setGmailNextToken] = useState<string | null>(null);
  const [parseBusyId, setParseBusyId] = useState<string | null>(null);
  const [deleteBusyId, setDeleteBusyId] = useState<string | null>(null);

  type EmailPreviewState = {
    row: GmailMessagePreview;
    loading: boolean;
    error: string | null;
    detail: GmailFullMessagePreview | null;
  };
  const [emailPreview, setEmailPreview] = useState<EmailPreviewState | null>(
    null,
  );

  function closeEmailPreview() {
    setEmailPreview(null);
  }

  async function openEmailPreview(row: GmailMessagePreview) {
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
  }

  useEffect(() => {
    if (!emailPreview) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setEmailPreview(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [emailPreview]);

  const range = useMemo(() => {
    const from = new Date(spendYear, spendMonth - 1, 1, 0, 0, 0, 0);
    const to = new Date(spendYear, spendMonth, 0, 23, 59, 59, 999);
    return { from: from.toISOString(), to: to.toISOString() };
  }, [spendYear, spendMonth]);

  const gmailRows = gmailPages[gmailPageIndex] ?? [];

  const fetchGmailMessagesPage = useCallback(
    async (
      pageToken: string | null,
      opts: { after: string; before: string; search: string },
    ) => {
      const p = new URLSearchParams();
      if (opts.after) p.set("after", opts.after);
      if (opts.before) p.set("before", opts.before);
      if (opts.search.trim()) p.set("search", opts.search.trim());
      if (pageToken) p.set("pageToken", pageToken);
      const res = await fetch(`/api/gmail/messages?${p}`);
      const data = (await res.json()) as {
        messages?: GmailMessagePreview[];
        nextPageToken?: string | null;
        error?: string;
      };
      if (!res.ok) throw new Error(data.error ?? "Failed to load Gmail");
      return {
        messages: data.messages ?? [],
        nextPageToken: data.nextPageToken ?? null,
      };
    },
    [],
  );

  const loadGmailReset = useCallback(async () => {
    setGmailLoading(true);
    try {
      const { messages, nextPageToken } = await fetchGmailMessagesPage(null, {
        after: gmailAfter,
        before: gmailBefore,
        search: gmailSearch,
      });
      setGmailPages([messages]);
      setGmailPageIndex(0);
      setGmailNextToken(nextPageToken);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Failed to load Gmail");
    } finally {
      setGmailLoading(false);
    }
  }, [gmailAfter, gmailBefore, gmailSearch, fetchGmailMessagesPage]);

  const fetchAndAppendGmailPage = useCallback(async () => {
    if (!gmailNextToken) return;
    setGmailLoading(true);
    try {
      const { messages, nextPageToken } = await fetchGmailMessagesPage(
        gmailNextToken,
        { after: gmailAfter, before: gmailBefore, search: gmailSearch },
      );
      setGmailPages((prev) => [...prev, messages]);
      setGmailPageIndex((i) => i + 1);
      setGmailNextToken(nextPageToken);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Failed to load Gmail");
    } finally {
      setGmailLoading(false);
    }
  }, [
    gmailNextToken,
    gmailAfter,
    gmailBefore,
    gmailSearch,
    fetchGmailMessagesPage,
  ]);

  function goGmailNext() {
    if (gmailPageIndex < gmailPages.length - 1) {
      setGmailPageIndex((i) => i + 1);
      return;
    }
    void fetchAndAppendGmailPage();
  }

  function goGmailPrev() {
    setGmailPageIndex((i) => Math.max(0, i - 1));
  }

  const gmailCanGoNext =
    gmailPageIndex < gmailPages.length - 1 ||
    (gmailPageIndex === gmailPages.length - 1 && Boolean(gmailNextToken));

  const load = useCallback(async (options?: { preserveMessage?: boolean }) => {
    setLoading(true);
    if (!options?.preserveMessage) setMessage(null);
    try {
      const q = `from=${encodeURIComponent(range.from)}&to=${encodeURIComponent(range.to)}`;
      const [tRes, sRes] = await Promise.all([
        fetch(`/api/transactions?${q}`),
        fetch(`/api/transactions/summary?${q}`),
      ]);
      if (!tRes.ok || !sRes.ok) throw new Error("Failed to load");
      const tJson = (await tRes.json()) as { transactions: TransactionJson[] };
      const sJson = (await sRes.json()) as Summary;
      setTransactions(tJson.transactions);
      setSummary(sJson);
    } catch {
      setMessage("Could not load data. Check your session and database.");
    } finally {
      setLoading(false);
    }
  }, [range.from, range.to]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch("/api/gmail/sender");
        if (res.ok) {
          const data = (await res.json()) as { sender?: string };
          setSenderEmail(data.sender ?? "");
        }
      } catch {
        // Ignore settings fetch errors; user can still use app.
      }
      setGmailLoading(true);
      try {
        const { messages, nextPageToken } = await fetchGmailMessagesPage(null, {
          after: "",
          before: "",
          search: "",
        });
        setGmailPages([messages]);
        setGmailPageIndex(0);
        setGmailNextToken(nextPageToken);
      } catch (err) {
        setMessage(err instanceof Error ? err.message : "Failed to load Gmail");
      } finally {
        setGmailLoading(false);
      }
    })();
  }, [fetchGmailMessagesPage]);

  async function onUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setMessage(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/upload/receipt", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Upload failed");
      setMessage("Receipt processed and saved.");
      await load();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  }

  async function onPaste(e: React.FormEvent) {
    e.preventDefault();
    if (!pasteText.trim()) return;
    setPasteBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/ingest/paste", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: pasteText }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Paste failed");
      setMessage(
        data.duplicate ? "That text was already imported." : "Email text imported.",
      );
      setPasteText("");
      await load();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Paste failed");
    } finally {
      setPasteBusy(false);
    }
  }

  async function onSaveSender(e: React.FormEvent) {
    e.preventDefault();
    setSenderBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/gmail/sender", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sender: senderEmail.trim() }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Failed to save sender");
      setMessage(
        senderEmail.trim()
          ? `Saved sender filter: ${senderEmail.trim().toLowerCase()}`
          : "Cleared sender filter. Sync will scan recent emails.",
      );
      await loadGmailReset();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Failed to save sender");
    } finally {
      setSenderBusy(false);
    }
  }

  async function onSyncGmailNow() {
    setSyncBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/gmail/sync", { method: "POST" });
      const data = (await res.json()) as {
        created?: number;
        skipped?: number;
        errors?: string[];
        error?: string;
      };
      if (!res.ok) throw new Error(data.error ?? "Gmail sync failed");
      const errCount = data.errors?.length ?? 0;
      setMessage(
        `Gmail sync complete. Created ${data.created ?? 0}, skipped ${data.skipped ?? 0}, errors ${errCount}.`,
      );
      await load();
      await loadGmailReset();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Gmail sync failed");
    } finally {
      setSyncBusy(false);
    }
  }

  async function onParseOne(gmailMessageId: string) {
    setParseBusyId(gmailMessageId);
    setMessage(null);
    try {
      const res = await fetch("/api/gmail/parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gmailMessageId }),
      });
      const data = (await res.json()) as {
        created?: boolean;
        duplicate?: boolean;
        createdCount?: number;
        lineCount?: number;
        error?: string;
      };
      if (!res.ok) throw new Error(data.error ?? "Failed to parse email");
      if (data.duplicate) {
        setMessage("Email already parsed earlier.");
      } else if ((data.createdCount ?? 0) > 1) {
        setMessage(
          `Parsed email: created ${data.createdCount} transactions (${data.lineCount ?? data.createdCount} lines detected).`,
        );
      } else {
        setMessage("Parsed email successfully. It is now tracked.");
      }
      setGmailPages((pages) =>
        pages.map((pg) =>
          pg.some((m) => m.gmailMessageId === gmailMessageId)
            ? pg.map((m) =>
                m.gmailMessageId === gmailMessageId
                  ? { ...m, tracked: true }
                  : m,
              )
            : pg,
        ),
      );
      await load({ preserveMessage: true });
      await loadGmailReset();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Failed to parse email");
    } finally {
      setParseBusyId(null);
    }
  }

  async function onDeleteTransaction(id: string) {
    const ok = window.confirm(
      "Delete this transaction? Its source email will become untracked and can be parsed again.",
    );
    if (!ok) return;
    setDeleteBusyId(id);
    setMessage(null);
    try {
      const res = await fetch(`/api/transactions/${id}`, { method: "DELETE" });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Failed to delete transaction");
      setMessage("Transaction deleted.");
      await load();
      await loadGmailReset();
    } catch (err) {
      setMessage(
        err instanceof Error ? err.message : "Failed to delete transaction",
      );
    } finally {
      setDeleteBusyId(null);
    }
  }

  const chartData =
    summary?.byCategory.map((b) => ({
      name: b.name,
      value: b.amount,
    })) ?? [];

  const tabButtonClass = (tabId: (typeof TABS)[number]["id"]) =>
    `rounded-xl px-3 py-2 text-sm font-medium transition-all duration-200 ${
      activeTab === tabId
        ? "bg-zinc-900 text-white shadow-sm dark:bg-zinc-100 dark:text-zinc-900"
        : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
    }`;

  return (
    <div
      className={`grid gap-6 ${
        activeTab === "overview" ? "xl:grid-cols-[250px_minmax(0,1fr)]" : ""
      }`}
    >
      {activeTab === "overview" && (
        <aside className="rounded-2xl border border-zinc-200 bg-white p-3 shadow-sm dark:border-zinc-800 dark:bg-zinc-950 xl:sticky xl:top-6 xl:h-fit">
          <p className="px-3 pb-3 pt-1 text-xs font-semibold uppercase tracking-wide text-zinc-500">
            Workspace
          </p>
          <nav className="grid gap-1">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`${tabButtonClass(tab.id)} text-left`}
              >
                {tab.label}
              </button>
            ))}
          </nav>
        </aside>
      )}

      <div className="space-y-6">
        {activeTab !== "overview" && (
          <nav className="flex flex-wrap gap-2 rounded-2xl border border-zinc-200 bg-white p-3 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={tabButtonClass(tab.id)}
              >
                {tab.label}
              </button>
            ))}
          </nav>
        )}

        {activeTab === "overview" && (
          <header className="flex flex-col gap-4 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
              <p className="text-sm text-zinc-600 dark:text-zinc-400">
                Spending totals and charts use the calendar month you select below.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <label className="flex flex-col gap-1 text-xs font-medium text-zinc-500">
                Month
                <select
                  className="h-10 min-w-[140px] rounded-lg border border-zinc-300 bg-white px-3 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                  value={spendMonth}
                  onChange={(e) => setSpendMonth(Number(e.target.value))}
                >
                  {MONTH_OPTIONS.map((m) => (
                    <option key={m.value} value={m.value}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1 text-xs font-medium text-zinc-500">
                Year
                <input
                  type="number"
                  min={2000}
                  max={2100}
                  className="h-10 w-24 rounded-lg border border-zinc-300 bg-white px-3 text-sm tabular-nums dark:border-zinc-700 dark:bg-zinc-950"
                  value={spendYear}
                  onChange={(e) =>
                    setSpendYear(
                      Math.min(
                        2100,
                        Math.max(2000, Number(e.target.value) || spendYear),
                      ),
                    )
                  }
                />
              </label>
            </div>
          </header>
        )}

        {message && (
          <p className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm dark:border-zinc-800 dark:bg-zinc-900/50">
            {message}
          </p>
        )}

        {activeTab === "overview" && (
          <section className="fade-slide-in grid gap-6 lg:grid-cols-2">
            <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
              <h2 className="mb-1 text-lg font-medium">Total spend</h2>
              <p className="text-3xl font-semibold tabular-nums">
                {loading
                  ? "…"
                  : new Intl.NumberFormat(undefined, {
                      style: "currency",
                      currency: "USD",
                    }).format(summary?.total ?? 0)}
              </p>
              <p className="mt-2 text-xs text-zinc-500">
                Range: {new Date(range.from).toLocaleDateString()} —{" "}
                {new Date(range.to).toLocaleDateString()}
              </p>
            </div>
            <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
              <h2 className="mb-4 text-lg font-medium">By category</h2>
              <div className="h-64 w-full">
                {!loading && chartData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={chartData}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        innerRadius={50}
                        outerRadius={90}
                        paddingAngle={2}
                      >
                        {chartData.map((_, i) => (
                          <Cell key={i} fill={COLORS[i % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip
                        formatter={(value) =>
                          new Intl.NumberFormat(undefined, {
                            style: "currency",
                            currency: "USD",
                          }).format(Number(value ?? 0))
                        }
                      />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex h-full items-center justify-center text-sm text-zinc-500">
                    {loading ? "Loading chart…" : "No data in this range"}
                  </div>
                )}
              </div>
              {summary && summary.byCategory.length > 0 && (
                <ul className="mt-4 space-y-2 text-sm">
                  {summary.byCategory.map((b) => (
                    <li key={b.slug + b.name} className="flex justify-between gap-4">
                      <span className="text-zinc-700 dark:text-zinc-300">{b.name}</span>
                      <span className="tabular-nums text-zinc-600 dark:text-zinc-400">
                        {b.percentage}% ·{" "}
                        {new Intl.NumberFormat(undefined, {
                          style: "currency",
                          currency: "USD",
                        }).format(b.amount)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>
        )}

        {activeTab === "gmail" && (
          <section className="fade-slide-in space-y-6">
            <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
              <h2 className="mb-3 text-lg font-medium">Gmail bank sender filter</h2>
              <p className="mb-4 text-sm text-zinc-600 dark:text-zinc-400">
                Enter a sender email (for example, alerts@yourbank.com). Sync only processes recent messages from this sender.
              </p>
              <form onSubmit={onSaveSender} className="flex flex-col gap-3 sm:flex-row">
                <input
                  className="h-10 flex-1 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
                  placeholder="alerts@yourbank.com"
                  type="email"
                  value={senderEmail}
                  onChange={(e) => setSenderEmail(e.target.value)}
                />
                <button
                  type="submit"
                  disabled={senderBusy}
                  className="h-10 rounded-lg bg-zinc-900 px-4 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900"
                >
                  {senderBusy ? "Saving..." : "Save sender"}
                </button>
                <button
                  type="button"
                  disabled={syncBusy}
                  onClick={onSyncGmailNow}
                  className="h-10 rounded-lg border border-zinc-300 px-4 text-sm font-medium hover:bg-zinc-50 disabled:opacity-60 dark:border-zinc-700 dark:hover:bg-zinc-900/50"
                >
                  {syncBusy ? "Syncing..." : "Sync Gmail now"}
                </button>
              </form>
            </div>

            <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
              <div className="mb-4 flex flex-col gap-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <h2 className="text-lg font-medium">Gmail messages preview</h2>
                    <p className="text-sm text-zinc-600 dark:text-zinc-400">
                      Review messages before parsing. Click a row to open the full email text.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void loadGmailReset()}
                    disabled={gmailLoading}
                    className="h-9 shrink-0 rounded-lg border border-zinc-300 px-3 text-sm font-medium hover:bg-zinc-50 disabled:opacity-60 dark:border-zinc-700 dark:hover:bg-zinc-900/50"
                  >
                    {gmailLoading ? "Refreshing..." : "Refresh list"}
                  </button>
                </div>

                <div className="flex flex-col gap-3 border-t border-zinc-200 pt-4 dark:border-zinc-800 sm:flex-row sm:flex-wrap sm:items-end">
                  <label className="flex flex-col gap-1 text-xs font-medium text-zinc-500">
                    After (optional)
                    <input
                      type="date"
                      className="h-9 rounded-lg border border-zinc-300 bg-white px-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
                      value={gmailAfter}
                      onChange={(e) => setGmailAfter(e.target.value)}
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-xs font-medium text-zinc-500">
                    Before (optional)
                    <input
                      type="date"
                      className="h-9 rounded-lg border border-zinc-300 bg-white px-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
                      value={gmailBefore}
                      onChange={(e) => setGmailBefore(e.target.value)}
                    />
                  </label>
                  <label className="min-w-[160px] flex-1 flex flex-col gap-1 text-xs font-medium text-zinc-500">
                    Search (Gmail query)
                    <input
                      className="h-9 w-full rounded-lg border border-zinc-300 bg-white px-3 text-sm dark:border-zinc-700 dark:bg-zinc-950"
                      placeholder="e.g. receipt OR alert"
                      value={gmailSearch}
                      onChange={(e) => setGmailSearch(e.target.value)}
                    />
                  </label>
                  <button
                    type="button"
                    onClick={() => void loadGmailReset()}
                    disabled={gmailLoading}
                    className="h-9 rounded-lg bg-zinc-900 px-4 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900"
                  >
                    Apply filters
                  </button>
                </div>

                {googleOAuthEnabled && (
                  <div className="flex flex-col gap-3 border-t border-zinc-200 pt-4 sm:flex-row sm:items-center sm:justify-between dark:border-zinc-800">
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
                            <> · Signed in as {gmailDisplayEmail}; use the button to grant Gmail access.</>
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
                            <> · {gmailDisplayEmail} — sign in with Google or reconnect to link your inbox.</>
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
                          { callbackUrl: "/dashboard" },
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
                  <p className="border-t border-zinc-200 pt-4 text-sm text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
                    Google sign-in is not configured on this deployment, so Gmail sync is unavailable.
                  </p>
                )}

                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-zinc-200 pt-4 dark:border-zinc-800">
                  <p className="text-xs text-zinc-500">
                    {gmailPages.length > 0
                      ? `Page ${gmailPageIndex + 1} of ${gmailPages.length}${
                          gmailNextToken ? "+" : ""
                        }`
                      : null}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={goGmailPrev}
                      disabled={gmailLoading || gmailPageIndex <= 0}
                      className="h-9 rounded-lg border border-zinc-300 px-3 text-sm font-medium hover:bg-zinc-50 disabled:opacity-40 dark:border-zinc-700 dark:hover:bg-zinc-900/50"
                    >
                      Previous
                    </button>
                    <button
                      type="button"
                      onClick={goGmailNext}
                      disabled={gmailLoading || !gmailCanGoNext}
                      className="h-9 rounded-lg border border-zinc-300 px-3 text-sm font-medium hover:bg-zinc-50 disabled:opacity-40 dark:border-zinc-700 dark:hover:bg-zinc-900/50"
                    >
                      Next
                    </button>
                  </div>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full table-auto text-left text-sm">
                  <thead className="border-b border-zinc-200 bg-zinc-50 text-xs uppercase text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900/40">
                    <tr>
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
                        <td colSpan={5} className="px-3 py-4 text-center text-zinc-500">
                          Loading Gmail messages...
                        </td>
                      </tr>
                    ) : gmailRows.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="px-3 py-4 text-center text-zinc-500">
                          No Gmail messages matched your filters (sender, dates, and search).
                        </td>
                      </tr>
                    ) : (
                      gmailRows.map((m) => (
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
                          <td className="max-w-[240px] truncate px-3 py-2">{m.from}</td>
                          <td className="max-w-[240px] truncate px-3 py-2">{m.subject}</td>
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
                            {m.tracked ? (
                              <span className="inline-flex h-8 items-center rounded-md border border-emerald-300 bg-emerald-50 px-3 text-xs font-medium text-emerald-700 dark:border-emerald-700/60 dark:bg-emerald-900/20 dark:text-emerald-300">
                                Tracked
                              </span>
                            ) : (
                              <button
                                type="button"
                                disabled={parseBusyId === m.gmailMessageId}
                                onClick={() => void onParseOne(m.gmailMessageId)}
                                className="h-8 rounded-md bg-zinc-900 px-3 text-xs font-medium text-white hover:bg-zinc-800 disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900"
                              >
                                {parseBusyId === m.gmailMessageId ? "Parsing..." : "Parse"}
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
              <div
                className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 backdrop-blur-[1px] sm:items-center"
                role="presentation"
                onClick={closeEmailPreview}
              >
                <div
                  role="dialog"
                  aria-modal="true"
                  aria-labelledby="email-preview-title"
                  className="flex max-h-[88vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-xl dark:border-zinc-700 dark:bg-zinc-950"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="flex shrink-0 items-start justify-between gap-4 border-b border-zinc-200 px-5 py-4 dark:border-zinc-800">
                    <div className="min-w-0 flex-1">
                      <h3
                        id="email-preview-title"
                        className="text-lg font-semibold leading-snug text-zinc-900 dark:text-zinc-100"
                      >
                        {emailPreview.detail?.subject ||
                          emailPreview.row.subject ||
                          "(No subject)"}
                      </h3>
                      <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
                        <span className="block truncate">
                          From:{" "}
                          {emailPreview.detail?.from || emailPreview.row.from || "—"}
                        </span>
                        <span className="mt-0.5 block">
                          Date:{" "}
                          {emailPreview.detail?.date || emailPreview.row.date
                            ? new Date(
                                emailPreview.detail?.date || emailPreview.row.date,
                              ).toLocaleString()
                            : "—"}
                        </span>
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={closeEmailPreview}
                      className="shrink-0 rounded-lg border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-200 dark:hover:bg-zinc-800"
                    >
                      Close
                    </button>
                  </div>
                  <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
                    {emailPreview.loading && (
                      <p className="text-sm text-zinc-500">Loading full message…</p>
                    )}
                    {emailPreview.error && (
                      <p className="text-sm text-red-600 dark:text-red-400" role="alert">
                        {emailPreview.error}
                      </p>
                    )}
                    {!emailPreview.loading &&
                      !emailPreview.error &&
                      emailPreview.detail && (
                        <div className="space-y-4">
                          {emailPreview.detail.snippet && (
                            <div>
                              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-zinc-500">
                                Snippet
                              </p>
                              <p className="text-sm text-zinc-600 dark:text-zinc-400">
                                {emailPreview.detail.snippet}
                              </p>
                            </div>
                          )}
                          <div>
                            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-zinc-500">
                              Body (plain text)
                            </p>
                            <pre className="whitespace-pre-wrap break-words font-sans text-sm leading-relaxed text-zinc-800 dark:text-zinc-200">
                              {emailPreview.detail.bodyText.trim() ||
                                "No text body could be extracted (try HTML-only message)."}
                            </pre>
                          </div>
                        </div>
                      )}
                  </div>
                </div>
              </div>
            )}
          </section>
        )}

        {activeTab === "capture" && (
          <section className="fade-slide-in grid gap-6 lg:grid-cols-2">
            <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
              <h2 className="mb-3 text-lg font-medium">Upload receipt</h2>
              <p className="mb-4 text-sm text-zinc-600 dark:text-zinc-400">
                Photo or screenshot — Gemini reads amount and merchant.
              </p>
              <label className="inline-flex cursor-pointer items-center justify-center rounded-lg border border-dashed border-zinc-300 px-4 py-8 text-sm font-medium hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-900/50">
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  disabled={uploading}
                  onChange={onUpload}
                />
                {uploading ? "Processing…" : "Choose image"}
              </label>
            </div>
            <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
              <h2 className="mb-3 text-lg font-medium">Paste bank email</h2>
              <p className="mb-4 text-sm text-zinc-600 dark:text-zinc-400">
                Paste notification text for testing without webhook forwarding.
              </p>
              <form onSubmit={onPaste} className="flex flex-col gap-3">
                <textarea
                  className="min-h-[120px] w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
                  placeholder="Subject: …"
                  value={pasteText}
                  onChange={(e) => setPasteText(e.target.value)}
                />
                <button
                  type="submit"
                  disabled={pasteBusy}
                  className="h-10 rounded-lg bg-zinc-900 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900"
                >
                  {pasteBusy ? "Importing…" : "Import from text"}
                </button>
              </form>
            </div>
          </section>
        )}

        {activeTab === "transactions" && (
          <section className="fade-slide-in rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
            <div className="flex flex-col gap-4 border-b border-zinc-200 px-6 py-4 dark:border-zinc-800 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h2 className="text-lg font-medium">Transactions</h2>
                <p className="mt-1 text-xs text-zinc-500">
                  {new Date(range.from).toLocaleDateString()} —{" "}
                  {new Date(range.to).toLocaleDateString()}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <label className="flex flex-col gap-1 text-xs font-medium text-zinc-500">
                  Month
                  <select
                    className="h-9 min-w-[130px] rounded-lg border border-zinc-300 bg-white px-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
                    value={spendMonth}
                    onChange={(e) => setSpendMonth(Number(e.target.value))}
                  >
                    {MONTH_OPTIONS.map((m) => (
                      <option key={m.value} value={m.value}>
                        {m.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1 text-xs font-medium text-zinc-500">
                  Year
                  <input
                    type="number"
                    min={2000}
                    max={2100}
                    className="h-9 w-20 rounded-lg border border-zinc-300 bg-white px-2 text-sm tabular-nums dark:border-zinc-700 dark:bg-zinc-950"
                    value={spendYear}
                    onChange={(e) =>
                      setSpendYear(
                        Math.min(
                          2100,
                          Math.max(2000, Number(e.target.value) || spendYear),
                        ),
                      )
                    }
                  />
                </label>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead className="border-b border-zinc-200 bg-zinc-50 text-xs uppercase text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900/40">
                  <tr>
                    <th className="px-4 py-3">Date</th>
                    <th className="px-4 py-3">Merchant</th>
                    <th className="px-4 py-3">Category</th>
                    <th className="px-4 py-3">Source</th>
                    <th className="px-4 py-3 text-right">Amount</th>
                    <th className="px-4 py-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-8 text-center text-zinc-500">
                        Loading…
                      </td>
                    </tr>
                  ) : transactions.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-8 text-center text-zinc-500">
                        No transactions in this range
                      </td>
                    </tr>
                  ) : (
                    transactions.map((tx) => (
                      <tr
                        key={tx.id}
                        className="border-b border-zinc-100 dark:border-zinc-800/80"
                      >
                        <td className="px-4 py-3 tabular-nums text-zinc-600 dark:text-zinc-400">
                          {new Date(tx.occurredAt).toLocaleString()}
                        </td>
                        <td className="px-4 py-3">
                          {tx.merchant ?? "—"}
                          {tx.needsReview && (
                            <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-900 dark:bg-amber-900/40 dark:text-amber-200">
                              review
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3">{tx.category?.name ?? "—"}</td>
                        <td className="px-4 py-3 capitalize text-zinc-600 dark:text-zinc-400">
                          {tx.source}
                        </td>
                        <td className="px-4 py-3 text-right font-medium tabular-nums">
                          {new Intl.NumberFormat(undefined, {
                            style: "currency",
                            currency: tx.currency || "USD",
                          }).format(tx.amount)}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <button
                            type="button"
                            disabled={deleteBusyId === tx.id}
                            onClick={() => void onDeleteTransaction(tx.id)}
                            className="h-8 rounded-md border border-red-300 px-3 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-60 dark:border-red-800/60 dark:text-red-300 dark:hover:bg-red-900/20"
                          >
                            {deleteBusyId === tx.id ? "Deleting..." : "Delete"}
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
