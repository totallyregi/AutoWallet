"use client";

export type DateRangeMode = "quick" | "custom";

type DateRangeControlsProps = {
  /** `overview` uses slightly taller controls; `transactions` is more compact. */
  variant: "overview" | "transactions";
  dateRangeMode: DateRangeMode;
  onDateRangeModeChange: (mode: DateRangeMode) => void;
  spendMonth: number | null;
  spendYear: number;
  onSpendMonthChange: (month: number | null) => void;
  onSpendYearChange: (year: number) => void;
  customRangeFrom: string;
  customRangeTo: string;
  onCustomFromChange: (value: string) => void;
  onCustomToChange: (value: string) => void;
  yearSelectOptions: number[];
  monthOptions: readonly { value: number; label: string }[];
};

const modeBtn =
  "rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors dark:border-zinc-600";

export function DateRangeControls({
  variant,
  dateRangeMode,
  onDateRangeModeChange,
  spendMonth,
  spendYear,
  onSpendMonthChange,
  onSpendYearChange,
  customRangeFrom,
  customRangeTo,
  onCustomFromChange,
  onCustomToChange,
  yearSelectOptions,
  monthOptions,
}: DateRangeControlsProps) {
  const selectH = variant === "overview" ? "h-10" : "h-9";
  const selectPad = variant === "overview" ? "px-3" : "px-2";
  const selectClass = `${selectH} rounded-lg border border-zinc-300 bg-white ${selectPad} text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100`;
  const monthMinW = variant === "overview" ? "min-w-[160px]" : "min-w-[150px]";
  const yearMinW = variant === "overview" ? "min-w-[100px]" : "min-w-[92px]";
  const dateInputClass =
    "h-9 w-full min-w-[140px] rounded-lg border border-zinc-300 bg-white px-2 text-sm dark:border-zinc-700 dark:bg-zinc-950 sm:h-10";

  /** Fixed min height so switching quick ↔ custom does not move content below. */
  const bodyMinH = "min-h-[8.75rem]";

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => onDateRangeModeChange("quick")}
          className={`${modeBtn} ${
            dateRangeMode === "quick"
              ? "border-zinc-900 bg-zinc-900 text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900"
              : "border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-300 dark:hover:bg-zinc-900/50"
          }`}
        >
          By month &amp; year
        </button>
        <button
          type="button"
          onClick={() => onDateRangeModeChange("custom")}
          className={`${modeBtn} ${
            dateRangeMode === "custom"
              ? "border-zinc-900 bg-zinc-900 text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900"
              : "border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-300 dark:hover:bg-zinc-900/50"
          }`}
        >
          Custom range
        </button>
      </div>

      <div className={bodyMinH}>
        {dateRangeMode === "quick" ? (
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1 text-xs font-medium text-zinc-500">
              Month
              <select
                className={`${selectClass} ${monthMinW}`}
                value={spendMonth ?? ""}
                onChange={(e) => {
                  const v = e.target.value;
                  onSpendMonthChange(v === "" ? null : Number(v));
                }}
              >
                <option value="">All months</option>
                {monthOptions.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs font-medium text-zinc-500">
              Year
              <select
                className={`${selectClass} ${yearMinW} tabular-nums`}
                value={spendYear}
                onChange={(e) => onSpendYearChange(Number(e.target.value))}
              >
                {yearSelectOptions.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </label>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap items-end gap-3">
              <label className="flex min-w-[140px] flex-1 flex-col gap-1 text-xs font-medium text-zinc-500 sm:max-w-[200px]">
                Start date
                <input
                  type="date"
                  className={dateInputClass}
                  value={customRangeFrom}
                  onChange={(e) => onCustomFromChange(e.target.value)}
                />
              </label>
              <label className="flex min-w-[140px] flex-1 flex-col gap-1 text-xs font-medium text-zinc-500 sm:max-w-[200px]">
                End date
                <input
                  type="date"
                  className={dateInputClass}
                  value={customRangeTo}
                  onChange={(e) => onCustomToChange(e.target.value)}
                />
              </label>
            </div>
            <p className="text-xs leading-snug text-zinc-500 dark:text-zinc-400">
              Uses start of the first day through end of the last day. If start is
              after end, the range is swapped automatically.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
