import { auth } from "@/auth";
import {
  VOIDED_BY_PRIOR_REVERSAL_SUBSTRING,
  VOIDED_BY_SUBSEQUENT_REVERSAL_SUBSTRING,
} from "@/lib/reversal-constants";
import prisma from "@/lib/prisma";
import { transactionToJson } from "@/lib/transaction-json";
import type { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const postBodySchema = z.object({
  amount: z.number().positive(),
  currency: z
    .string()
    .trim()
    .transform((s) => s.toUpperCase())
    .pipe(z.enum(["USD", "SGD", "EUR"])),
  occurredAt: z.string().datetime(),
  merchant: z.string().trim().max(500).nullable().optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
  categoryId: z.string().trim().min(1).nullable().optional(),
  needsReview: z.boolean().optional(),
});

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json()) as Record<string, unknown>;
  const parsed = postBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid payload" },
      { status: 400 },
    );
  }

  if (parsed.data.categoryId) {
    const cat = await prisma.category.findUnique({
      where: { id: parsed.data.categoryId },
      select: { id: true },
    });
    if (!cat) {
      return NextResponse.json({ error: "Invalid categoryId" }, { status: 400 });
    }
  }

  const created = await prisma.transaction.create({
    data: {
      userId: session.user.id,
      amount: parsed.data.amount,
      currency: parsed.data.currency.toUpperCase(),
      occurredAt: new Date(parsed.data.occurredAt),
      merchant: parsed.data.merchant ?? null,
      notes: parsed.data.notes ?? null,
      categoryId: parsed.data.categoryId ?? null,
      needsReview: parsed.data.needsReview ?? false,
      source: "manual",
      excludedFromSpend: false,
      isReversalLine: false,
    },
    include: { category: true },
  });

  return NextResponse.json({
    transaction: transactionToJson(created),
  });
}

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const from = searchParams.get("from");
  const to = searchParams.get("to");

  const dateFilter: Prisma.TransactionWhereInput | undefined =
    from || to
      ? {
          occurredAt: {
            ...(from ? { gte: new Date(from) } : {}),
            ...(to ? { lte: new Date(to) } : {}),
          },
        }
      : undefined;

  const voidedEmailCharge: Prisma.TransactionWhereInput = {
    AND: [
      { excludedFromSpend: true },
      { source: "email" },
      { isReversalLine: false },
      {
        OR: [
          { notes: { contains: VOIDED_BY_PRIOR_REVERSAL_SUBSTRING } },
          { notes: { contains: VOIDED_BY_SUBSEQUENT_REVERSAL_SUBSTRING } },
        ],
      },
    ],
  };

  const where: Prisma.TransactionWhereInput = {
    userId: session.user.id,
    AND: [
      ...(dateFilter ? [dateFilter] : []),
      {
        OR: [{ excludedFromSpend: false }, voidedEmailCharge],
      },
    ],
  };

  const transactions = await prisma.transaction.findMany({
    where,
    orderBy: { occurredAt: "desc" },
    include: { category: true },
    take: 500,
  });

  return NextResponse.json({
    transactions: transactions.map(transactionToJson),
  });
}
