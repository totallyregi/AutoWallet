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
  const fieldH = variant === "overview" ? "h-10" : "h-9";
  const controlBox = `w-full ${fieldH} min-w-0 rounded-lg border border-zinc-300 bg-white px-2 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100`;

  return (
    <div className="ms-auto flex w-full max-w-md flex-col items-end gap-3">
      <div className="flex flex-shrink-0 flex-wrap justify-end gap-2">
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

      <div
        className={`w-full ${variant === "overview" ? "h-[5.5rem]" : "h-[5.25rem]"}`}
      >
        <div className="grid h-full grid-cols-2 gap-3">
          {dateRangeMode === "quick" ? (
            <>
              <label className="flex min-h-0 flex-col justify-end gap-1 text-left text-xs font-medium text-zinc-500">
                Month
                <select
                  className={controlBox}
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
              <label className="flex min-h-0 flex-col justify-end gap-1 text-left text-xs font-medium text-zinc-500">
                Year
                <select
                  className={`${controlBox} tabular-nums`}
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
            </>
          ) : (
            <>
              <label className="flex min-h-0 flex-col justify-end gap-1 text-left text-xs font-medium text-zinc-500">
                Start date
                <input
                  type="date"
                  className={controlBox}
                  value={customRangeFrom}
                  onChange={(e) => onCustomFromChange(e.target.value)}
                />
              </label>
              <label className="flex min-h-0 flex-col justify-end gap-1 text-left text-xs font-medium text-zinc-500">
                End date
                <input
                  type="date"
                  className={controlBox}
                  value={customRangeTo}
                  onChange={(e) => onCustomToChange(e.target.value)}
                />
              </label>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
