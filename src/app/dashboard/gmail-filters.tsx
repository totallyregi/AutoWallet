"use client";

type GmailFiltersProps = {
  senderEmail: string;
  onSenderChange: (value: string) => void;
  onSaveSender: (e: React.FormEvent) => void;
  senderBusy: boolean;
  gmailAfter: string;
  onAfterChange: (value: string) => void;
  gmailBefore: string;
  onBeforeChange: (value: string) => void;
  gmailSearch: string;
  onSearchChange: (value: string) => void;
  onApplyListFilters: () => void;
  listLoading: boolean;
};

export function GmailFilters({
  senderEmail,
  onSenderChange,
  onSaveSender,
  senderBusy,
  gmailAfter,
  onAfterChange,
  gmailBefore,
  onBeforeChange,
  gmailSearch,
  onSearchChange,
  onApplyListFilters,
  listLoading,
}: GmailFiltersProps) {
  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950 sm:p-6">
      <h2 className="text-lg font-medium tracking-tight">Gmail sender filter</h2>
      <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
        Set your bank sender and optional date range or Gmail search, then apply to
        refresh the list. Saving the sender updates your account preference.
      </p>

      <div className="mt-5 space-y-5">
        <form
          onSubmit={onSaveSender}
          className="flex flex-col gap-3 border-b border-zinc-100 pb-5 dark:border-zinc-800/80 sm:flex-row sm:items-end"
        >
          <label className="min-w-0 flex-1">
            <span className="mb-1 block text-xs font-medium text-zinc-500">
              Sender email (optional)
            </span>
            <input
              className="h-10 w-full rounded-lg border border-zinc-300 bg-white px-3 text-sm dark:border-zinc-700 dark:bg-zinc-950"
              placeholder="alerts@yourbank.com"
              type="email"
              autoComplete="email"
              value={senderEmail}
              onChange={(e) => onSenderChange(e.target.value)}
            />
          </label>
          <button
            type="submit"
            disabled={senderBusy}
            className="h-10 shrink-0 rounded-lg bg-zinc-900 px-4 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900"
          >
            {senderBusy ? "Saving…" : "Save sender"}
          </button>
        </form>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-12 lg:items-end">
          <label className="lg:col-span-2">
            <span className="mb-1 block text-xs font-medium text-zinc-500">
              After
            </span>
            <input
              type="date"
              className="h-10 w-full rounded-lg border border-zinc-300 bg-white px-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
              value={gmailAfter}
              onChange={(e) => onAfterChange(e.target.value)}
            />
          </label>
          <label className="lg:col-span-2">
            <span className="mb-1 block text-xs font-medium text-zinc-500">
              Before
            </span>
            <input
              type="date"
              className="h-10 w-full rounded-lg border border-zinc-300 bg-white px-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
              value={gmailBefore}
              onChange={(e) => onBeforeChange(e.target.value)}
            />
          </label>
          <label className="sm:col-span-2 lg:col-span-6">
            <span className="mb-1 block text-xs font-medium text-zinc-500">
              Search (Gmail query)
            </span>
            <input
              className="h-10 w-full rounded-lg border border-zinc-300 bg-white px-3 text-sm dark:border-zinc-700 dark:bg-zinc-950"
              placeholder="e.g. receipt OR alert"
              value={gmailSearch}
              onChange={(e) => onSearchChange(e.target.value)}
            />
          </label>
          <div className="flex sm:col-span-2 lg:col-span-2">
            <button
              type="button"
              onClick={onApplyListFilters}
              disabled={listLoading}
              className="h-10 w-full rounded-lg bg-zinc-900 px-4 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900"
            >
              {listLoading ? "Loading…" : "Apply"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
