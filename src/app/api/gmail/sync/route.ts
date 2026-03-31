import { auth } from "@/auth";
import { syncGmailMessagesForUser } from "@/lib/gmail-sync";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await syncGmailMessagesForUser(session.user.id);
  return NextResponse.json(result);
}
