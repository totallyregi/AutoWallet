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

const MAX_RECEIPT_BYTES = 12 * 1024 * 1024; // 12 MB — PDFs can be larger than photos

function mimeFromUpload(file: File | Blob): string {
  if (file.type && file.type !== "application/octet-stream") {
    return file.type;
  }
  const name =
    file instanceof File && typeof file.name === "string"
      ? file.name.toLowerCase()
      : "";
  if (name.endsWith(".pdf")) return "application/pdf";
  if (name.endsWith(".png")) return "image/png";
  if (name.endsWith(".webp")) return "image/webp";
  if (name.endsWith(".gif")) return "image/gif";
  if (name.endsWith(".avif")) return "image/avif";
  if (name.endsWith(".bmp")) return "image/bmp";
  if (name.endsWith(".tif") || name.endsWith(".tiff")) return "image/tiff";
  if (name.endsWith(".jpg") || name.endsWith(".jpeg")) return "image/jpeg";
  if (name.endsWith(".heic") || name.endsWith(".heif")) return "image/heic";
  return "image/jpeg";
}

function isAllowedReceiptMime(mime: string): boolean {
  const m = mime.toLowerCase();
  if (m === "application/pdf") return true;
  if (m.startsWith("image/")) return true;
  return false;
}

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
  if (buf.length > MAX_RECEIPT_BYTES) {
    return NextResponse.json(
      { error: "File too large. Maximum size is 12 MB." },
      { status: 400 },
    );
  }

  const mime = mimeFromUpload(file);
  if (!isAllowedReceiptMime(mime)) {
    return NextResponse.json(
      {
        error:
          "Unsupported file type. Use a photo (e.g. JPEG, PNG, WebP) or a PDF receipt.",
      },
      { status: 400 },
    );
  }

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
