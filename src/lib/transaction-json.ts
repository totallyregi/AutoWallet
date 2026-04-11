import type { Category, Transaction } from "@prisma/client";
import {
  VOIDED_BY_PRIOR_REVERSAL_SUBSTRING,
  VOIDED_BY_SUBSEQUENT_REVERSAL_SUBSTRING,
} from "@/lib/reversal-constants";

export type TransactionJson = {
  id: string;
  amount: number;
  currency: string;
  occurredAt: string;
  merchant: string | null;
  notes: string | null;
  source: string;
  needsReview: boolean;
  confidence: number | null;
  imageUrl: string | null;
  externalId: string | null;
  category: { id: string; name: string; slug: string } | null;
  excludedFromSpend: boolean;
  isReversalLine: boolean;
  /** Email-sourced charge voided by reversal pairing (shown in list, excluded from summary). */
  displayAsReversed: boolean;
};

export function transactionToJson(
  t: Transaction & { category: Category | null },
): TransactionJson {
  const n = t.notes ?? "";
  const displayAsReversed =
    t.source === "email" &&
    !t.isReversalLine &&
    t.excludedFromSpend &&
    (n.includes(VOIDED_BY_PRIOR_REVERSAL_SUBSTRING) ||
      n.includes(VOIDED_BY_SUBSEQUENT_REVERSAL_SUBSTRING));

  return {
    id: t.id,
    amount: Number(t.amount),
    currency: t.currency,
    occurredAt: t.occurredAt.toISOString(),
    merchant: t.merchant,
    notes: t.notes,
    source: t.source,
    needsReview: t.needsReview,
    confidence: t.confidence,
    imageUrl: t.imageUrl,
    externalId: t.externalId,
    category: t.category
      ? { id: t.category.id, name: t.category.name, slug: t.category.slug }
      : null,
    excludedFromSpend: t.excludedFromSpend,
    isReversalLine: t.isReversalLine,
    displayAsReversed,
  };
}
