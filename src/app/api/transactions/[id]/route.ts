import { auth } from "@/auth";
import { onEmailLinkedTransactionDeleted } from "@/lib/email-parse-snapshot";
import prisma from "@/lib/prisma";
import { transactionToJson } from "@/lib/transaction-json";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const full = await prisma.transaction.findFirst({
    where: { id, userId: session.user.id },
    include: { category: true },
  });
  if (!full) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ transaction: transactionToJson(full) });
}

const patchSchema = z.object({
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

export async function DELETE(_req: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const tx = await prisma.transaction.findUnique({
    where: { id },
    select: { id: true, userId: true, externalId: true, source: true },
  });
  if (!tx || tx.userId !== session.user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await prisma.transaction.delete({ where: { id } });
  if (tx.source === "email") {
    await onEmailLinkedTransactionDeleted(session.user.id, tx.externalId);
  }
  return NextResponse.json({ ok: true });
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const tx = await prisma.transaction.findUnique({
    where: { id },
    select: { id: true, userId: true },
  });
  if (!tx || tx.userId !== session.user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = (await req.json()) as Record<string, unknown>;
  const parsed = patchSchema.safeParse(body);
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

  const updated = await prisma.transaction.update({
    where: { id },
    data: {
      amount: parsed.data.amount,
      currency: parsed.data.currency.toUpperCase(),
      occurredAt: new Date(parsed.data.occurredAt),
      merchant: parsed.data.merchant ?? null,
      notes: parsed.data.notes ?? null,
      categoryId: parsed.data.categoryId ?? null,
      needsReview: parsed.data.needsReview ?? false,
    },
    include: { category: true },
  });

  return NextResponse.json({
    transaction: {
      id: updated.id,
      amount: Number(updated.amount),
      currency: updated.currency,
      occurredAt: updated.occurredAt.toISOString(),
      merchant: updated.merchant,
      notes: updated.notes,
      source: updated.source,
      needsReview: updated.needsReview,
      confidence: updated.confidence,
      imageUrl: updated.imageUrl,
      externalId: updated.externalId,
      category: updated.category
        ? {
            id: updated.category.id,
            name: updated.category.name,
            slug: updated.category.slug,
          }
        : null,
    },
  });
}
