import { auth } from "@/auth";
import {
  canonicalKeyFromExternalId,
  computeParseStatus,
  normalizeRfcMessageId,
  whereClauseForEmailMessageKeys,
} from "@/lib/email-parse-snapshot";
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
    const uniqueKeys = [
      ...new Set(messages.map((m) => normalizeRfcMessageId(m.messageId))),
    ];
    const pageKeySet = new Set(uniqueKeys);

    let existing: { externalId: string | null }[] = [];
    if (uniqueKeys.length > 0) {
      existing = await prisma.transaction.findMany({
        where: {
          userId: session.user.id,
          OR: whereClauseForEmailMessageKeys(uniqueKeys),
        },
        select: { externalId: true },
      });
    }

    const byKey = new Map<string, string[]>();
    for (const k of uniqueKeys) byKey.set(k, []);
    for (const row of existing) {
      if (!row.externalId) continue;
      const canon = canonicalKeyFromExternalId(row.externalId);
      if (canon && pageKeySet.has(canon)) {
        byKey.get(canon)!.push(row.externalId);
      }
    }

    const snaps = await prisma.emailParseSnapshot.findMany({
      where: {
        userId: session.user.id,
        messageKey: { in: uniqueKeys },
      },
    });
    const snapByKey = new Map(snaps.map((s) => [s.messageKey, s]));

    const toBootstrap = uniqueKeys.filter(
      (k) => (byKey.get(k)?.length ?? 0) > 0 && !snapByKey.has(k),
    );
    if (toBootstrap.length > 0) {
      await Promise.all(
        toBootstrap.map((k) => {
          const sorted = [...new Set(byKey.get(k) ?? [])].sort();
          return prisma.emailParseSnapshot.upsert({
            where: {
              userId_messageKey: {
                userId: session.user.id,
                messageKey: k,
              },
            },
            create: {
              userId: session.user.id,
              messageKey: k,
              externalIds: sorted,
            },
            update: { externalIds: sorted },
          });
        }),
      );
      const created = await prisma.emailParseSnapshot.findMany({
        where: {
          userId: session.user.id,
          messageKey: { in: toBootstrap },
        },
      });
      for (const s of created) snapByKey.set(s.messageKey, s);
    }

    const enriched = messages.map((m) => {
      const k = normalizeRfcMessageId(m.messageId);
      const current = [...new Set(byKey.get(k) ?? [])].sort();
      const snap = snapByKey.get(k);
      const parseStatus = computeParseStatus(current, snap?.externalIds);
      return { ...m, parseStatus };
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
