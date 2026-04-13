import { auth } from "@/auth";
import { onEmailLinkedTransactionDeleted } from "@/lib/email-parse-snapshot";
import prisma from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const bodySchema = z.object({
  ids: z.array(z.string().min(1)).min(1).max(100),
});

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json()) as Record<string, unknown>;
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid payload" },
      { status: 400 },
    );
  }

  const userId = session.user.id;
  const ids = [...new Set(parsed.data.ids)];

  const rows = await prisma.transaction.findMany({
    where: { userId, id: { in: ids } },
    select: { id: true, source: true, externalId: true },
  });

  if (rows.length === 0) {
    return NextResponse.json({ deleted: 0 });
  }

  const foundIds = rows.map((r) => r.id);
  await prisma.transaction.deleteMany({
    where: { userId, id: { in: foundIds } },
  });

  for (const r of rows) {
    if (r.source === "email") {
      await onEmailLinkedTransactionDeleted(userId, r.externalId);
    }
  }

  return NextResponse.json({ deleted: rows.length });
}
