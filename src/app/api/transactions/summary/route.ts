import { auth } from "@/auth";
import prisma from "@/lib/prisma";
import { Prisma } from "@prisma/client";
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
    excludedFromSpend: boolean;
    occurredAt?: { gte?: Date; lte?: Date };
  } = { userId: session.user.id, excludedFromSpend: false };

  if (from || to) {
    where.occurredAt = {};
    if (from) where.occurredAt.gte = new Date(from);
    if (to) where.occurredAt.lte = new Date(to);
  }

  const monthConditions: Prisma.Sql[] = [
    Prisma.sql`"userId" = ${session.user.id}`,
    Prisma.sql`"excludedFromSpend" = false`,
  ];
  if (from) monthConditions.push(Prisma.sql`"occurredAt" >= ${new Date(from)}`);
  if (to) monthConditions.push(Prisma.sql`"occurredAt" <= ${new Date(to)}`);

  const [
    rows,
    sourceRows,
    merchantRows,
    transactionCount,
    needsReviewCount,
    maxAgg,
    byMonthRaw,
  ] = await Promise.all([
    prisma.transaction.groupBy({
      by: ["categoryId"],
      where,
      _sum: { amount: true },
    }),
    prisma.transaction.groupBy({
      by: ["source"],
      where,
      _sum: { amount: true },
    }),
    prisma.transaction.groupBy({
      by: ["merchant"],
      where,
      _sum: { amount: true },
      orderBy: { _sum: { amount: "desc" } },
      take: 10,
    }),
    prisma.transaction.count({ where }),
    prisma.transaction.count({ where: { ...where, needsReview: true } }),
    prisma.transaction.aggregate({ where, _max: { amount: true } }),
    prisma.$queryRaw<Array<{ ym: string; total: unknown }>>`
      SELECT to_char("occurredAt" AT TIME ZONE 'UTC', 'YYYY-MM') AS ym,
        SUM("amount") AS total
      FROM "Transaction"
      WHERE ${Prisma.join(monthConditions, " AND ")}
      GROUP BY 1
      ORDER BY 1
    `,
  ]);

  const categories = await prisma.category.findMany();
  const catMap = new Map(categories.map((c) => [c.id, c]));

  let total = 0;
  const byCategory: {
    categoryId: string | null;
    slug: string;
    name: string;
    amount: number;
    percentage: number;
  }[] = [];

  for (const r of rows) {
    const amt = Number(r._sum.amount ?? 0);
    total += amt;
    const cat = r.categoryId ? catMap.get(r.categoryId) : null;
    byCategory.push({
      categoryId: r.categoryId,
      slug: cat?.slug ?? "uncategorized",
      name: cat?.name ?? "Uncategorized",
      amount: amt,
      percentage: 0,
    });
  }

  for (const b of byCategory) {
    b.percentage = total > 0 ? Math.round((b.amount / total) * 1000) / 10 : 0;
  }

  byCategory.sort((a, b) => b.amount - a.amount);

  const byMonth = byMonthRaw.map((r) => ({
    month: r.ym,
    amount: Number(r.total ?? 0),
  }));

  const bySource: {
    source: string;
    name: string;
    amount: number;
    percentage: number;
  }[] = sourceRows.map((r) => {
    const amt = Number(r._sum.amount ?? 0);
    const src = r.source;
    const name =
      src === "email"
        ? "Email"
        : src === "image"
          ? "Receipt scan"
          : src === "manual"
            ? "Manual"
            : String(src);
    return { source: src, name, amount: amt, percentage: 0 };
  });
  for (const b of bySource) {
    b.percentage = total > 0 ? Math.round((b.amount / total) * 1000) / 10 : 0;
  }
  bySource.sort((a, b) => b.amount - a.amount);

  const topMerchants = merchantRows.map((r) => ({
    name: (r.merchant ?? "").trim() || "Unknown",
    amount: Number(r._sum.amount ?? 0),
  }));

  const maxSingle = Number(maxAgg._max.amount ?? 0);
  const averageTransaction =
    transactionCount > 0 ? Math.round((total / transactionCount) * 100) / 100 : 0;

  return NextResponse.json({
    total,
    byCategory,
    transactionCount,
    averageTransaction,
    needsReviewCount,
    maxSingle,
    byMonth,
    bySource,
    topMerchants,
  });
}
