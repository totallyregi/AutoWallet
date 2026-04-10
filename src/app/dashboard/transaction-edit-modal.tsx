"use client";

import type { TransactionJson } from "@/lib/transaction-json";
import { useState } from "react";

export type CategoryOption = { id: string; name: string; slug: string };

type TransactionEditModalProps = {
  open: boolean;
  tx: TransactionJson | null;
  categories: CategoryOption[];
  saving: boolean;
  onClose: () => void;
  onSave: (payload: {
    id: string;
    amount: number;
    currency: string;
    occurredAt: string;
    merchant: string | null;
    notes: string | null;
    categoryId: string | null;
    needsReview: boolean;
  }) => Promise<void>;
};

export function TransactionEditModal({
  open,
  tx,
  categories,
  saving,
  onClose,
  onSave,
}: TransactionEditModalProps) {
  const [amount, setAmount] = useState(() => (tx ? String(tx.amount) : ""));
  const [currency, setCurrency] = useState(() =>
    tx ? (tx.currency || "USD").toUpperCase() : "USD",
  );
  const [occurredAt, setOccurredAt] = useState(() =>
    tx ? tx.occurredAt.slice(0, 16) : "",
  );
  const [merchant, setMerchant] = useState(() => tx?.merchant ?? "");
  const [notes, setNotes] = useState(() => tx?.notes ?? "");
  const [categoryId, setCategoryId] = useState<string>(() => tx?.category?.id ?? "");
  const [needsReview, setNeedsReview] = useState(() => tx?.needsReview ?? false);

  if (!open || !tx) return null;
  const txId = tx.id;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const parsedAmount = Number(amount);
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) return;
    if (!occurredAt) return;
    await onSave({
      id: txId,
      amount: parsedAmount,
      currency: currency.trim().toUpperCase(),
      occurredAt: new Date(occurredAt).toISOString(),
      merchant: merchant.trim() || null,
      notes: notes.trim() || null,
      categoryId: categoryId || null,
      needsReview,
    });
  }

  return (
    <div
      className="fixed inset-0 z-[65] flex items-end justify-center bg-black/50 p-4 sm:items-center"
      role="presentation"
      onClick={!saving ? onClose : undefined}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="tx-edit-title"
        className="w-full max-w-xl rounded-2xl border border-zinc-200 bg-white shadow-xl dark:border-zinc-700 dark:bg-zinc-950"
        onClick={(e) => e.stopPropagation()}
      >
        <form onSubmit={submit} className="space-y-4 p-5">
          <h3 id="tx-edit-title" className="text-lg font-semibold">
            Edit transaction
          </h3>

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
              <input
                className="h-10 w-full rounded-lg border border-zinc-300 bg-white px-3 text-sm uppercase dark:border-zinc-700 dark:bg-zinc-950"
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                maxLength={8}
                required
              />
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
              {saving ? "Saving..." : "Save"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

