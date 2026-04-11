import { auth } from "@/auth";
import {
  extractTransactionFromText,
  isDeclinedTransactionEmail,
  parseOccurredAt,
  resolveCategoryId,
} from "@/lib/gemini";
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

  const tx = await prisma.transaction.create({
    data: {
      userId: session.user.id,
      amount: extracted.amount,
      currency: extracted.currency,
      occurredAt: parseOccurredAt(extracted.date),
      merchant: extracted.merchant ?? undefined,
      notes: extracted.notes ?? undefined,
      source: "email",
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
