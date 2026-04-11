import { auth } from "@/auth";
import {
  extractEmailMessageKeyFromExternalId,
  normalizeRfcMessageId,
} from "@/lib/email-parse-snapshot";
import {
  findGmailMessageIdByRfcMessageId,
  getFullGmailMessagePreviewForUser,
} from "@/lib/gmail-sync";
import prisma from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";

type Params = { params: Promise<{ id: string }> };

export const runtime = "nodejs";

export async function GET(_req: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const tx = await prisma.transaction.findFirst({
    where: { id, userId: session.user.id },
    select: { id: true, source: true, externalId: true },
  });

  if (!tx) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (tx.source !== "email" || !tx.externalId?.startsWith("email:")) {
    return NextResponse.json(
      { error: "This transaction was not imported from Gmail." },
      { status: 400 },
    );
  }

  const rawKey = extractEmailMessageKeyFromExternalId(tx.externalId);
  if (!rawKey) {
    return NextResponse.json(
      { error: "Could not read Message-ID from transaction." },
      { status: 400 },
    );
  }

  const rfcKey = normalizeRfcMessageId(rawKey);
  let gmailMessageId: string | null;
  try {
    gmailMessageId = await findGmailMessageIdByRfcMessageId(
      session.user.id,
      rfcKey,
    );
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }

  if (!gmailMessageId) {
    return NextResponse.json(
      {
        error:
          "Could not find this message in Gmail (it may have been deleted or is in another account).",
      },
      { status: 404 },
    );
  }

  try {
    const preview = await getFullGmailMessagePreviewForUser(
      session.user.id,
      gmailMessageId,
    );
    return NextResponse.json(preview);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
