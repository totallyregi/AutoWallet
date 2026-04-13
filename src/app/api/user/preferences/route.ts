import { auth } from "@/auth";
import {
  IMPORT_STORE_CURRENCIES,
  normalizePreferredImportCurrency,
} from "@/lib/import-currency-convert";
import prisma from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

export const runtime = "nodejs";

const patchSchema = z.object({
  preferredImportCurrency: z
    .enum(IMPORT_STORE_CURRENCIES)
    .nullable()
    .optional(),
});

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { preferredImportCurrency: true },
  });

  return NextResponse.json({
    preferredImportCurrency: normalizePreferredImportCurrency(
      user?.preferredImportCurrency,
    ),
  });
}

export async function PATCH(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json()) as unknown;
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const { preferredImportCurrency } = parsed.data;
  if (preferredImportCurrency === undefined) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  await prisma.user.update({
    where: { id: session.user.id },
    data: {
      preferredImportCurrency:
        preferredImportCurrency === null ? null : preferredImportCurrency,
    },
  });

  return NextResponse.json({
    preferredImportCurrency:
      preferredImportCurrency === null
        ? null
        : preferredImportCurrency,
  });
}
