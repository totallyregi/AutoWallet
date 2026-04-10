import type { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";

export type EmailParseStatus = "open" | "partial" | "complete";

/** Strip wrapping `<…>` from RFC 5322 Message-ID header values. */
export function normalizeRfcMessageId(raw: string): string {
  let v = raw.trim();
  if (v.startsWith("<") && v.endsWith(">")) {
    v = v.slice(1, -1).trim();
  }
  return v;
}

/**
 * External IDs are `email:${messageKey}:${suffix}` where `messageKey` may historically
 * include angle brackets. Resolve DB prefixes for a canonical (normalized) key.
 */
export function messageKeyVariants(normalizedKey: string): string[] {
  const k = normalizedKey.trim();
  const bracketed = `<${k}>`;
  return [...new Set([k, bracketed])];
}

/** Message key segment inside `email:…:suffix` (suffix is the last `:…` segment). */
export function extractEmailMessageKeyFromExternalId(
  externalId: string,
): string | null {
  if (!externalId.startsWith("email:")) return null;
  const rest = externalId.slice("email:".length);
  const i = rest.lastIndexOf(":");
  if (i <= 0) return rest || null;
  return rest.slice(0, i);
}

export function canonicalKeyFromExternalId(externalId: string): string | null {
  const ext = extractEmailMessageKeyFromExternalId(externalId);
  return ext ? normalizeRfcMessageId(ext) : null;
}

export function whereClauseForEmailMessageKeys(
  normalizedKeys: string[],
): Prisma.TransactionWhereInput[] {
  const ors: Prisma.TransactionWhereInput[] = [];
  for (const key of normalizedKeys) {
    for (const v of messageKeyVariants(key)) {
      ors.push({ externalId: `email:${v}` });
      ors.push({ externalId: { startsWith: `email:${v}:` } });
    }
  }
  return ors;
}

export async function fetchExternalIdsForUserEmailMessageKey(
  userId: string,
  normalizedKey: string,
): Promise<string[]> {
  const variants = messageKeyVariants(normalizedKey);
  const rows = await prisma.transaction.findMany({
    where: {
      userId,
      OR: variants.flatMap((v) => [
        { externalId: `email:${v}` },
        { externalId: { startsWith: `email:${v}:` } },
      ]),
    },
    select: { externalId: true },
  });
  const out: string[] = [];
  for (const r of rows) {
    if (!r.externalId) continue;
    if (canonicalKeyFromExternalId(r.externalId) === normalizedKey) {
      out.push(r.externalId);
    }
  }
  return [...new Set(out)].sort();
}

export function computeParseStatus(
  currentSorted: string[],
  expected: string[] | null | undefined,
): EmailParseStatus {
  if (currentSorted.length === 0) return "open";
  if (!expected || expected.length === 0) return "complete";
  const cur = new Set(currentSorted);
  if (
    currentSorted.length === expected.length &&
    expected.every((id) => cur.has(id))
  ) {
    return "complete";
  }
  return "partial";
}

/** Replace snapshot with all email-linked external IDs for this message (after a successful parse). */
export async function refreshEmailParseSnapshot(
  userId: string,
  rawMessageId: string,
): Promise<void> {
  const key = normalizeRfcMessageId(rawMessageId);
  const current = await fetchExternalIdsForUserEmailMessageKey(userId, key);
  if (current.length === 0) {
    await prisma.emailParseSnapshot.deleteMany({
      where: { userId, messageKey: key },
    });
    return;
  }
  await prisma.emailParseSnapshot.upsert({
    where: {
      userId_messageKey: { userId, messageKey: key },
    },
    create: { userId, messageKey: key, externalIds: current },
    update: { externalIds: current },
  });
}

/** After deleting an email-sourced transaction: drop snapshot only when nothing remains for that email. */
export async function onEmailLinkedTransactionDeleted(
  userId: string,
  externalId: string | null,
): Promise<void> {
  if (!externalId || !externalId.startsWith("email:")) return;
  const rawKey = extractEmailMessageKeyFromExternalId(externalId);
  if (!rawKey) return;
  const key = normalizeRfcMessageId(rawKey);
  const remaining = await fetchExternalIdsForUserEmailMessageKey(userId, key);
  if (remaining.length === 0) {
    await prisma.emailParseSnapshot.deleteMany({
      where: { userId, messageKey: key },
    });
  }
}

export async function getParseStatusForMessageKey(
  userId: string,
  rawMessageId: string,
): Promise<EmailParseStatus> {
  const key = normalizeRfcMessageId(rawMessageId);
  const current = await fetchExternalIdsForUserEmailMessageKey(userId, key);
  if (current.length === 0) return "open";
  const snap = await prisma.emailParseSnapshot.findUnique({
    where: { userId_messageKey: { userId, messageKey: key } },
  });
  if (!snap) {
    await prisma.emailParseSnapshot.create({
      data: { userId, messageKey: key, externalIds: current },
    });
    return "complete";
  }
  return computeParseStatus(current, snap.externalIds);
}
