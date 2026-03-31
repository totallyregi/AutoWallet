import { syncGmailMessagesForUser } from "@/lib/gmail-sync";
import prisma from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const authz = req.headers.get("authorization");
  const secret = process.env.CRON_SECRET;
  if (!secret || authz !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const email = process.env.INGEST_USER_EMAIL;
  if (!email) {
    return NextResponse.json(
      { error: "INGEST_USER_EMAIL not set" },
      { status: 500 },
    );
  }

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    return NextResponse.json({ error: "User not found for INGEST_USER_EMAIL" }, { status: 404 });
  }

  const result = await syncGmailMessagesForUser(user.id);
  return NextResponse.json(result);
}
