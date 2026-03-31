import { auth } from "@/auth";
import {
  extractTransactionFromImageBuffer,
  parseOccurredAt,
  resolveCategoryId,
} from "@/lib/gemini";
import prisma from "@/lib/prisma";
import { transactionToJson } from "@/lib/transaction-json";
import { put } from "@vercel/blob";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof Blob)) {
    return NextResponse.json({ error: "Missing file" }, { status: 400 });
  }

  const buf = Buffer.from(await file.arrayBuffer());
  const mime = file.type || "image/jpeg";

  let imageUrl: string | null = null;
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (token) {
    const name =
      typeof (file as File).name === "string"
        ? (file as File).name
        : "receipt.jpg";
    const blob = await put(
      `receipts/${session.user.id}/${Date.now()}-${name}`,
      buf,
      { access: "public", token },
    );
    imageUrl = blob.url;
  }

  const extracted = await extractTransactionFromImageBuffer(buf, mime);
  const categoryId = await resolveCategoryId(extracted.categorySlug);
  const confidence = extracted.confidence ?? 0.85;
  const needsReview = confidence < 0.6;

  const tx = await prisma.transaction.create({
    data: {
      userId: session.user.id,
      amount: extracted.amount,
      currency: extracted.currency,
      occurredAt: parseOccurredAt(extracted.date),
      merchant: extracted.merchant ?? undefined,
      notes: extracted.notes ?? undefined,
      source: "image",
      confidence,
      needsReview,
      imageUrl,
      categoryId,
    },
    include: { category: true },
  });

  return NextResponse.json({ transaction: transactionToJson(tx) });
}
