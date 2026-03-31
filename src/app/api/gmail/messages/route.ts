import { auth } from "@/auth";
import { listGmailMessagesForUser } from "@/lib/gmail-sync";
import prisma from "@/lib/prisma";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const messages = await listGmailMessagesForUser(session.user.id);
    const externalIds = messages.map((m) => `email:${m.messageId}`);
    const existing = await prisma.transaction.findMany({
      where: {
        userId: session.user.id,
        externalId: { in: externalIds },
      },
      select: { externalId: true },
    });
    const trackedSet = new Set(existing.map((e) => e.externalId));
    const enriched = messages.map((m) => ({
      ...m,
      tracked: trackedSet.has(`email:${m.messageId}`),
    }));
    return NextResponse.json({ messages: enriched });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
