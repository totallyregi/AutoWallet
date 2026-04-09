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
    let existing: { externalId: string | null }[] = [];
    if (messages.length > 0) {
      existing = await prisma.transaction.findMany({
        where: {
          userId: session.user.id,
          OR: messages.flatMap((m) => [
            { externalId: `email:${m.messageId}` },
            { externalId: { startsWith: `email:${m.messageId}:` } },
          ]),
        },
        select: { externalId: true },
      });
    }
    const enriched = messages.map((m) => {
      const prefix = `email:${m.messageId}`;
      const tracked = existing.some(
        (e) =>
          e.externalId != null &&
          (e.externalId === prefix || e.externalId.startsWith(`${prefix}:`)),
      );
      return { ...m, tracked };
    });
    return NextResponse.json({ messages: enriched });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
