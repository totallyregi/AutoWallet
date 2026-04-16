"use client";

import type { GmailFullMessagePreview } from "@/lib/gmail-sync";
import type { TransactionJson } from "@/lib/transaction-json";
import { EmailBodyPreviewDialog } from "./email-body-preview-dialog";
import {
  jobViewFromParseJobConfig,
  snapshotFromJobView,
  type ParseHistorySnapshot,
} from "./parse-job-finished-summary";
import {
  ParseHistoryView,
  prependParseHistoryEntry,
  truncatePasteForHistory,
  type ParseHistoryEntry,
} from "./parse-history-view";
import {
  ParseJobModal,
  type ParseJobConfig,
  type ParseJobResultLine,
  type ParseJobResultRow,
} from "./parse-job-modal";
import { GmailFilters } from "./gmail-filters";
import { GmailMessagesPreview } from "./gmail-messages-preview";
import type { GmailConnectionState, GmailTableRow } from "./gmail-types";
import { DateRangeControls, type DateRangeMode } from "./date-range-controls";
import {
  TransactionEditModal,
  type CategoryOption,
  type TransactionFormPayload,
} from "./transaction-edit-modal";
import { useTheme } from "@/components/theme-provider";
import { useDisplayCurrency } from "@/lib/display-currency-context";
import type { ImportStoreCurrency } from "@/lib/import-currency-convert";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
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
  { id: "parse-history", label: "Parse history" },
  { id: "settings", label: "Settings" },
] as const;

type TabId = (typeof TABS)[number]["id"];

function tabFromSearchParam(value: string | null): TabId {
  if (value && TABS.some((t) => t.id === value)) return value as TabId;
  return "overview";
}

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

const SPEND_FILTER_STORAGE_KEY = "autowallet:spendFilter";
/** Inclusive rolling window ending at the current calendar year. */
const SPEND_YEAR_WINDOW = 10;

const MAX_CAPTURE_RECEIPTS = 5;
const MAX_RECEIPT_FILE_BYTES = 12 * 1024 * 1024;

function transactionToResultLines(tx: TransactionJson): ParseJobResultLine[] {
  return [
    {
      id: tx.id,
      merchant: tx.merchant,
      amount: tx.amount,
      currency: tx.currency,
      occurredAt: tx.occurredAt,
      kind: tx.isReversalLine ? "reversal" : "charge",
    },
  ];
}

function spendYearWindowEnd(): number {
  return new Date().getFullYear();
}

function selectableSpendYears(): number[] {
  const end = spendYearWindowEnd();
  return Array.from({ length: SPEND_YEAR_WINDOW }, (_, i) => end - i);
}

function clampYearToSelectableWindow(year: number): number {
  const end = spendYearWindowEnd();
  const min = end - (SPEND_YEAR_WINDOW - 1);
  return Math.min(end, Math.max(min, Math.round(year)));
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function quickRangeIso(year: number, month: number | null): { from: string; to: string } {
  if (month == null) {
    const from = new Date(year, 0, 1, 0, 0, 0, 0);
    const to = new Date(year, 11, 31, 23, 59, 59, 999);
    return { from: from.toISOString(), to: to.toISOString() };
  }
  const from = new Date(year, month - 1, 1, 0, 0, 0, 0);
  const to = new Date(year, month, 0, 23, 59, 59, 999);
  return { from: from.toISOString(), to: to.toISOString() };
}

function quickRangeToYyyyMmDd(
  year: number,
  month: number | null,
): { from: string; to: string } {
  if (month == null) {
    return { from: `${year}-01-01`, to: `${year}-12-31` };
  }
  const lastDay = new Date(year, month, 0).getDate();
  return {
    from: `${year}-${pad2(month)}-01`,
    to: `${year}-${pad2(month)}-${pad2(lastDay)}`,
  };
}

function parseYyyyMmDd(s: string): { y: number; m: number; d: number } | null {
  const parts = s.trim().split("-");
  if (parts.length !== 3) return null;
  const y = Number(parts[0]);
  const m = Number(parts[1]);
  const d = Number(parts[2]);
  if (!Number.isInteger(y) || !Number.isInteger(m) || !Number.isInteger(d)) return null;
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  return { y, m, d };
}

/** Inclusive local start/end of day; if from > to, swap calendar days. */
function customStringsToRangeIso(
  fromStr: string,
  toStr: string,
  fallbackYear: number,
  fallbackMonth: number | null,
): { from: string; to: string } {
  const a = parseYyyyMmDd(fromStr);
  const b = parseYyyyMmDd(toStr);
  if (!a || !b) return quickRangeIso(fallbackYear, fallbackMonth);
  let start = new Date(a.y, a.m - 1, a.d, 0, 0, 0, 0);
  let end = new Date(b.y, b.m - 1, b.d, 23, 59, 59, 999);
  if (start.getTime() > end.getTime()) {
    const t = start;
    start = new Date(b.y, b.m - 1, b.d, 0, 0, 0, 0);
    end = new Date(t.getFullYear(), t.getMonth(), t.getDate(), 23, 59, 59, 999);
  }
  return { from: start.toISOString(), to: end.toISOString() };
}

type StoredSpendFilterState = {
  year: number;
  month: number | null;
  dateRangeMode: DateRangeMode;
  customRangeFrom: string;
  customRangeTo: string;
};

function readStoredSpendFilter(): StoredSpendFilterState {
  const end = spendYearWindowEnd();
  const defaultYear = end;
  const defaults: StoredSpendFilterState = {
    year: defaultYear,
    month: null,
    dateRangeMode: "quick",
    customRangeFrom: `${defaultYear}-01-01`,
    customRangeTo: `${defaultYear}-12-31`,
  };
  if (typeof window === "undefined") {
    return defaults;
  }
  try {
    const raw = localStorage.getItem(SPEND_FILTER_STORAGE_KEY);
    if (!raw) return defaults;
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const rawYear =
      typeof parsed.year === "number" && Number.isFinite(parsed.year)
        ? parsed.year
        : defaultYear;
    const year = clampYearToSelectableWindow(rawYear);
    const month =
      parsed.month === null
        ? null
        : typeof parsed.month === "number" &&
            Number.isInteger(parsed.month) &&
            parsed.month >= 1 &&
            parsed.month <= 12
          ? parsed.month
          : null;
    const dateRangeMode: DateRangeMode =
      parsed.dateRangeMode === "custom" ? "custom" : "quick";
    const ymd = quickRangeToYyyyMmDd(year, month);
    const customRangeFrom =
      typeof parsed.customRangeFrom === "string" && parsed.customRangeFrom
        ? parsed.customRangeFrom
        : ymd.from;
    const customRangeTo =
      typeof parsed.customRangeTo === "string" && parsed.customRangeTo
        ? parsed.customRangeTo
        : ymd.to;
    return {
      year,
      month,
      dateRangeMode,
      customRangeFrom,
      customRangeTo,
    };
  } catch {
    return defaults;
  }
}

type Summary = {
  total: number;
  byCategory: {
    slug: string;
    name: string;
    amount: number;
    percentage: number;
  }[];
  transactionCount: number;
  averageTransaction: number;
  needsReviewCount: number;
  maxSingle: number;
  byMonth: { month: string; amount: number }[];
  bySource: { source: string; name: string; amount: number; percentage: number }[];
  topMerchants: { name: string; amount: number }[];
};

type TransactionSortColumn = "date" | "merchant" | "category" | "source" | "amount";

function TransactionSortHeader({
  column,
  activeColumn,
  dir,
  onClick,
  align = "left",
  children,
}: {
  column: TransactionSortColumn;
  activeColumn: TransactionSortColumn;
  dir: "asc" | "desc";
  onClick: () => void;
  align?: "left" | "right";
  children: ReactNode;
}) {
  const active = activeColumn === column;
  const arrow = dir === "asc" ? "▲" : "▼";
  return (
    <th
      scope="col"
      className={`px-4 py-3 ${align === "right" ? "text-right" : "text-left"}`}
    >
      <button
        type="button"
        onClick={onClick}
        className={`group inline-flex w-full items-center gap-1.5 text-left text-xs font-semibold uppercase tracking-wide hover:text-zinc-800 dark:hover:text-zinc-200 ${
          align === "right" ? "justify-end" : ""
        } ${active ? "text-zinc-800 dark:text-zinc-100" : "text-zinc-500"}`}
      >
        <span>{children}</span>
        <span
          className={`select-none text-[10px] ${
            active ? "text-zinc-600 dark:text-zinc-300" : "text-zinc-400 opacity-40 group-hover:opacity-100"
          }`}
          aria-hidden
        >
          {active ? arrow : "↕"}
        </span>
      </button>
    </th>
  );
}

export type { GmailConnectionState };

function DashboardClientImpl({
  googleOAuthEnabled,
  gmailConnection,
  gmailDisplayEmail,
}: {
  googleOAuthEnabled: boolean;
  gmailConnection: GmailConnectionState;
  gmailDisplayEmail: string | null;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const activeTab = useMemo(
    () => tabFromSearchParam(searchParams.get("tab")),
    [searchParams],
  );

  const {
    formatMoney,
    formatMoneyFromUsdAggregate,
    formatCompactFromUsdAggregate,
  } = useDisplayCurrency();
  const { theme, setTheme } = useTheme();

  const setActiveTab = useCallback(
    (tab: TabId) => {
      const next = new URLSearchParams(searchParams.toString());
      if (tab === "overview") next.delete("tab");
      else next.set("tab", tab);
      const q = next.toString();
      router.replace(q ? `${pathname}?${q}` : pathname, { scroll: false });
    },
    [router, pathname, searchParams],
  );

  const [spendYear, setSpendYear] = useState(() => spendYearWindowEnd());
  /** `null` = entire selected year; number 1–12 = that calendar month only. */
  const [spendMonth, setSpendMonth] = useState<number | null>(null);
  const [dateRangeMode, setDateRangeMode] = useState<DateRangeMode>("quick");
  const [customRangeFrom, setCustomRangeFrom] = useState("");
  const [customRangeTo, setCustomRangeTo] = useState("");
  const [spendFilterReady, setSpendFilterReady] = useState(false);
  const [transactions, setTransactions] = useState<TransactionJson[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [receiptQueue, setReceiptQueue] = useState<{ id: string; file: File }[]>(
    [],
  );
  const [receiptParseBusy, setReceiptParseBusy] = useState(false);
  const receiptFileInputRef = useRef<HTMLInputElement>(null);
  const [pasteText, setPasteText] = useState("");
  const [pasteBusy, setPasteBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [senderEmail, setSenderEmail] = useState("");
  const [senderBusy, setSenderBusy] = useState(false);
  const [savedSenders, setSavedSenders] = useState<
    { id: string; email: string; createdAt: string }[]
  >([]);
  const [gmailLoading, setGmailLoading] = useState(false);
  const [gmailAfter, setGmailAfter] = useState("");
  const [gmailBefore, setGmailBefore] = useState("");
  const [gmailSearch, setGmailSearch] = useState("");
  const [gmailPages, setGmailPages] = useState<GmailTableRow[][]>([]);
  const [gmailPageIndex, setGmailPageIndex] = useState(0);
  const [gmailNextToken, setGmailNextToken] = useState<string | null>(null);
  const [parseBusyId, setParseBusyId] = useState<string | null>(null);
  const [selectedMessages, setSelectedMessages] = useState<
    Record<string, GmailTableRow>
  >({});
  const [batchModalOpen, setBatchModalOpen] = useState(false);
  const [batchRunning, setBatchRunning] = useState(false);
  const [batchDone, setBatchDone] = useState(0);
  const [batchTotal, setBatchTotal] = useState(0);
  const [batchCurrentLabel, setBatchCurrentLabel] = useState<string>("");
  const [batchResults, setBatchResults] = useState<ParseJobResultRow[]>([]);
  const [batchParseJob, setBatchParseJob] = useState<ParseJobConfig | null>(
    null,
  );
  const [forceOpenEmailId, setForceOpenEmailId] = useState<string | null>(null);
  const [sourceEmailTxId, setSourceEmailTxId] = useState<string | null>(null);
  const [sourceEmailLoading, setSourceEmailLoading] = useState(false);
  const [sourceEmailError, setSourceEmailError] = useState<string | null>(null);
  const [sourceEmailDetail, setSourceEmailDetail] =
    useState<GmailFullMessagePreview | null>(null);
  const [editTx, setEditTx] = useState<TransactionJson | null>(null);
  const [editSaving, setEditSaving] = useState(false);
  const [createTxOpen, setCreateTxOpen] = useState(false);
  const [createSaving, setCreateSaving] = useState(false);
  const [selectedTxIds, setSelectedTxIds] = useState<Set<string>>(() => new Set());
  const [bulkDeleteBusy, setBulkDeleteBusy] = useState(false);
  const [parseSummaryDeleteBusyId, setParseSummaryDeleteBusyId] = useState<
    string | null
  >(null);
  const txHeaderSelectRef = useRef<HTMLInputElement>(null);
  const [categories, setCategories] = useState<CategoryOption[]>([]);
  const [deleteBusyId, setDeleteBusyId] = useState<string | null>(null);
  const [merchantFilter, setMerchantFilter] = useState("");
  const [categoryFilterId, setCategoryFilterId] = useState("");
  const [sourceFilter, setSourceFilter] = useState<
    "" | "email" | "image" | "manual" | "text"
  >("");
  const [minAmountInput, setMinAmountInput] = useState("");
  const [maxAmountInput, setMaxAmountInput] = useState("");
  const [txKindFilter, setTxKindFilter] = useState<"all" | "reversed" | "charges">(
    "all",
  );
  const [parseToast, setParseToast] = useState<string | null>(null);
  const parseToastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [parseHistoryRevision, setParseHistoryRevision] = useState(0);
  const [txSort, setTxSort] = useState<{
    column: TransactionSortColumn;
    dir: "asc" | "desc";
  }>({ column: "date", dir: "desc" });
  const MAX_BATCH_SELECTION = 10;

  type PreferredImportCurrency = ImportStoreCurrency | null;
  const [preferredImportCurrency, setPreferredImportCurrency] =
    useState<PreferredImportCurrency>(null);
  const [importPrefBusy, setImportPrefBusy] = useState(false);

  const showParseSuccessToast = useCallback((text: string) => {
    if (parseToastTimerRef.current) clearTimeout(parseToastTimerRef.current);
    setParseToast(text);
    parseToastTimerRef.current = setTimeout(() => {
      setParseToast(null);
      parseToastTimerRef.current = null;
    }, 4500);
  }, []);

  const recordParseHistory = useCallback(
    (snapshot: ParseHistorySnapshot, results: ParseJobResultRow[]) => {
      const entry: ParseHistoryEntry = {
        id:
          typeof crypto !== "undefined" && "randomUUID" in crypto
            ? crypto.randomUUID()
            : `ph-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        completedAt: new Date().toISOString(),
        snapshot,
        results: structuredClone(results),
      };
      prependParseHistoryEntry(entry);
      setParseHistoryRevision((n) => n + 1);
    },
    [],
  );

  useEffect(() => {
    return () => {
      if (parseToastTimerRef.current) clearTimeout(parseToastTimerRef.current);
    };
  }, []);

  const yearSelectOptions = useMemo(() => selectableSpendYears(), []);

  useEffect(() => {
    const s = readStoredSpendFilter();
    setSpendYear(s.year);
    setSpendMonth(s.month);
    setDateRangeMode(s.dateRangeMode);
    setCustomRangeFrom(s.customRangeFrom);
    setCustomRangeTo(s.customRangeTo);
    setSpendFilterReady(true);
  }, []);

  useEffect(() => {
    if (!spendFilterReady) return;
    try {
      localStorage.setItem(
        SPEND_FILTER_STORAGE_KEY,
        JSON.stringify({
          year: spendYear,
          month: spendMonth,
          dateRangeMode,
          customRangeFrom,
          customRangeTo,
        }),
      );
    } catch {
      // ignore private mode / quota
    }
  }, [
    spendFilterReady,
    spendYear,
    spendMonth,
    dateRangeMode,
    customRangeFrom,
    customRangeTo,
  ]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/user/preferences");
        if (!res.ok || cancelled) return;
        const data = (await res.json()) as {
          preferredImportCurrency: PreferredImportCurrency;
        };
        if (!cancelled) {
          setPreferredImportCurrency(data.preferredImportCurrency ?? null);
        }
      } catch {
        // ignore
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const persistPreferredImportCurrency = useCallback(
    async (next: PreferredImportCurrency) => {
      const snapshot = preferredImportCurrency;
      setPreferredImportCurrency(next);
      setImportPrefBusy(true);
      try {
        const res = await fetch("/api/user/preferences", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ preferredImportCurrency: next }),
        });
        const data = (await res.json()) as {
          preferredImportCurrency?: PreferredImportCurrency;
          error?: string;
        };
        if (res.ok) {
          setPreferredImportCurrency(data.preferredImportCurrency ?? null);
        } else {
          setPreferredImportCurrency(snapshot);
        }
      } catch {
        setPreferredImportCurrency(snapshot);
      } finally {
        setImportPrefBusy(false);
      }
    },
    [preferredImportCurrency],
  );

  const range = useMemo(() => {
    if (dateRangeMode === "custom" && customRangeFrom && customRangeTo) {
      return customStringsToRangeIso(
        customRangeFrom,
        customRangeTo,
        spendYear,
        spendMonth,
      );
    }
    return quickRangeIso(spendYear, spendMonth);
  }, [
    dateRangeMode,
    customRangeFrom,
    customRangeTo,
    spendYear,
    spendMonth,
  ]);

  const handleDateRangeModeChange = useCallback(
    (next: DateRangeMode) => {
      if (next === "custom") {
        const { from, to } = quickRangeToYyyyMmDd(spendYear, spendMonth);
        setCustomRangeFrom(from);
        setCustomRangeTo(to);
      }
      setDateRangeMode(next);
    },
    [spendYear, spendMonth],
  );

  const minAmountBound = useMemo(() => {
    const x = parseFloat(minAmountInput);
    return Number.isFinite(x) ? x : null;
  }, [minAmountInput]);

  const maxAmountBound = useMemo(() => {
    const x = parseFloat(maxAmountInput);
    return Number.isFinite(x) ? x : null;
  }, [maxAmountInput]);

  const filteredTransactions = useMemo(() => {
    const q = merchantFilter.trim().toLowerCase();
    return transactions.filter((tx) => {
      if (q) {
        const m = (tx.merchant ?? "").toLowerCase();
        if (!m.includes(q)) return false;
      }
      if (categoryFilterId && tx.category?.id !== categoryFilterId) return false;
      if (sourceFilter && tx.source !== sourceFilter) return false;
      if (minAmountBound != null && tx.amount < minAmountBound) return false;
      if (maxAmountBound != null && tx.amount > maxAmountBound) return false;
      if (txKindFilter === "reversed") {
        if (!tx.isReversalLine && !tx.displayAsReversed) return false;
      } else if (txKindFilter === "charges") {
        if (tx.isReversalLine || tx.displayAsReversed) return false;
      }
      return true;
    });
  }, [
    transactions,
    merchantFilter,
    categoryFilterId,
    sourceFilter,
    minAmountBound,
    maxAmountBound,
    txKindFilter,
  ]);

  const displayedTransactions = useMemo(() => {
    const rows = [...filteredTransactions];
    const { column: col, dir } = txSort;
    const mul = dir === "asc" ? 1 : -1;
    const cmpStrings = (a: string, b: string) =>
      a.localeCompare(b, undefined, { sensitivity: "base" });
    rows.sort((x, y) => {
      let c = 0;
      if (col === "date") {
        c = new Date(x.occurredAt).getTime() - new Date(y.occurredAt).getTime();
      } else if (col === "merchant") {
        c = cmpStrings(x.merchant ?? "", y.merchant ?? "");
      } else if (col === "category") {
        c = cmpStrings(x.category?.name ?? "", y.category?.name ?? "");
      } else if (col === "source") {
        c = cmpStrings(x.source ?? "", y.source ?? "");
      } else if (col === "amount") {
        c = x.amount - y.amount;
      }
      c *= mul;
      if (c !== 0) return c > 0 ? 1 : -1;
      return x.id.localeCompare(y.id);
    });
    return rows;
  }, [filteredTransactions, txSort]);

  const selectedTxCount = selectedTxIds.size;
  const multiRowSelect = selectedTxCount > 1;

  useEffect(() => {
    if (activeTab !== "transactions") {
      setSelectedTxIds(new Set());
      setCreateTxOpen(false);
      if (!editSaving) setEditTx(null);
    }
  }, [activeTab, editSaving]);

  useEffect(() => {
    const allowed = new Set(transactions.map((t) => t.id));
    setSelectedTxIds((prev) => {
      let changed = false;
      const next = new Set<string>();
      for (const id of prev) {
        if (allowed.has(id)) next.add(id);
        else changed = true;
      }
      return changed ? next : prev;
    });
  }, [transactions]);

  useEffect(() => {
    const el = txHeaderSelectRef.current;
    if (!el) return;
    const n = displayedTransactions.length;
    if (n === 0) {
      el.indeterminate = false;
      return;
    }
    const c = displayedTransactions.filter((tx) => selectedTxIds.has(tx.id)).length;
    el.indeterminate = c > 0 && c < n;
  }, [displayedTransactions, selectedTxIds]);

  const onTxSortHeaderClick = useCallback((column: TransactionSortColumn) => {
    setTxSort((prev) =>
      prev.column === column
        ? { column, dir: prev.dir === "asc" ? "desc" : "asc" }
        : { column, dir: "desc" },
    );
  }, []);

  const clearTxFilters = useCallback(() => {
    setMerchantFilter("");
    setCategoryFilterId("");
    setSourceFilter("");
    setMinAmountInput("");
    setMaxAmountInput("");
    setTxKindFilter("all");
  }, []);

  const gmailRows = gmailPages[gmailPageIndex] ?? [];

  useEffect(() => {
    const pool = gmailPages.flat();
    setSelectedMessages((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const id of Object.keys(next)) {
        const fresh = pool.find((r) => r.gmailMessageId === id);
        if (fresh && fresh.parseStatus === "complete") {
          delete next[id];
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [gmailPages]);

  const selectedMessageIds = useMemo(
    () => Object.keys(selectedMessages),
    [selectedMessages],
  );
  const selectedRows = useMemo(
    () => Object.values(selectedMessages),
    [selectedMessages],
  );

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
        messages?: GmailTableRow[];
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
        const res = await fetch("/api/categories");
        if (!res.ok) return;
        const data = (await res.json()) as { categories?: CategoryOption[] };
        setCategories(data.categories ?? []);
      } catch {
        // ignore category prefetch failures
      }
    })();
  }, []);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch("/api/gmail/sender");
        if (res.ok) {
          const data = (await res.json()) as {
            senders?: { id: string; email: string; createdAt: string }[];
          };
          setSavedSenders(data.senders ?? []);
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

  /** Browsers often omit `file.type` (empty) for HEIC, some PNGs, or "Download" folder picks. */
  function isAllowedReceiptFile(file: File): boolean {
    const name = file.name.toLowerCase();
    const t = (file.type || "").toLowerCase();
    if (t.startsWith("image/")) return true;
    if (t === "application/pdf" || name.endsWith(".pdf")) return true;
    if (
      (t === "" || t === "application/octet-stream") &&
      /\.(png|jpe?g|gif|webp|heic|heif|avif|bmp|tif|tiff)$/i.test(name)
    ) {
      return true;
    }
    return false;
  }

  function onReceiptFilesSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const input = e.target;
    const list = input.files;
    if (!list?.length) return;
    /** Snapshot immediately — WebKit/macOS can clear `FileList` when `input.value` is reset. */
    const chosen = Array.from(list);
    setMessage(null);
    setReceiptQueue((prev) => {
      const next = [...prev];
      let lastNotice: string | null = null;
      for (const file of chosen) {
        if (next.length >= MAX_CAPTURE_RECEIPTS) {
          lastNotice = `You can stage at most ${MAX_CAPTURE_RECEIPTS} files. Extra files were not added.`;
          break;
        }
        if (!isAllowedReceiptFile(file)) {
          lastNotice = `Skipped "${file.name}" — use an image (PNG, JPEG, HEIC, …) or PDF.`;
          continue;
        }
        if (file.size > MAX_RECEIPT_FILE_BYTES) {
          lastNotice = `Skipped "${file.name}" (larger than 12 MB).`;
          continue;
        }
        if (file.size === 0) {
          lastNotice = `Skipped "${file.name}" (file is empty).`;
          continue;
        }
        next.push({
          id:
            typeof crypto !== "undefined" && "randomUUID" in crypto
              ? `q-${crypto.randomUUID()}`
              : `q-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
          file,
        });
      }
      if (lastNotice) {
        queueMicrotask(() => setMessage(lastNotice));
      }
      return next;
    });
    /** Defer reset so Finder can finish handing off files (sync clear often drops selection on macOS). */
    window.setTimeout(() => {
      input.value = "";
    }, 0);
  }

  function openReceiptFilePicker() {
    receiptFileInputRef.current?.click();
  }

  function removeQueuedReceipt(id: string) {
    setReceiptQueue((q) => q.filter((x) => x.id !== id));
  }

  async function runReceiptParseJob() {
    const queued = receiptQueue;
    if (queued.length === 0) return;
    const files = queued.map((q) => q.file);
    const sources = files.map((file, i) => {
      const id = `receipt-${Date.now()}-${i}`;
      const name = file.name.toLowerCase();
      const isPdf = file.type === "application/pdf" || name.endsWith(".pdf");
      return {
        id,
        name: file.name,
        previewUrl: URL.createObjectURL(file),
        isPdf,
      };
    });
    const job: ParseJobConfig = { kind: "receipt", sources };
    setBatchParseJob(job);
    setBatchModalOpen(true);
    setBatchRunning(true);
    setBatchDone(0);
    setBatchTotal(files.length);
    setBatchResults([]);
    setBatchCurrentLabel("");
    setMessage(null);
    setReceiptParseBusy(true);

    const results: ParseJobResultRow[] = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i]!;
      const src = sources[i]!;
      setBatchCurrentLabel(src.name);
      try {
        const fd = new FormData();
        fd.append("file", file);
        const res = await fetch("/api/upload/receipt", { method: "POST", body: fd });
        const data = (await res.json()) as {
          error?: string;
          transaction?: TransactionJson;
        };
        if (!res.ok) throw new Error(data.error ?? "Upload failed");
        const tx = data.transaction;
        if (!tx) throw new Error("No transaction returned");
        const lines = transactionToResultLines(tx);
        results.push({
          sourceId: src.id,
          title: src.name,
          status: "parsed",
          createdCount: 1,
          lineCount: 1,
          createdTransactions: lines,
        });
      } catch (err) {
        results.push({
          sourceId: src.id,
          title: src.name,
          status: "error",
          error: err instanceof Error ? err.message : "Failed to parse",
        });
      } finally {
        setBatchDone(i + 1);
        setBatchResults([...results]);
      }
    }
    setBatchRunning(false);
    setBatchCurrentLabel("");
    setReceiptParseBusy(false);
    await load({ preserveMessage: true });
    const ok = results.filter((r) => r.status !== "error").length;
    const snap = snapshotFromJobView(jobViewFromParseJobConfig(job));
    recordParseHistory(snap, results);
    if (files.length === 1) {
      const r = results[0]!;
      if (r.status === "error") {
        setMessage(r.error ?? "Failed to parse receipt");
      } else {
        showParseSuccessToast("Receipt saved.");
      }
    } else {
      if (ok === 0) {
        setMessage("Receipt parse failed for every file.");
      } else {
        showParseSuccessToast(
          `Receipt parse complete: ${ok}/${results.length} succeeded.`,
        );
      }
    }
  }

  async function runTextParseJob(text: string) {
    const trimmed = text.trim();
    if (!trimmed) return;
    const job: ParseJobConfig = { kind: "text", pastedText: trimmed };
    setBatchParseJob(job);
    setBatchModalOpen(true);
    setBatchRunning(true);
    setBatchDone(0);
    setBatchTotal(1);
    setBatchResults([]);
    setBatchCurrentLabel("Pasted content");
    setMessage(null);
    setPasteBusy(true);

    const sourceId = "paste-text";
    const results: ParseJobResultRow[] = [];
    try {
      const res = await fetch("/api/ingest/paste", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: trimmed }),
      });
      const data = (await res.json()) as {
        error?: string;
        duplicate?: boolean;
        skippedDeclined?: boolean;
        transaction?: TransactionJson;
      };
      if (!res.ok) throw new Error(data.error ?? "Parse failed");
      if (data.skippedDeclined) {
        results.push({
          sourceId,
          title: "Pasted content",
          status: "parsed",
          createdCount: 0,
          lineCount: 0,
          createdTransactions: [],
          skippedDeclined: true,
        });
      } else {
        const dup = Boolean(data.duplicate);
        const tx = data.transaction;
        if (!tx) throw new Error("No transaction returned");
        const lines = transactionToResultLines(tx);
        results.push({
          sourceId,
          title: "Pasted content",
          status: dup ? "duplicate" : "parsed",
          createdCount: dup ? 0 : 1,
          lineCount: 1,
          createdTransactions: lines,
        });
      }
    } catch (err) {
      results.push({
        sourceId,
        title: "Pasted content",
        status: "error",
        error: err instanceof Error ? err.message : "Failed to parse",
      });
    } finally {
      setBatchDone(1);
      setBatchResults(results);
      setBatchRunning(false);
      setBatchCurrentLabel("");
      setPasteBusy(false);
      await load({ preserveMessage: true });
      const r = results[0]!;
      let snap = snapshotFromJobView(jobViewFromParseJobConfig(job));
      if (snap.kind === "text") {
        snap = {
          kind: "text",
          pastedText: truncatePasteForHistory(snap.pastedText),
        };
      }
      recordParseHistory(snap, results);
      if (r.status === "error") {
        setMessage(r.error ?? "Failed to parse");
      } else if (r.status === "duplicate") {
        setMessage("That text was already imported.");
        setPasteText("");
      } else if (r.skippedDeclined) {
        showParseSuccessToast(
          "Nothing imported — pasted text describes a declined transaction (no charge posted).",
        );
        setPasteText("");
      } else {
        showParseSuccessToast("Text parsed and saved.");
        setPasteText("");
      }
    }
  }

  function onPasteSubmit(e: React.FormEvent) {
    e.preventDefault();
    void runTextParseJob(pasteText);
  }

  async function onSaveSender(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = senderEmail.trim().toLowerCase();
    if (!trimmed) {
      setMessage("Enter an email address to add.");
      return;
    }
    setSenderBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/gmail/sender", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sender: trimmed }),
      });
      const data = (await res.json()) as {
        error?: string;
        senders?: { id: string; email: string; createdAt: string }[];
      };
      if (!res.ok) throw new Error(data.error ?? "Failed to save sender");
      setSavedSenders(data.senders ?? []);
      setSenderEmail("");
      setMessage(`Added sender: ${trimmed}`);
      await loadGmailReset();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Failed to save sender");
    } finally {
      setSenderBusy(false);
    }
  }

  async function onDeleteSavedSender(id: string) {
    setMessage(null);
    try {
      const res = await fetch(`/api/gmail/sender/${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      const data = (await res.json()) as {
        error?: string;
        senders?: { id: string; email: string; createdAt: string }[];
      };
      if (!res.ok) throw new Error(data.error ?? "Failed to remove sender");
      setSavedSenders(data.senders ?? []);
      setMessage("Sender removed.");
      await loadGmailReset();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Failed to remove sender");
    }
  }

  async function parseEmailById(gmailMessageId: string) {
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
      parseStatus?: "open" | "partial" | "complete";
      skippedDeclined?: boolean;
      createdTransactions?: {
        id?: string;
        merchant: string | null;
        amount: number;
        currency: string;
        occurredAt: string;
        kind: "charge" | "reversal";
      }[];
      error?: string;
    };
    if (!res.ok) throw new Error(data.error ?? "Failed to parse email");
    return data;
  }

  async function runGmailParseJob(
    rows: GmailTableRow[],
    options: { clearSelectionAfter: boolean },
  ) {
    if (rows.length === 0) return;
    const gmailJob: ParseJobConfig = {
      kind: "gmail",
      rows,
      onOpenEmail: (gmailMessageId) => setForceOpenEmailId(gmailMessageId),
    };
    setBatchParseJob(gmailJob);
    setBatchModalOpen(true);
    setBatchRunning(true);
    setBatchDone(0);
    setBatchTotal(rows.length);
    setBatchResults([]);
    setBatchCurrentLabel("");
    setMessage(null);

    const results: ParseJobResultRow[] = [];
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i]!;
      setParseBusyId(row.gmailMessageId);
      setBatchCurrentLabel(row.subject || row.from || "Email");
      try {
        const data = await parseEmailById(row.gmailMessageId);
        const status: ParseJobResultRow["status"] = data.duplicate
          ? "duplicate"
          : "parsed";
        results.push({
          sourceId: row.gmailMessageId,
          title: row.subject,
          subtitle: row.from,
          status,
          createdCount: data.createdCount ?? 0,
          lineCount: data.lineCount ?? data.createdCount ?? 0,
          createdTransactions: data.createdTransactions ?? [],
          skippedDeclined: Boolean(data.skippedDeclined),
        });
        const nextStatus = data.parseStatus ?? "complete";
        setGmailPages((pages) =>
          pages.map((pg) =>
            pg.some((m) => m.gmailMessageId === row.gmailMessageId)
              ? pg.map((m) =>
                  m.gmailMessageId === row.gmailMessageId
                    ? { ...m, parseStatus: nextStatus }
                    : m,
                )
              : pg,
          ),
        );
      } catch (e) {
        results.push({
          sourceId: row.gmailMessageId,
          title: row.subject,
          subtitle: row.from,
          status: "error",
          error: e instanceof Error ? e.message : "Failed to parse",
        });
      } finally {
        setBatchDone(i + 1);
        setBatchResults([...results]);
      }
    }
    setBatchRunning(false);
    setBatchCurrentLabel("");
    setParseBusyId(null);
    if (options.clearSelectionAfter) setSelectedMessages({});
    await load({ preserveMessage: true });

    const snap = snapshotFromJobView(jobViewFromParseJobConfig(gmailJob));
    recordParseHistory(snap, results);

    const success = results.filter((r) => r.status !== "error").length;
    if (rows.length === 1) {
      const r = results[0]!;
      if (r.status === "error") {
        setMessage(r.error ?? "Failed to parse email");
      } else if (r.status === "duplicate") {
        setMessage("Email already parsed earlier.");
      } else if (r.skippedDeclined) {
        showParseSuccessToast(
          "Nothing imported — this email describes a declined transaction (no charge posted).",
        );
      } else if ((r.createdCount ?? 0) > 1) {
        showParseSuccessToast(
          `Parsed email: created ${r.createdCount} transactions (${r.lineCount ?? r.createdCount} lines detected).`,
        );
      } else {
        showParseSuccessToast("Parsed email successfully. It is now tracked.");
      }
    } else {
      if (success === 0) {
        setMessage("Batch parse failed for every email.");
      } else {
        showParseSuccessToast(
          `Batch parse complete: ${success}/${results.length} succeeded.`,
        );
      }
    }
  }

  function onParseOne(gmailMessageId: string) {
    const pool = gmailPages.flat();
    const row = pool.find((r) => r.gmailMessageId === gmailMessageId);
    if (!row) {
      setMessage(
        "Could not find this message in the loaded list. Try refreshing Gmail.",
      );
      return;
    }
    void runGmailParseJob([row], { clearSelectionAfter: false });
  }

  /** Only fully tracked (complete) rows are excluded; open + partial stay selectable for batch parse. */
  function isSelectableForBatchParse(row: GmailTableRow): boolean {
    return (row.parseStatus ?? "open") !== "complete";
  }

  function onToggleSelected(row: GmailTableRow, checked: boolean) {
    if (checked && !isSelectableForBatchParse(row)) return;
    setSelectedMessages((prev) => {
      const next = { ...prev };
      if (checked) {
        if (next[row.gmailMessageId]) return prev;
        if (Object.keys(next).length >= MAX_BATCH_SELECTION) return prev;
        next[row.gmailMessageId] = row;
        return next;
      }
      delete next[row.gmailMessageId];
      return next;
    });
  }

  function onToggleSelectPage(rows: GmailTableRow[], checked: boolean) {
    const selectable = rows.filter(isSelectableForBatchParse);
    setSelectedMessages((prev) => {
      const next = { ...prev };
      if (!checked) {
        for (const r of rows) delete next[r.gmailMessageId];
        return next;
      }
      for (const r of selectable) {
        if (Object.keys(next).length >= MAX_BATCH_SELECTION) break;
        if (!next[r.gmailMessageId]) next[r.gmailMessageId] = r;
      }
      return next;
    });
  }

  function onParseSelected() {
    if (selectedRows.length === 0) return;
    const toParse = selectedRows.slice(0, MAX_BATCH_SELECTION);
    void runGmailParseJob(toParse, { clearSelectionAfter: true });
  }

  async function openSourceEmailForTransaction(txId: string) {
    setSourceEmailTxId(txId);
    setSourceEmailLoading(true);
    setSourceEmailError(null);
    setSourceEmailDetail(null);
    try {
      const res = await fetch(
        `/api/transactions/${encodeURIComponent(txId)}/source-email`,
      );
      const data = (await res.json()) as {
        error?: string;
        gmailMessageId?: string;
        bodyText?: string;
      };
      if (!res.ok) throw new Error(data.error ?? "Failed to load source email");
      setSourceEmailDetail(data as GmailFullMessagePreview);
    } catch (e) {
      setSourceEmailError(
        e instanceof Error ? e.message : "Failed to load source email",
      );
    } finally {
      setSourceEmailLoading(false);
    }
  }

  function closeSourceEmailDialog() {
    setSourceEmailTxId(null);
    setSourceEmailLoading(false);
    setSourceEmailError(null);
    setSourceEmailDetail(null);
  }

  function patchParseResultLineFromSave(payload: {
    id: string;
    amount: number;
    currency: string;
    occurredAt: string;
    merchant: string | null;
    notes: string | null;
    categoryId: string | null;
    needsReview: boolean;
  }) {
    setBatchResults((rows) =>
      rows.map((row) => ({
        ...row,
        createdTransactions: row.createdTransactions?.map((line) =>
          line.id === payload.id
            ? {
                ...line,
                merchant: payload.merchant,
                amount: payload.amount,
                currency: payload.currency,
                occurredAt: payload.occurredAt,
              }
            : line,
        ),
      })),
    );
  }

  function removeParseResultTransactionLine(sourceId: string, lineIndex: number) {
    setBatchResults((rows) =>
      rows.map((row) => {
        if (row.sourceId !== sourceId) return row;
        const lines = row.createdTransactions ?? [];
        if (lineIndex < 0 || lineIndex >= lines.length) return row;
        const nextLines = lines.filter((_, i) => i !== lineIndex);
        return {
          ...row,
          createdTransactions: nextLines,
          createdCount: Math.max(0, (row.createdCount ?? 1) - 1),
        };
      }),
    );
  }

  async function openEditFromParseSummary(transactionId: string) {
    let tx = transactions.find((t) => t.id === transactionId);
    if (!tx) {
      setMessage(null);
      try {
        const res = await fetch(
          `/api/transactions/${encodeURIComponent(transactionId)}`,
        );
        const data = (await res.json()) as {
          error?: string;
          transaction?: TransactionJson;
        };
        if (!res.ok) throw new Error(data.error ?? "Not found");
        tx = data.transaction;
      } catch (e) {
        setMessage(
          e instanceof Error
            ? e.message
            : "Could not load that transaction for editing.",
        );
        return;
      }
    }
    if (!tx) return;
    setCreateTxOpen(false);
    setEditTx(tx);
  }

  async function onDeleteFromParseSummary(
    transactionId: string,
    ctx: { sourceId: string; lineIndex: number },
  ) {
    const ok = window.confirm(
      "Delete this transaction? If it came from Gmail, you can parse the message again.",
    );
    if (!ok) return;
    setParseSummaryDeleteBusyId(transactionId);
    setMessage(null);
    try {
      const res = await fetch(`/api/transactions/${transactionId}`, {
        method: "DELETE",
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Failed to delete transaction");
      removeParseResultTransactionLine(ctx.sourceId, ctx.lineIndex);
      setMessage("Transaction deleted.");
      await load({ preserveMessage: true });
      await loadGmailReset();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Failed to delete transaction");
    } finally {
      setParseSummaryDeleteBusyId(null);
    }
  }

  async function onSaveTransactionEdit(payload: {
    id: string;
    amount: number;
    currency: string;
    occurredAt: string;
    merchant: string | null;
    notes: string | null;
    categoryId: string | null;
    needsReview: boolean;
  }) {
    setEditSaving(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/transactions/${encodeURIComponent(payload.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Failed to update transaction");
      setEditTx(null);
      setMessage("Transaction updated.");
      patchParseResultLineFromSave(payload);
      await load({ preserveMessage: true });
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Failed to update transaction");
    } finally {
      setEditSaving(false);
    }
  }

  async function onDeleteTransaction(id: string) {
    const ok = window.confirm(
      "Delete this transaction? If it came from Gmail, the message may show Parse or Parse (Partially) so you can import again.",
    );
    if (!ok) return;
    setDeleteBusyId(id);
    setMessage(null);
    try {
      const res = await fetch(`/api/transactions/${id}`, { method: "DELETE" });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Failed to delete transaction");
      setSelectedTxIds((prev) => {
        if (!prev.has(id)) return prev;
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
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

  function toggleTxRowSelected(id: string) {
    setSelectedTxIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAllDisplayed() {
    const ids = displayedTransactions.map((t) => t.id);
    if (ids.length === 0) return;
    const allOn = ids.every((id) => selectedTxIds.has(id));
    setSelectedTxIds((prev) => {
      const next = new Set(prev);
      if (allOn) for (const id of ids) next.delete(id);
      else for (const id of ids) next.add(id);
      return next;
    });
  }

  async function onCreateTransaction(payload: TransactionFormPayload) {
    setCreateSaving(true);
    setMessage(null);
    try {
      const res = await fetch("/api/transactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Failed to create transaction");
      setCreateTxOpen(false);
      setMessage("Transaction added.");
      await load({ preserveMessage: true });
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Failed to create transaction");
    } finally {
      setCreateSaving(false);
    }
  }

  async function onBulkDeleteTransactions() {
    const ids = [...selectedTxIds];
    if (ids.length === 0) return;
    const ok = window.confirm(
      `Delete ${ids.length} transaction${ids.length === 1 ? "" : "s"}? If any came from Gmail, you can import those messages again.`,
    );
    if (!ok) return;
    setBulkDeleteBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/transactions/bulk-delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      });
      const data = (await res.json()) as { error?: string; deleted?: number };
      if (!res.ok) throw new Error(data.error ?? "Failed to delete transactions");
      setSelectedTxIds(new Set());
      setMessage(`Deleted ${data.deleted ?? 0} transaction(s).`);
      await load({ preserveMessage: true });
      await loadGmailReset();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Failed to delete transactions");
    } finally {
      setBulkDeleteBusy(false);
    }
  }

  const chartData =
    summary?.byCategory.map((b) => ({
      name: b.name,
      value: b.amount,
    })) ?? [];

  const monthChartData =
    summary?.byMonth.map((row) => {
      const [y, mo] = row.month.split("-").map(Number);
      const d = new Date(Date.UTC(y, (mo ?? 1) - 1, 1));
      return {
        ...row,
        label: d.toLocaleString(undefined, {
          month: "short",
          year: "numeric",
          timeZone: "UTC",
        }),
      };
    }) ?? [];

  const sourceChartData =
    summary?.bySource.map((b) => ({
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
    <>
    <div className="grid items-start gap-6 xl:grid-cols-[250px_minmax(0,1fr)]">
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

      <div className="min-w-0 space-y-6">
        {(activeTab === "overview" || activeTab === "transactions") && (
          <div className="rounded-2xl border border-zinc-200 bg-white p-3 shadow-sm dark:border-zinc-800 dark:bg-zinc-950 sm:p-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between lg:gap-6">
              <div className="shrink-0 lg:max-w-[220px]">
                <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                  Date range
                </p>
                <p className="mt-0.5 text-sm tabular-nums text-zinc-600 dark:text-zinc-400">
                  {new Date(range.from).toLocaleDateString()} —{" "}
                  {new Date(range.to).toLocaleDateString()}
                </p>
              </div>
              <div className="flex min-w-0 w-full justify-end lg:flex-1">
                <DateRangeControls
                  dateRangeMode={dateRangeMode}
                  onDateRangeModeChange={handleDateRangeModeChange}
                  spendMonth={spendMonth}
                  spendYear={spendYear}
                  onSpendMonthChange={setSpendMonth}
                  onSpendYearChange={setSpendYear}
                  customRangeFrom={customRangeFrom}
                  customRangeTo={customRangeTo}
                  onCustomFromChange={setCustomRangeFrom}
                  onCustomToChange={setCustomRangeTo}
                  yearSelectOptions={yearSelectOptions}
                  monthOptions={MONTH_OPTIONS}
                />
              </div>
            </div>
          </div>
        )}

        {message && (
          <p className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm dark:border-zinc-800 dark:bg-zinc-900/50">
            {message}
          </p>
        )}

        {activeTab === "overview" && (
          <section className="fade-slide-in space-y-6">
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
                <h2 className="text-sm font-medium text-zinc-500">Transactions</h2>
                <p className="mt-1 text-2xl font-semibold tabular-nums">
                  {loading ? "…" : (summary?.transactionCount ?? 0).toLocaleString()}
                </p>
                <p className="mt-2 text-xs text-zinc-500">Spend rows in this range</p>
              </div>
              <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
                <h2 className="text-sm font-medium text-zinc-500">Average</h2>
                <p className="mt-1 text-2xl font-semibold tabular-nums">
                  {loading
                    ? "…"
                    : formatMoneyFromUsdAggregate(summary?.averageTransaction ?? 0)}
                </p>
                <p className="mt-2 text-xs text-zinc-500">Per spend transaction</p>
              </div>
              <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
                <h2 className="text-sm font-medium text-zinc-500">Largest</h2>
                <p className="mt-1 text-2xl font-semibold tabular-nums">
                  {loading
                    ? "…"
                    : formatMoneyFromUsdAggregate(summary?.maxSingle ?? 0)}
                </p>
                <p className="mt-2 text-xs text-zinc-500">Single largest charge</p>
              </div>
              <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
                <h2 className="text-sm font-medium text-zinc-500">Needs review</h2>
                <p className="mt-1 text-2xl font-semibold tabular-nums">
                  {loading ? "…" : (summary?.needsReviewCount ?? 0).toLocaleString()}
                </p>
                <p className="mt-2 text-xs text-zinc-500">Open Transactions to resolve</p>
              </div>
            </div>

            <div className="grid gap-6 lg:grid-cols-2">
              <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
                <h2 className="mb-1 text-lg font-medium">Total spend</h2>
                <p className="text-3xl font-semibold tabular-nums">
                  {loading
                    ? "…"
                    : formatMoneyFromUsdAggregate(summary?.total ?? 0)}
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
                            formatMoneyFromUsdAggregate(Number(value ?? 0))
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
                          {formatMoneyFromUsdAggregate(b.amount)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>

            <div className="grid gap-6 lg:grid-cols-2">
              <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
                <h2 className="mb-4 text-lg font-medium">Spend by month</h2>
                <div className="h-72 w-full">
                  {!loading && monthChartData.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={monthChartData} margin={{ left: 4, right: 8 }}>
                        <CartesianGrid
                          vertical={false}
                          className="stroke-zinc-200 dark:stroke-zinc-800"
                          strokeDasharray="3 3"
                        />
                        <XAxis
                          dataKey="label"
                          tick={{ fontSize: 11, fill: "currentColor" }}
                          className="text-zinc-500"
                          interval="preserveStartEnd"
                        />
                        <YAxis
                          width={52}
                          tick={{ fontSize: 11, fill: "currentColor" }}
                          className="text-zinc-500"
                          tickFormatter={(v) =>
                            formatCompactFromUsdAggregate(Number(v))
                          }
                        />
                        <Tooltip
                          formatter={(value) =>
                            formatMoneyFromUsdAggregate(Number(value ?? 0))
                          }
                        />
                        <Bar dataKey="amount" fill="#0ea5e9" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="flex h-full items-center justify-center text-sm text-zinc-500">
                      {loading ? "Loading chart…" : "No monthly data in this range"}
                    </div>
                  )}
                </div>
              </div>
              <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
                <h2 className="mb-4 text-lg font-medium">By source</h2>
                <div className="h-56 w-full">
                  {!loading && sourceChartData.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={sourceChartData}
                          dataKey="value"
                          nameKey="name"
                          cx="50%"
                          cy="50%"
                          innerRadius={44}
                          outerRadius={78}
                          paddingAngle={2}
                        >
                          {sourceChartData.map((_, i) => (
                            <Cell key={i} fill={COLORS[(i + 2) % COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip
                          formatter={(value) =>
                            formatMoneyFromUsdAggregate(Number(value ?? 0))
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
                {summary && summary.bySource.length > 0 && (
                  <ul className="mt-4 space-y-2 text-sm">
                    {summary.bySource.map((b) => (
                      <li key={b.source} className="flex justify-between gap-4">
                        <span className="text-zinc-700 dark:text-zinc-300">{b.name}</span>
                        <span className="tabular-nums text-zinc-600 dark:text-zinc-400">
                          {b.percentage}% ·{" "}
                          {formatMoneyFromUsdAggregate(b.amount)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>

            <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
              <h2 className="mb-4 text-lg font-medium">Top merchants</h2>
              {!loading && summary && summary.topMerchants.length > 0 ? (
                <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
                  {summary.topMerchants.map((row, i) => (
                    <li
                      key={`${row.name}-${i}`}
                      className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0"
                    >
                      <span className="min-w-0 truncate text-zinc-800 dark:text-zinc-200">
                        {row.name}
                      </span>
                      <span className="shrink-0 tabular-nums text-sm font-medium text-zinc-600 dark:text-zinc-400">
                        {formatMoneyFromUsdAggregate(row.amount)}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-zinc-500">
                  {loading ? "Loading…" : "No merchant data in this range"}
                </p>
              )}
            </div>
          </section>
        )}

        {activeTab === "gmail" && (
          <section className="fade-slide-in space-y-5">
            <GmailFilters
              senderEmail={senderEmail}
              onSenderChange={setSenderEmail}
              onSaveSender={onSaveSender}
              senderBusy={senderBusy}
              savedSenders={savedSenders}
              onDeleteSavedSender={onDeleteSavedSender}
              gmailAfter={gmailAfter}
              onAfterChange={setGmailAfter}
              gmailBefore={gmailBefore}
              onBeforeChange={setGmailBefore}
              gmailSearch={gmailSearch}
              onSearchChange={setGmailSearch}
              onApplyListFilters={() => void loadGmailReset()}
              listLoading={gmailLoading}
            />
            <GmailMessagesPreview
              googleOAuthEnabled={googleOAuthEnabled}
              gmailConnection={gmailConnection}
              gmailDisplayEmail={gmailDisplayEmail}
              reconnectCallbackUrl={`${pathname}${
                searchParams.toString() ? `?${searchParams.toString()}` : ""
              }`}
              gmailLoading={gmailLoading}
              onRefresh={() => void loadGmailReset()}
              rows={gmailRows}
              gmailPagesLength={gmailPages.length}
              gmailPageIndex={gmailPageIndex}
              gmailNextToken={gmailNextToken}
              gmailCanGoNext={gmailCanGoNext}
              onPrevPage={goGmailPrev}
              onNextPage={goGmailNext}
              onParseOne={(id) => void onParseOne(id)}
              parseBusyId={parseBusyId}
              selectedMessageIds={selectedMessageIds}
              maxBatchSelection={MAX_BATCH_SELECTION}
              onToggleSelected={onToggleSelected}
              onToggleSelectPage={onToggleSelectPage}
              onParseSelected={() => void onParseSelected()}
              forceOpenEmailId={forceOpenEmailId}
              onForceOpenConsumed={() => setForceOpenEmailId(null)}
              allLoadedRows={gmailPages.flat()}
            />
          </section>
        )}

        {activeTab === "capture" && (
          <section className="fade-slide-in grid gap-6 lg:grid-cols-2 lg:items-stretch">
            <div className="flex h-full min-h-0 flex-col rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
              <h2 className="mb-3 text-lg font-medium">Upload receipt</h2>
              <p className="mb-4 min-h-[2.75rem] text-sm leading-snug text-zinc-600 dark:text-zinc-400">
                Add a photo, screenshot, or PDF.
                <br />
                Up to {MAX_CAPTURE_RECEIPTS} files at once, 12 MB each.
              </p>
              <div className="mt-auto flex min-h-0 flex-col gap-3">
                <input
                  ref={receiptFileInputRef}
                  id="capture-receipt-input"
                  type="file"
                  accept="image/*,.heic,.heif,application/pdf,.pdf"
                  multiple
                  className="sr-only"
                  tabIndex={-1}
                  disabled={receiptParseBusy || batchRunning}
                  onChange={onReceiptFilesSelected}
                />
                <button
                  type="button"
                  disabled={receiptParseBusy || batchRunning}
                  onClick={() => openReceiptFilePicker()}
                  className="inline-flex cursor-pointer items-center justify-center rounded-lg border border-dashed border-zinc-300 px-4 py-6 text-sm font-medium hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-700 dark:hover:bg-zinc-900/50"
                >
                  Choose file(s)
                </button>
                {receiptQueue.length > 0 && (
                  <ul className="space-y-1.5 text-sm">
                    {receiptQueue.map((q) => (
                      <li
                        key={q.id}
                        className="flex items-center justify-between gap-2 rounded-md border border-zinc-200 px-2 py-1.5 dark:border-zinc-800"
                      >
                        <span className="min-w-0 truncate">{q.file.name}</span>
                        <button
                          type="button"
                          className="shrink-0 rounded border border-zinc-300 px-2 py-0.5 text-xs hover:bg-zinc-50 dark:border-zinc-600 dark:hover:bg-zinc-800"
                          disabled={receiptParseBusy || batchRunning}
                          onClick={() => removeQueuedReceipt(q.id)}
                        >
                          Remove
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                <button
                  type="button"
                  disabled={
                    receiptQueue.length === 0 || receiptParseBusy || batchRunning
                  }
                  onClick={() => void runReceiptParseJob()}
                  className="h-10 rounded-lg bg-zinc-900 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900"
                >
                  {receiptParseBusy ? "Parsing…" : "Parse"}
                </button>
              </div>
            </div>
            <div className="flex h-full min-h-0 flex-col rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
              <h2 className="mb-3 text-lg font-medium">Paste text</h2>
              <p className="mb-4 min-h-[2.75rem] text-sm leading-snug text-zinc-600 dark:text-zinc-400">
                Paste bank or card notification text here.
                <br />
                Press Parse when you are ready.
              </p>
              <form
                onSubmit={onPasteSubmit}
                className="mt-auto flex min-h-0 flex-col gap-3"
              >
                <textarea
                  className="min-h-[120px] w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
                  placeholder="Subject: … or paste notification text"
                  value={pasteText}
                  onChange={(e) => setPasteText(e.target.value)}
                />
                <button
                  type="submit"
                  disabled={pasteBusy || !pasteText.trim() || batchRunning}
                  className="h-10 rounded-lg bg-zinc-900 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900"
                >
                  {pasteBusy ? "Parsing…" : "Parse"}
                </button>
              </form>
            </div>
          </section>
        )}

        {activeTab === "transactions" && (
          <section className="fade-slide-in rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
            <div className="flex flex-col gap-4 border-b border-zinc-200 px-6 py-4 dark:border-zinc-800">
              <div>
                <h2 className="text-lg font-medium">Transactions</h2>
                <p className="mt-1 text-xs text-zinc-500">
                  Date range is set in the card above. Use filters to narrow this list.
                </p>
              </div>
              <div className="flex flex-col gap-3 rounded-xl border border-zinc-200 bg-zinc-50/80 p-4 dark:border-zinc-800 dark:bg-zinc-900/30">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                    Filter rows
                  </p>
                  <button
                    type="button"
                    onClick={clearTxFilters}
                    className="text-xs font-medium text-sky-600 hover:underline dark:text-sky-400"
                  >
                    Clear filters
                  </button>
                </div>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
                  <label className="flex flex-col gap-1 text-xs font-medium text-zinc-500">
                    Merchant contains
                    <input
                      type="search"
                      placeholder="Search…"
                      value={merchantFilter}
                      onChange={(e) => setMerchantFilter(e.target.value)}
                      className="h-9 rounded-lg border border-zinc-300 bg-white px-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-xs font-medium text-zinc-500">
                    Category
                    <select
                      className="h-9 rounded-lg border border-zinc-300 bg-white px-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
                      value={categoryFilterId}
                      onChange={(e) => setCategoryFilterId(e.target.value)}
                    >
                      <option value="">All</option>
                      {categories.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="flex flex-col gap-1 text-xs font-medium text-zinc-500">
                    Source
                    <select
                      className="h-9 rounded-lg border border-zinc-300 bg-white px-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
                      value={sourceFilter}
                      onChange={(e) =>
                        setSourceFilter(
                          e.target.value as
                            | ""
                            | "email"
                            | "image"
                            | "manual"
                            | "text",
                        )
                      }
                    >
                      <option value="">All</option>
                      <option value="email">Email (Gmail)</option>
                      <option value="image">Image / receipt</option>
                      <option value="text">Pasted text</option>
                      <option value="manual">Manual entry</option>
                    </select>
                  </label>
                  <label className="flex flex-col gap-1 text-xs font-medium text-zinc-500">
                    Min amount
                    <input
                      type="number"
                      step="any"
                      placeholder="Any"
                      value={minAmountInput}
                      onChange={(e) => setMinAmountInput(e.target.value)}
                      className="h-9 rounded-lg border border-zinc-300 bg-white px-2 text-sm tabular-nums dark:border-zinc-700 dark:bg-zinc-950"
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-xs font-medium text-zinc-500">
                    Max amount
                    <input
                      type="number"
                      step="any"
                      placeholder="Any"
                      value={maxAmountInput}
                      onChange={(e) => setMaxAmountInput(e.target.value)}
                      className="h-9 rounded-lg border border-zinc-300 bg-white px-2 text-sm tabular-nums dark:border-zinc-700 dark:bg-zinc-950"
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-xs font-medium text-zinc-500">
                    Type
                    <select
                      className="h-9 rounded-lg border border-zinc-300 bg-white px-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
                      value={txKindFilter}
                      onChange={(e) =>
                        setTxKindFilter(
                          e.target.value as "all" | "reversed" | "charges",
                        )
                      }
                    >
                      <option value="all">All</option>
                      <option value="reversed">Reversed transactions</option>
                      <option value="charges">Charges only</option>
                    </select>
                  </label>
                </div>
              </div>
              <div className="flex flex-wrap items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setEditTx(null);
                    setCreateTxOpen(true);
                  }}
                  className="h-9 rounded-lg bg-zinc-900 px-3 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
                >
                  Add transaction
                </button>
                {selectedTxCount > 0 && (
                  <>
                    <button
                      type="button"
                      disabled={bulkDeleteBusy}
                      onClick={() => void onBulkDeleteTransactions()}
                      className="h-9 rounded-lg border border-red-300 px-3 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-60 dark:border-red-800/60 dark:text-red-300 dark:hover:bg-red-900/20"
                    >
                      {bulkDeleteBusy
                        ? "Deleting…"
                        : `Delete selected (${selectedTxCount})`}
                    </button>
                    <button
                      type="button"
                      disabled={bulkDeleteBusy}
                      onClick={() => setSelectedTxIds(new Set())}
                      className="h-9 rounded-lg border border-zinc-300 px-3 text-sm text-zinc-600 hover:bg-zinc-50 disabled:opacity-60 dark:border-zinc-600 dark:text-zinc-400 dark:hover:bg-zinc-900/40"
                    >
                      Clear selection
                    </button>
                  </>
                )}
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead className="border-b border-zinc-200 bg-zinc-50 text-xs uppercase text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900/40">
                  <tr>
                    <th scope="col" className="w-10 px-2 py-3">
                      <span className="sr-only">Select row</span>
                      <input
                        ref={txHeaderSelectRef}
                        type="checkbox"
                        disabled={
                          loading ||
                          displayedTransactions.length === 0 ||
                          bulkDeleteBusy
                        }
                        checked={
                          displayedTransactions.length > 0 &&
                          displayedTransactions.every((t) => selectedTxIds.has(t.id))
                        }
                        onChange={toggleSelectAllDisplayed}
                        className="h-4 w-4 rounded border-zinc-300 text-zinc-900 dark:border-zinc-600"
                        aria-label="Select all visible rows"
                      />
                    </th>
                    <TransactionSortHeader
                      column="date"
                      activeColumn={txSort.column}
                      dir={txSort.dir}
                      onClick={() => onTxSortHeaderClick("date")}
                    >
                      Date
                    </TransactionSortHeader>
                    <TransactionSortHeader
                      column="merchant"
                      activeColumn={txSort.column}
                      dir={txSort.dir}
                      onClick={() => onTxSortHeaderClick("merchant")}
                    >
                      Merchant
                    </TransactionSortHeader>
                    <TransactionSortHeader
                      column="category"
                      activeColumn={txSort.column}
                      dir={txSort.dir}
                      onClick={() => onTxSortHeaderClick("category")}
                    >
                      Category
                    </TransactionSortHeader>
                    <TransactionSortHeader
                      column="source"
                      activeColumn={txSort.column}
                      dir={txSort.dir}
                      onClick={() => onTxSortHeaderClick("source")}
                    >
                      Source
                    </TransactionSortHeader>
                    <TransactionSortHeader
                      column="amount"
                      activeColumn={txSort.column}
                      dir={txSort.dir}
                      align="right"
                      onClick={() => onTxSortHeaderClick("amount")}
                    >
                      Amount
                    </TransactionSortHeader>
                    <th scope="col" className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-zinc-500">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-8 text-center text-zinc-500">
                        Loading…
                      </td>
                    </tr>
                  ) : transactions.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-8 text-center text-zinc-500">
                        No transactions in this range
                      </td>
                    </tr>
                  ) : displayedTransactions.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-8 text-center text-zinc-500">
                        No transactions match your filters
                      </td>
                    </tr>
                  ) : (
                    displayedTransactions.map((tx) => (
                      <tr
                        key={tx.id}
                        className="border-b border-zinc-100 dark:border-zinc-800/80"
                      >
                        <td className="px-2 py-3 align-middle">
                          <input
                            type="checkbox"
                            checked={selectedTxIds.has(tx.id)}
                            onChange={() => toggleTxRowSelected(tx.id)}
                            disabled={bulkDeleteBusy}
                            className="h-4 w-4 rounded border-zinc-300 text-zinc-900 dark:border-zinc-600"
                            aria-label={`Select ${tx.merchant ?? "transaction"}`}
                          />
                        </td>
                        <td className="px-4 py-3 tabular-nums text-zinc-600 dark:text-zinc-400">
                          {new Date(tx.occurredAt).toLocaleString()}
                        </td>
                        <td className="px-4 py-3">
                          {tx.merchant ?? "—"}
                          {tx.displayAsReversed && (
                            <span className="ml-2 rounded bg-violet-100 px-1.5 py-0.5 text-xs font-medium text-violet-900 dark:bg-violet-900/40 dark:text-violet-200">
                              Reversed
                            </span>
                          )}
                          {tx.needsReview && (
                            <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-900 dark:bg-amber-900/40 dark:text-amber-200">
                              review
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3">{tx.category?.name ?? "—"}</td>
                        <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400">
                          {tx.source === "email" &&
                          tx.externalId?.startsWith("email:") ? (
                            <button
                              type="button"
                              onClick={() =>
                                void openSourceEmailForTransaction(tx.id)
                              }
                              className="text-sm font-medium text-sky-600 underline decoration-sky-600/40 underline-offset-2 hover:text-sky-700 dark:text-sky-400 dark:hover:text-sky-300"
                            >
                              Email
                            </button>
                          ) : (
                            <span className="text-sm text-zinc-700 dark:text-zinc-300">
                              {tx.source === "image"
                                ? "Image"
                                : tx.source === "text"
                                  ? "Pasted text"
                                  : tx.source === "manual"
                                    ? "Manual"
                                    : tx.source === "email"
                                      ? "Email"
                                      : tx.source}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right font-medium tabular-nums">
                          {formatMoney(tx.amount, tx.currency)}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="inline-flex flex-wrap items-center justify-end gap-2">
                            <button
                              type="button"
                              disabled={multiRowSelect}
                              title={
                                multiRowSelect
                                  ? "Clear multi-select to edit one transaction at a time"
                                  : undefined
                              }
                              onClick={() => {
                                setCreateTxOpen(false);
                                setEditTx(tx);
                              }}
                              className="h-8 rounded-md border border-zinc-300 px-3 text-xs font-medium text-zinc-700 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900/40"
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              disabled={deleteBusyId === tx.id}
                              onClick={() => void onDeleteTransaction(tx.id)}
                              className="h-8 rounded-md border border-red-300 px-3 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-60 dark:border-red-800/60 dark:text-red-300 dark:hover:bg-red-900/20"
                            >
                              {deleteBusyId === tx.id ? "Deleting..." : "Delete"}
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {activeTab === "parse-history" && (
          <ParseHistoryView
            historyRevision={parseHistoryRevision}
            onOpenGmailMessage={(id) => {
              setActiveTab("gmail");
              setForceOpenEmailId(id);
            }}
          />
        )}

        {activeTab === "settings" && (
          <section className="fade-slide-in max-w-xl space-y-8 rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
            <div>
              <h2 className="text-lg font-medium">Settings</h2>
              <p className="mt-1 text-xs text-zinc-500">
                Theme is saved in this browser. Preferred import currency is saved
                to your account and used when parsing email, paste, and receipt
                uploads.
              </p>
            </div>
            <div className="space-y-3">
              <h3 className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
                Theme
              </h3>
              <p className="text-xs text-zinc-500">
                Default is dark. Your choice is saved in this browser only.
              </p>
              <div
                className="inline-flex rounded-xl border border-zinc-200 p-1 dark:border-zinc-700"
                role="group"
                aria-label="Color theme"
              >
                <button
                  type="button"
                  onClick={() => setTheme("light")}
                  className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                    theme === "light"
                      ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                      : "text-zinc-600 hover:bg-zinc-50 dark:text-zinc-400 dark:hover:bg-zinc-900/60"
                  }`}
                >
                  Light
                </button>
                <button
                  type="button"
                  onClick={() => setTheme("dark")}
                  className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                    theme === "dark"
                      ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                      : "text-zinc-600 hover:bg-zinc-50 dark:text-zinc-400 dark:hover:bg-zinc-900/60"
                  }`}
                >
                  Dark
                </button>
              </div>
            </div>
            <div className="space-y-3 border-t border-zinc-100 pt-6 dark:border-zinc-800">
              <h3 className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
                Preferred import currency
              </h3>
              <p className="text-xs text-zinc-500">
                When you choose USD, SGD, or EUR, new transactions are stored in
                that currency. If the receipt is in another currency, the amount is
                converted using Frankfurter&apos;s latest USD-based rates at the
                moment you import. A short note is added to the transaction when a
                conversion runs.
              </p>
              <div
                className="flex flex-wrap gap-2"
                role="group"
                aria-label="Preferred import currency"
                aria-busy={importPrefBusy}
              >
                <button
                  type="button"
                  disabled={importPrefBusy}
                  onClick={() => void persistPreferredImportCurrency(null)}
                  className={`rounded-lg border px-3 py-2 text-sm font-medium transition-colors disabled:opacity-60 ${
                    preferredImportCurrency === null
                      ? "border-zinc-900 bg-zinc-900 text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900"
                      : "border-zinc-200 text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900/60"
                  }`}
                >
                  Receipt currency
                </button>
                {(["USD", "SGD", "EUR"] as const satisfies readonly ImportStoreCurrency[]).map(
                  (code) => (
                    <button
                      key={code}
                      type="button"
                      disabled={importPrefBusy}
                      onClick={() => void persistPreferredImportCurrency(code)}
                      className={`rounded-lg border px-3 py-2 text-sm font-medium transition-colors disabled:opacity-60 ${
                        preferredImportCurrency === code
                          ? "border-zinc-900 bg-zinc-900 text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900"
                          : "border-zinc-200 text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900/60"
                      }`}
                    >
                      {code}
                    </button>
                  ),
                )}
              </div>
            </div>
            <div className="space-y-2 border-t border-zinc-100 pt-6 dark:border-zinc-800">
              <h3 className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
                Display currency
              </h3>
              <p className="text-xs leading-snug text-zinc-500">
                Each row uses its stored currency and is converted to the header
                currency for display (Frankfurter rates).
                <br />
                Overview totals are shown as one rescaled figure, not a mixed-currency
                ledger sum. Change currency from the header anytime.
              </p>
            </div>
          </section>
        )}
      </div>
    </div>
      {parseToast && (
        <div className="pointer-events-none fixed bottom-4 right-4 z-[85] max-w-sm p-0">
          <div className="pointer-events-auto flex items-start gap-2 rounded-xl border border-emerald-600/40 bg-emerald-950/95 px-4 py-3 text-sm text-emerald-50 shadow-lg dark:border-emerald-500/50 dark:bg-emerald-950 dark:text-emerald-100">
            <span className="min-w-0 flex-1">{parseToast}</span>
            <button
              type="button"
              onClick={() => {
                if (parseToastTimerRef.current) {
                  clearTimeout(parseToastTimerRef.current);
                  parseToastTimerRef.current = null;
                }
                setParseToast(null);
              }}
              className="shrink-0 rounded border border-emerald-500/50 px-2 py-0.5 text-xs font-medium text-emerald-100 hover:bg-emerald-900/80"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}
      <ParseJobModal
        open={batchModalOpen}
        running={batchRunning}
        done={batchDone}
        total={batchTotal}
        currentLabel={batchCurrentLabel}
        results={batchResults}
        job={batchParseJob}
        parseTransactionActions={
          !batchRunning &&
          batchResults.some((r) =>
            (r.createdTransactions ?? []).some((line) => Boolean(line.id)),
          )
            ? {
                enabled: true,
                onEdit: openEditFromParseSummary,
                onDelete: onDeleteFromParseSummary,
                deleteBusyId: parseSummaryDeleteBusyId,
              }
            : undefined
        }
        onClose={() => {
          if (batchRunning) return;
          setBatchParseJob((job) => {
            if (job?.kind === "receipt") {
              for (const s of job.sources) URL.revokeObjectURL(s.previewUrl);
            }
            return null;
          });
          setBatchModalOpen(false);
          setReceiptQueue([]);
          window.setTimeout(() => {
            if (receiptFileInputRef.current) receiptFileInputRef.current.value = "";
          }, 0);
        }}
      />
      <EmailBodyPreviewDialog
        key={sourceEmailTxId ?? "closed"}
        open={sourceEmailTxId !== null}
        onClose={closeSourceEmailDialog}
        loading={sourceEmailLoading}
        error={sourceEmailError}
        detail={sourceEmailDetail}
      />
      <TransactionEditModal
        key="edit-modal"
        variant="edit"
        open={Boolean(editTx)}
        tx={editTx}
        categories={categories}
        saving={editSaving}
        onClose={() => {
          if (!editSaving) setEditTx(null);
        }}
        onSave={onSaveTransactionEdit}
      />
      <TransactionEditModal
        key="create-modal"
        variant="create"
        open={createTxOpen}
        categories={categories}
        saving={createSaving}
        onClose={() => {
          if (!createSaving) setCreateTxOpen(false);
        }}
        onCreate={onCreateTransaction}
      />
    </>
  );
}

export function DashboardClient(props: {
  googleOAuthEnabled: boolean;
  gmailConnection: GmailConnectionState;
  gmailDisplayEmail: string | null;
}) {
  return (
    <Suspense
      fallback={
        <div className="rounded-2xl border border-zinc-200 bg-white p-8 text-sm text-zinc-500 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
          Loading dashboard…
        </div>
      }
    >
      <DashboardClientImpl {...props} />
    </Suspense>
  );
}
