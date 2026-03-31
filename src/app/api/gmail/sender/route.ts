import { auth } from "@/auth";
import prisma from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const senderSchema = z.object({
  sender: z
    .string()
    .trim()
    .email()
    .max(320)
    .or(z.literal("")),
});

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { gmailSender: true },
  });

  return NextResponse.json({ sender: user?.gmailSender ?? "" });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json()) as Record<string, unknown>;
  const parsed = senderSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid sender email" },
      { status: 400 },
    );
  }

  const sender = parsed.data.sender.trim().toLowerCase();
  await prisma.user.update({
    where: { id: session.user.id },
    data: { gmailSender: sender || null },
  });

  return NextResponse.json({ sender });
}
