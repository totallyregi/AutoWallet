import { auth } from "@/auth";
import prisma from "@/lib/prisma";
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

  const rows = await prisma.transaction.groupBy({
    by: ["categoryId"],
    where,
    _sum: { amount: true },
  });

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

  return NextResponse.json({ total, byCategory });
}
