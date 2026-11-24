"use client";

export type DateRangeMode = "quick" | "custom";

type DateRangeControlsProps = {
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
  "h-9 w-full rounded-lg border px-2 text-sm font-medium transition-colors dark:border-zinc-600";

export function DateRangeControls({
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
  const fieldH = "h-9";
  const controlBox = `w-full ${fieldH} min-w-0 aw-input px-2 text-sm`;

  return (
    <div className="ms-auto flex w-full max-w-md flex-col gap-2">
      <div className="grid w-full grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => onDateRangeModeChange("quick")}
          className={`${modeBtn} ${
            dateRangeMode === "quick"
              ? "border-transparent bg-gradient-to-br from-emerald-400 to-teal-400 font-semibold text-emerald-950 shadow"
              : "border-[var(--aw-border)] text-[var(--aw-muted)] hover:border-emerald-400/40 hover:text-[var(--foreground)]"
          }`}
        >
          By month &amp; year
        </button>
        <button
          type="button"
          onClick={() => onDateRangeModeChange("custom")}
          className={`${modeBtn} ${
            dateRangeMode === "custom"
              ? "border-transparent bg-gradient-to-br from-emerald-400 to-teal-400 font-semibold text-emerald-950 shadow"
              : "border-[var(--aw-border)] text-[var(--aw-muted)] hover:border-emerald-400/40 hover:text-[var(--foreground)]"
          }`}
        >
          Custom range
        </button>
      </div>

      <div className="grid w-full grid-cols-2 gap-2">
        {dateRangeMode === "quick" ? (
          <>
            <label className="flex min-w-0 flex-col gap-1 text-left text-xs font-medium text-zinc-500">
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
            <label className="flex min-w-0 flex-col gap-1 text-left text-xs font-medium text-zinc-500">
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
            <label className="flex min-w-0 flex-col gap-1 text-left text-xs font-medium text-zinc-500">
              Start date
              <input
                type="date"
                className={controlBox}
                value={customRangeFrom}
                onChange={(e) => onCustomFromChange(e.target.value)}
              />
            </label>
            <label className="flex min-w-0 flex-col gap-1 text-left text-xs font-medium text-zinc-500">
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
  );
}
