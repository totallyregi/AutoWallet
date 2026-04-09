import { auth } from "@/auth";
import { getFullGmailMessagePreviewForUser } from "@/lib/gmail-sync";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

type Params = { params: Promise<{ gmailMessageId: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { gmailMessageId: rawId } = await params;
  const gmailMessageId = decodeURIComponent(rawId);

  try {
    const preview = await getFullGmailMessagePreviewForUser(
      session.user.id,
      gmailMessageId,
    );
    return NextResponse.json(preview);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    const status = message.includes("not found") ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
