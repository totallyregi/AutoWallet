import { auth } from "@/auth";
import {
  VOIDED_BY_PRIOR_REVERSAL_SUBSTRING,
  VOIDED_BY_SUBSEQUENT_REVERSAL_SUBSTRING,
} from "@/lib/reversal-constants";
import prisma from "@/lib/prisma";
import { transactionToJson } from "@/lib/transaction-json";
import type { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";

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
