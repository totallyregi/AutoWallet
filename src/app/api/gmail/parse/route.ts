import { auth } from "@/auth";
import {
  listGmailMessagesForUser,
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
    const previews = await listGmailMessagesForUser(session.user.id);
    const preview = previews.find(
      (m) => m.gmailMessageId === parsed.data.gmailMessageId,
    );
    if (!preview) {
      return NextResponse.json(
        { error: "Message not found in current filtered inbox list" },
        { status: 404 },
      );
    }
    const result = await parseAndStoreGmailMessage(session.user.id, preview);
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
