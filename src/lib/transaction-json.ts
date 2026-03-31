import type { Category, Transaction } from "@prisma/client";

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
};

export function transactionToJson(
  t: Transaction & { category: Category | null },
): TransactionJson {
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
  };
}
