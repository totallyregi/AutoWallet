import { auth } from "@/auth";
import prisma from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const addSenderSchema = z.object({
  sender: z.string().trim().email().max(320),
});

async function listSenders(userId: string) {
  return prisma.savedGmailSender.findMany({
    where: { userId },
    orderBy: { createdAt: "asc" },
    select: { id: true, email: true, createdAt: true },
  });
}

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const senders = await listSenders(session.user.id);
  return NextResponse.json({ senders });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json()) as Record<string, unknown>;
  const parsed = addSenderSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid sender email" },
      { status: 400 },
    );
  }

  const email = parsed.data.sender.trim().toLowerCase();
  await prisma.savedGmailSender.upsert({
    where: {
      userId_email: { userId: session.user.id, email },
    },
    create: { userId: session.user.id, email },
    update: {},
  });

  const senders = await listSenders(session.user.id);
  return NextResponse.json({ senders });
}
