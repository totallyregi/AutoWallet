import { auth } from "@/auth";
import prisma from "@/lib/prisma";
import { transactionToJson } from "@/lib/transaction-json";
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const from = searchParams.get("from");
  const to = searchParams.get("to");

  const where: {
    userId: string;
    occurredAt?: { gte?: Date; lte?: Date };
  } = { userId: session.user.id };

  if (from || to) {
    where.occurredAt = {};
    if (from) where.occurredAt.gte = new Date(from);
    if (to) where.occurredAt.lte = new Date(to);
  }

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
