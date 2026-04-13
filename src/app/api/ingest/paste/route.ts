import { auth } from "@/auth";
import {
  extractTransactionFromText,
  isDeclinedTransactionEmail,
  parseOccurredAt,
  resolveCategoryId,
} from "@/lib/gemini";

/** Keep pasted rows visible with typical dashboard year filters when the model picks a far past/future date. */
function clampPasteOccurredAt(parsed: Date, now = new Date()): Date {
  if (Number.isNaN(parsed.getTime())) return now;
  const min = new Date(now);
  min.setUTCFullYear(min.getUTCFullYear() - 5);
  const max = new Date(now);
  max.setUTCMonth(max.getUTCMonth() + 18);
  const t = parsed.getTime();
  if (t < min.getTime() || t > max.getTime()) return now;
  return parsed;
}
import {
  normalizePreferredImportCurrency,
  resolveImportAmountAndCurrency,
} from "@/lib/import-currency-convert";
import prisma from "@/lib/prisma";
import { transactionToJson } from "@/lib/transaction-json";
import { createHash } from "crypto";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json()) as { text?: string };
  const text = body.text?.trim();
  if (!text) {
    return NextResponse.json({ error: "text required" }, { status: 400 });
  }

  const digest = createHash("sha256").update(text).digest("hex").slice(0, 32);
  const externalId = `paste:${session.user.id}:${digest}`;

  const existing = await prisma.transaction.findUnique({ where: { externalId } });
  if (existing) {
    const full = await prisma.transaction.findUniqueOrThrow({
      where: { id: existing.id },
      include: { category: true },
    });
    return NextResponse.json({
      duplicate: true,
      transaction: transactionToJson(full),
    });
  }

  if (isDeclinedTransactionEmail(text)) {
    return NextResponse.json({ skippedDeclined: true, duplicate: false });
  }

  const extracted = await extractTransactionFromText(text);
  const categoryId = await resolveCategoryId(extracted.categorySlug);
  const confidence = extracted.confidence ?? 0.75;
  const needsReview = confidence < 0.6;

  const occurredRaw = parseOccurredAt(extracted.date);
  const occurredAt = clampPasteOccurredAt(occurredRaw);

  const userRow = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { preferredImportCurrency: true },
  });
  const importPref = normalizePreferredImportCurrency(
    userRow?.preferredImportCurrency,
  );
  const resolved = await resolveImportAmountAndCurrency(
    extracted.amount,
    extracted.currency,
    importPref,
  );
  const notesMerged = [extracted.notes, resolved.fxNote]
    .filter((x): x is string => Boolean(x?.trim()))
    .join(" | ");

  const tx = await prisma.transaction.create({
    data: {
      userId: session.user.id,
      amount: resolved.amount,
      currency: resolved.currency,
      occurredAt,
      merchant: extracted.merchant ?? undefined,
      notes: notesMerged || undefined,
      source: "text",
      rawSnippet: text.slice(0, 4000),
      externalId,
      confidence,
      needsReview,
      categoryId,
    },
    include: { category: true },
  });

  return NextResponse.json({ transaction: transactionToJson(tx) });
}
