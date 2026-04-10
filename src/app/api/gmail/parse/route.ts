import { auth } from "@/auth";
import { getParseStatusForMessageKey } from "@/lib/email-parse-snapshot";
import {
  getGmailMessagePreviewForUser,
  parseAndStoreGmailMessage,
} from "@/lib/gmail-sync";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

export const runtime = "nodejs";

const parseSchema = z.object({
  gmailMessageId: z.string().min(1),
});

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json()) as Record<string, unknown>;
  const parsed = parseSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "gmailMessageId is required" }, { status: 400 });
  }

  try {
    const preview = await getGmailMessagePreviewForUser(
      session.user.id,
      parsed.data.gmailMessageId,
    );
    if (!preview) {
      return NextResponse.json(
        { error: "Message not found or inaccessible" },
        { status: 404 },
      );
    }
    const result = await parseAndStoreGmailMessage(session.user.id, preview);
    const parseStatus = await getParseStatusForMessageKey(
      session.user.id,
      preview.messageId,
    );
    return NextResponse.json({ ...result, parseStatus });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
