import { google } from "googleapis";
import prisma from "@/lib/prisma";
import {
  extractTransactionsFromEmailText,
  parseOccurredAt,
  resolveCategoryId,
} from "@/lib/gemini";

export type GmailMessagePreview = {
  gmailMessageId: string;
  from: string;
  subject: string;
  date: string;
  messageId: string;
  snippet: string;
};

type GmailPayload = {
  mimeType?: string | null;
  body?: { data?: string | null } | null;
  parts?: GmailPayload[] | null;
};

/**
 * Gmail reads the signed-in user's Google OAuth tokens from the Account table (Auth.js).
 * Optional legacy: GMAIL_REFRESH_TOKEN env (single shared mailbox) if the user has no Google-linked account row.
 */
async function getGmailClientForUser(userId: string) {
  const cid = process.env.GOOGLE_CLIENT_ID;
  const cs = process.env.GOOGLE_CLIENT_SECRET;
  if (!cid || !cs) {
    throw new Error(
      "Google OAuth client is not configured (GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET).",
    );
  }

  const account = await prisma.account.findFirst({
    where: { userId, provider: "google" },
    select: {
      refresh_token: true,
      access_token: true,
      expires_at: true,
    },
  });

  const fromAccount = account?.refresh_token?.trim() ?? null;
  const legacyEnv = process.env.GMAIL_REFRESH_TOKEN?.trim() || null;

  let refresh: string | null = null;
  if (fromAccount) {
    refresh = fromAccount;
  } else if (!account && legacyEnv) {
    refresh = legacyEnv;
  } else if (account && !fromAccount) {
    throw new Error(
      "Google is linked but Gmail access was not granted (no refresh token). On the Dashboard → Gmail tab, click “Reconnect Google (Gmail)” and accept permissions.",
    );
  }

  if (!refresh) {
    throw new Error(
      "Gmail is not connected. Sign in with Google once, or on the Dashboard → Gmail tab click “Reconnect Google (Gmail)” to link the same Google account as your inbox. (Optional: set GMAIL_REFRESH_TOKEN only if you intentionally use a single shared mailbox without Google sign-in.)",
    );
  }

  const oauth2 = new google.auth.OAuth2(cid, cs);
  oauth2.setCredentials({
    refresh_token: refresh,
    access_token: account?.access_token ?? undefined,
    expiry_date: account?.expires_at ? account.expires_at * 1000 : undefined,
  });

  return google.gmail({ version: "v1", auth: oauth2 });
}

/** Maps Google OAuth errors to actionable messages for the dashboard. */
function mapGmailApiError(e: unknown): Error {
  const raw = e instanceof Error ? e.message : String(e);
  if (raw.includes("invalid_grant")) {
    return new Error(
      "Gmail: invalid_grant — Google revoked or expired this connection. On the Dashboard → Gmail tab, click “Reconnect Google (Gmail)” and sign in with the same Google account as your inbox. You no longer need to paste tokens from OAuth Playground unless you use the optional GMAIL_REFRESH_TOKEN fallback.",
    );
  }
  return e instanceof Error ? e : new Error(raw);
}

async function getSenderQuery(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { gmailSender: true },
  });
  const sender = user?.gmailSender?.trim();
  return sender ? ` from:${sender}` : "";
}

export async function listGmailMessagesForUser(
  userId: string,
): Promise<GmailMessagePreview[]> {
  const gmail = await getGmailClientForUser(userId);
  const senderQuery = await getSenderQuery(userId);
  const maxResults = Number(process.env.GMAIL_MAX_RESULTS ?? "20");
  const lookbackDays = Number(process.env.GMAIL_LOOKBACK_DAYS ?? "14");

  let list;
  try {
    list = await gmail.users.messages.list({
      userId: "me",
      maxResults,
      q: `newer_than:${lookbackDays}d${senderQuery}`,
    });
  } catch (e) {
    throw mapGmailApiError(e);
  }

  const messages = list.data.messages ?? [];
  const previews: GmailMessagePreview[] = [];

  for (const m of messages) {
    if (!m.id) continue;
    let full;
    try {
      full = await gmail.users.messages.get({
        userId: "me",
        id: m.id,
        format: "metadata",
        metadataHeaders: ["Subject", "Message-ID", "From", "Date"],
      });
    } catch (e) {
      throw mapGmailApiError(e);
    }
    const headers = full.data.payload?.headers ?? [];
    const from =
      headers.find((h) => h.name?.toLowerCase() === "from")?.value ?? "";
    const subject =
      headers.find((h) => h.name?.toLowerCase() === "subject")?.value ?? "";
    const date =
      headers.find((h) => h.name?.toLowerCase() === "date")?.value ?? "";
    const messageId =
      headers.find((h) => h.name?.toLowerCase() === "message-id")?.value ??
      m.id;
    previews.push({
      gmailMessageId: m.id,
      from,
      subject,
      date,
      messageId,
      snippet: full.data.snippet ?? "",
    });
  }

  return previews;
}

export async function parseAndStoreGmailMessage(
  userId: string,
  preview: GmailMessagePreview,
) {
  const gmail = await getGmailClientForUser(userId);
  let full;
  try {
    full = await gmail.users.messages.get({
      userId: "me",
      id: preview.gmailMessageId,
      format: "full",
    });
  } catch (e) {
    throw mapGmailApiError(e);
  }
  const fullText = extractTextFromPayload(full.data.payload as GmailPayload);
  const bestContent = (fullText || preview.snippet || "").slice(0, 16000);

  const combined = `From: ${preview.from}\nSubject: ${preview.subject}\nDate: ${preview.date}\n\n${bestContent}`;
  const lines = await extractTransactionsFromEmailText(combined);

  let createdCount = 0;
  let duplicateCount = 0;
  const messageKey = preview.messageId;

  for (let i = 0; i < lines.length; i++) {
    const extracted = lines[i]!;
    const externalId = lineExternalId(messageKey, extracted.referenceId, i);
    const existing = await prisma.transaction.findUnique({
      where: { externalId },
    });
    if (existing) {
      duplicateCount += 1;
      continue;
    }

    const categoryId = await resolveCategoryId(extracted.categorySlug);
    const confidence = extracted.confidence ?? 0.7;
    const needsReview = confidence < 0.6;

    await prisma.transaction.create({
      data: {
        userId,
        amount: extracted.amount,
        currency: extracted.currency,
        occurredAt: parseOccurredAt(extracted.date),
        merchant: extracted.merchant ?? undefined,
        notes: extracted.notes ?? undefined,
        source: "email",
        rawSnippet: combined.slice(0, 4000),
        externalId,
        confidence,
        needsReview,
        categoryId,
      },
    });
    createdCount += 1;
  }

  return {
    created: createdCount > 0,
    duplicate: createdCount === 0 && duplicateCount >= lines.length,
    createdCount,
    duplicateCount,
    lineCount: lines.length,
  };
}

function lineExternalId(
  messageId: string,
  referenceId: string | null | undefined,
  index: number,
): string {
  const base = `email:${messageId}`;
  const ref = referenceId?.trim();
  if (ref) {
    const safe = ref.replace(/[^a-zA-Z0-9_-]+/g, "_").slice(0, 100);
    return `${base}:${safe}`;
  }
  return `${base}:line-${index}`;
}

function decodeBase64Url(input: string): string {
  const normalized = input.replace(/-/g, "+").replace(/_/g, "/");
  const padLength = (4 - (normalized.length % 4)) % 4;
  const padded = normalized + "=".repeat(padLength);
  return Buffer.from(padded, "base64").toString("utf8");
}

function extractTextFromPayload(payload: GmailPayload | null | undefined): string {
  if (!payload) return "";
  const mime = payload.mimeType ?? "";
  const data = payload.body?.data;

  if (mime.startsWith("text/plain") && data) {
    return decodeBase64Url(data);
  }
  if (mime.startsWith("text/html") && data) {
    const html = decodeBase64Url(data);
    return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  }
  for (const part of payload.parts ?? []) {
    const nested = extractTextFromPayload(part);
    if (nested.trim()) return nested;
  }
  if (data) return decodeBase64Url(data);
  return "";
}

/**
 * Fetches recent Gmail messages and ingests spend-like notifications.
 * Requires the user's linked Google account (refresh_token in Account) or optional GMAIL_REFRESH_TOKEN.
 */
export async function syncGmailMessagesForUser(userId: string): Promise<{
  created: number;
  skipped: number;
  errors: string[];
}> {
  try {
    const previews = await listGmailMessagesForUser(userId);
    let created = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (const p of previews) {
      try {
        const result = await parseAndStoreGmailMessage(userId, p);
        if (result.createdCount > 0) created += result.createdCount;
        else skipped += 1;
      } catch (e) {
        errors.push(e instanceof Error ? e.message : String(e));
      }
    }
    return { created, skipped, errors };
  } catch (e) {
    return {
      created: 0,
      skipped: 0,
      errors: [e instanceof Error ? e.message : String(e)],
    };
  }
}
