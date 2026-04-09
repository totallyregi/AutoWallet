import { auth } from "@/auth";
import { listGmailMessagesForUser } from "@/lib/gmail-sync";
import prisma from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sp = req.nextUrl.searchParams;
  const pageToken = sp.get("pageToken")?.trim() || undefined;
  const after = sp.get("after")?.trim() || undefined;
  const before = sp.get("before")?.trim() || undefined;
  const search = sp.get("search")?.trim() || undefined;

  try {
    const { messages, nextPageToken } = await listGmailMessagesForUser(
      session.user.id,
      { pageToken, after, before, search },
    );
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
    return NextResponse.json({
      messages: enriched,
      nextPageToken: nextPageToken ?? null,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
