import {
  extractTransactionFromText,
  parseOccurredAt,
  resolveCategoryId,
} from "@/lib/gemini";
import prisma from "@/lib/prisma";
import { transactionToJson } from "@/lib/transaction-json";
import { createHash } from "crypto";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

function hashDedupe(parts: string): string {
  return createHash("sha256").update(parts).digest("hex").slice(0, 32);
}

export async function POST(req: NextRequest) {
  const secret = req.headers.get("x-ingest-secret");
  if (!secret || secret !== process.env.EMAIL_INGEST_SECRET) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const ingestEmail = process.env.INGEST_USER_EMAIL;
  if (!ingestEmail) {
    return NextResponse.json(
      { error: "INGEST_USER_EMAIL is not configured" },
      { status: 500 },
    );
  }

  const user = await prisma.user.findUnique({
    where: { email: ingestEmail },
  });
  if (!user) {
    return NextResponse.json(
      { error: "INGEST_USER_EMAIL user not found" },
      { status: 404 },
    );
  }

  const body = (await req.json()) as {
    subject?: string;
    text?: string;
    messageId?: string;
  };

  const subject = body.subject ?? "";
  const text = body.text ?? "";
  const combined = `Subject: ${subject}\n\n${text}`.slice(0, 16000);

  const externalId = body.messageId
    ? `email:${body.messageId}`
    : `email:sha:${hashDedupe(subject + "\n" + text)}`;

  const existing = await prisma.transaction.findUnique({
    where: { externalId },
  });
  if (existing) {
    return NextResponse.json({
      ok: true,
      duplicate: true,
      transaction: transactionToJson(
        await prisma.transaction.findUniqueOrThrow({
          where: { id: existing.id },
          include: { category: true },
        }),
      ),
    });
  }

  const extracted = await extractTransactionFromText(combined);
  const categoryId = await resolveCategoryId(extracted.categorySlug);
  const confidence = extracted.confidence ?? 0.75;
  const needsReview = confidence < 0.6;

  const tx = await prisma.transaction.create({
    data: {
      userId: user.id,
      amount: extracted.amount,
      currency: extracted.currency,
      occurredAt: parseOccurredAt(extracted.date),
      merchant: extracted.merchant ?? undefined,
      notes: extracted.notes ?? undefined,
      source: "email",
      rawSnippet: combined.slice(0, 4000),
      externalId,
      confidence,
      needsReview,
      categoryId,
    },
    include: { category: true },
  });

  return NextResponse.json({
    ok: true,
    transaction: transactionToJson(tx),
  });
}
