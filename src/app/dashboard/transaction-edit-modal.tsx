"use client";

import type { TransactionJson } from "@/lib/transaction-json";
import { useEffect, useState } from "react";

export type CategoryOption = { id: string; name: string; slug: string };

export type TransactionFormPayload = {
  amount: number;
  currency: string;
  occurredAt: string;
  merchant: string | null;
  notes: string | null;
  categoryId: string | null;
  needsReview: boolean;
};

const TX_CURRENCIES = ["USD", "SGD", "EUR"] as const;
type TxCurrency = (typeof TX_CURRENCIES)[number];

function normalizeTxCurrency(raw: string | undefined): TxCurrency {
  const u = (raw || "USD").toUpperCase();
  return (TX_CURRENCIES as readonly string[]).includes(u) ? (u as TxCurrency) : "USD";
}

function localDatetimeInputValue(d: Date): string {
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

type TransactionEditModalProps =
  | {
      variant?: "edit";
      open: boolean;
      tx: TransactionJson | null;
      categories: CategoryOption[];
      saving: boolean;
      onClose: () => void;
      onSave: (payload: TransactionFormPayload & { id: string }) => Promise<void>;
    }
  | {
      variant: "create";
      open: boolean;
      tx?: null;
      categories: CategoryOption[];
      saving: boolean;
      onClose: () => void;
      onCreate: (payload: TransactionFormPayload) => Promise<void>;
    };

export function TransactionEditModal(props: TransactionEditModalProps) {
  const isCreate = props.variant === "create";
  const { open, categories, saving, onClose } = props;
  const tx = isCreate ? null : props.tx;

  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState<TxCurrency>("USD");
  const [occurredAt, setOccurredAt] = useState("");
  const [merchant, setMerchant] = useState("");
  const [notes, setNotes] = useState("");
  const [categoryId, setCategoryId] = useState<string>("");
  const [needsReview, setNeedsReview] = useState(false);

  useEffect(() => {
    if (!open) return;
    queueMicrotask(() => {
      if (isCreate) {
        setAmount("");
        setCurrency("USD");
        setOccurredAt(localDatetimeInputValue(new Date()));
        setMerchant("");
        setNotes("");
        setCategoryId("");
        setNeedsReview(false);
        return;
      }
      if (tx) {
        setAmount(String(tx.amount));
        setCurrency(normalizeTxCurrency(tx.currency));
        setOccurredAt(tx.occurredAt.slice(0, 16));
        setMerchant(tx.merchant ?? "");
        setNotes(tx.notes ?? "");
        setCategoryId(tx.category?.id ?? "");
        setNeedsReview(tx.needsReview);
      }
    });
  }, [open, isCreate, tx]);

  if (!open) return null;
  if (!isCreate && !tx) return null;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const parsedAmount = Number(amount);
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) return;
    if (!occurredAt) return;
    const payload: TransactionFormPayload = {
      amount: parsedAmount,
      currency,
      occurredAt: new Date(occurredAt).toISOString(),
      merchant: merchant.trim() || null,
      notes: notes.trim() || null,
      categoryId: categoryId || null,
      needsReview,
    };
    if (props.variant === "create") {
      await props.onCreate(payload);
    } else if (tx) {
      await props.onSave({ ...payload, id: tx.id });
    }
  }

  const title = isCreate ? "Add transaction" : "Edit transaction";
  const titleId = isCreate ? "tx-create-title" : "tx-edit-title";
  const submitLabel =
    saving ? (isCreate ? "Adding…" : "Saving…") : isCreate ? "Add" : "Save";

  return (
    <div
      className="fixed inset-0 z-[65] flex items-end justify-center bg-black/50 p-4 sm:items-center"
      role="presentation"
      onClick={!saving ? onClose : undefined}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="w-full max-w-xl rounded-2xl border border-zinc-200 bg-white shadow-xl dark:border-zinc-700 dark:bg-zinc-950"
        onClick={(e) => e.stopPropagation()}
      >
        <form onSubmit={submit} className="space-y-4 p-5">
          <h3 id={titleId} className="text-lg font-semibold">
            {title}
          </h3>
          {isCreate && (
            <p className="text-xs text-zinc-500">
              Creates a manual entry included in spend totals for the chosen date.
            </p>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm">
              <span className="mb-1 block text-xs text-zinc-500">Amount</span>
              <input
                className="h-10 w-full rounded-lg border border-zinc-300 bg-white px-3 text-sm dark:border-zinc-700 dark:bg-zinc-950"
                type="number"
                step="0.01"
                min="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                required
              />
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-xs text-zinc-500">Currency</span>
              <select
                className="h-10 w-full rounded-lg border border-zinc-300 bg-white px-3 text-sm dark:border-zinc-700 dark:bg-zinc-950"
                value={currency}
                onChange={(e) => setCurrency(e.target.value as TxCurrency)}
                required
              >
                {TX_CURRENCIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label className="block text-sm">
            <span className="mb-1 block text-xs text-zinc-500">Occurred at</span>
            <input
              className="h-10 w-full rounded-lg border border-zinc-300 bg-white px-3 text-sm dark:border-zinc-700 dark:bg-zinc-950"
              type="datetime-local"
              value={occurredAt}
              onChange={(e) => setOccurredAt(e.target.value)}
              required
            />
          </label>

          <label className="block text-sm">
            <span className="mb-1 block text-xs text-zinc-500">Merchant</span>
            <input
              className="h-10 w-full rounded-lg border border-zinc-300 bg-white px-3 text-sm dark:border-zinc-700 dark:bg-zinc-950"
              value={merchant}
              onChange={(e) => setMerchant(e.target.value)}
            />
          </label>

          <label className="block text-sm">
            <span className="mb-1 block text-xs text-zinc-500">Category</span>
            <select
              className="h-10 w-full rounded-lg border border-zinc-300 bg-white px-3 text-sm dark:border-zinc-700 dark:bg-zinc-950"
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
            >
              <option value="">Uncategorized</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>

          <label className="block text-sm">
            <span className="mb-1 block text-xs text-zinc-500">Notes</span>
            <textarea
              className="min-h-[90px] w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </label>

          <label className="inline-flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={needsReview}
              onChange={(e) => setNeedsReview(e.target.checked)}
            />
            Mark as needs review
          </label>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="h-9 rounded-md border border-zinc-300 px-3 text-sm disabled:opacity-50 dark:border-zinc-700"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="h-9 rounded-md bg-zinc-900 px-3 text-sm font-medium text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
            >
              {submitLabel}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
