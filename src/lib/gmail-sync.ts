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

/** Full plain-text body for dashboard preview (same extraction as parse). */
export type GmailFullMessagePreview = GmailMessagePreview & {
  bodyText: string;
  /** Sanitized HTML to render email close to original layout. */
  bodyHtmlSanitized?: string;
};

type GmailPayload = {
  mimeType?: string | null;
  body?: { data?: string | null } | null;
  parts?: GmailPayload[] | null;
  headers?: { name?: string | null; value?: string | null }[] | null;
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

/** Gmail `q` fragment: empty, single `from:`, or `(from:a OR from:b)`. */
async function getSenderQuery(userId: string) {
  const rows = await prisma.savedGmailSender.findMany({
    where: { userId },
    select: { email: true },
    orderBy: { createdAt: "asc" },
  });
  const emails = rows.map((r) => r.email.trim().toLowerCase()).filter(Boolean);
  if (emails.length === 0) return "";
  if (emails.length === 1) return `from:${emails[0]}`;
  return `(${emails.map((e) => `from:${e}`).join(" OR ")})`;
}

function metadataToPreview(
  gmailMessageId: string,
  snippet: string | null | undefined,
  payload: GmailPayload | null | undefined,
): GmailMessagePreview {
  const headers = payload?.headers ?? [];
  const from =
    headers.find((h) => h.name?.toLowerCase() === "from")?.value ?? "";
  const subject =
    headers.find((h) => h.name?.toLowerCase() === "subject")?.value ?? "";
  const date =
    headers.find((h) => h.name?.toLowerCase() === "date")?.value ?? "";
  const messageId =
    headers.find((h) => h.name?.toLowerCase() === "message-id")?.value ??
    gmailMessageId;
  return {
    gmailMessageId,
    from,
    subject,
    date,
    messageId,
    snippet: snippet ?? "",
  };
}

/** Optional filters for Gmail `messages.list` (combined with per-user sender). */
export type ListGmailMessagesOptions = {
  pageToken?: string;
  /** ISO date YYYY-MM-DD */
  after?: string;
  /** ISO date YYYY-MM-DD (inclusive end; mapped to Gmail `before:` as next calendar day) */
  before?: string;
  /** Extra Gmail search terms (full-text / operators) */
  search?: string;
};

function buildGmailListQuery(
  senderQuery: string,
  options: ListGmailMessagesOptions,
): string {
  const lookbackDays = Number(process.env.GMAIL_LOOKBACK_DAYS ?? "14");
  const parts: string[] = [];

  const after = options.after?.trim();
  const before = options.before?.trim();
  if (after) {
    const [y, m, d] = after.split("-");
    if (y && m && d) parts.push(`after:${y}/${m}/${d}`);
  }
  if (before) {
    const [y, m, d] = before.split("-").map(Number);
    if (
      y != null &&
      !Number.isNaN(y) &&
      m != null &&
      !Number.isNaN(m) &&
      d != null &&
      !Number.isNaN(d)
    ) {
      const end = new Date(Date.UTC(y, m - 1, d));
      end.setUTCDate(end.getUTCDate() + 1);
      const y2 = end.getUTCFullYear();
      const m2 = String(end.getUTCMonth() + 1).padStart(2, "0");
      const d2 = String(end.getUTCDate()).padStart(2, "0");
      parts.push(`before:${y2}/${m2}/${d2}`);
    }
  }
  // With saved sender filter but no date window, search all mail from those senders (not just lookback).
  if (!after && !before) {
    if (!senderQuery) {
      parts.push(`newer_than:${lookbackDays}d`);
    }
  }

  const search = options.search?.trim();
  if (search) parts.push(search);

  if (senderQuery) parts.push(senderQuery);

  return parts.join(" ").trim();
}

export async function listGmailMessagesForUser(
  userId: string,
  options: ListGmailMessagesOptions = {},
): Promise<{ messages: GmailMessagePreview[]; nextPageToken?: string }> {
  const gmail = await getGmailClientForUser(userId);
  const senderQuery = await getSenderQuery(userId);
  const rawMax = Number(process.env.GMAIL_MAX_RESULTS ?? "25");
  const maxResults = Math.min(
    500,
    Math.max(1, Number.isFinite(rawMax) ? rawMax : 25),
  );

  const q = buildGmailListQuery(senderQuery, options);

  let list;
  try {
    list = await gmail.users.messages.list({
      userId: "me",
      maxResults,
      pageToken: options.pageToken,
      q,
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
    previews.push(
      metadataToPreview(
        m.id,
        full.data.snippet,
        full.data.payload as GmailPayload | null | undefined,
      ),
    );
  }

  const nextPageToken = list.data.nextPageToken ?? undefined;
  return { messages: previews, nextPageToken };
}

/** Loads one message’s metadata as a preview (for parse without re-listing the inbox). */
export async function getGmailMessagePreviewForUser(
  userId: string,
  gmailMessageId: string,
): Promise<GmailMessagePreview | null> {
  const gmail = await getGmailClientForUser(userId);
  let full;
  try {
    full = await gmail.users.messages.get({
      userId: "me",
      id: gmailMessageId,
      format: "metadata",
      metadataHeaders: ["Subject", "Message-ID", "From", "Date"],
    });
  } catch (e: unknown) {
    const status =
      e &&
      typeof e === "object" &&
      "response" in e &&
      e.response &&
      typeof e.response === "object" &&
      "status" in e.response
        ? (e.response as { status?: number }).status
        : undefined;
    if (status === 404) return null;
    const raw = e instanceof Error ? e.message : String(e);
    if (raw.includes("404")) return null;
    throw mapGmailApiError(e);
  }
  const id = full.data.id;
  if (!id) return null;
  return metadataToPreview(
    id,
    full.data.snippet,
    full.data.payload as GmailPayload | null | undefined,
  );
}

const FULL_BODY_MAX_CHARS = 120_000;

/**
 * Loads the full MIME payload and returns headers + best-effort plain text (HTML stripped).
 */
export async function getFullGmailMessagePreviewForUser(
  userId: string,
  gmailMessageId: string,
): Promise<GmailFullMessagePreview> {
  const gmail = await getGmailClientForUser(userId);
  let full;
  try {
    full = await gmail.users.messages.get({
      userId: "me",
      id: gmailMessageId,
      format: "full",
    });
  } catch (e) {
    throw mapGmailApiError(e);
  }

  const id = full.data.id;
  if (!id) {
    throw new Error("Message not found");
  }

  const headers = full.data.payload?.headers ?? [];
  const from =
    headers.find((h) => h.name?.toLowerCase() === "from")?.value ?? "";
  const subject =
    headers.find((h) => h.name?.toLowerCase() === "subject")?.value ?? "";
  const date =
    headers.find((h) => h.name?.toLowerCase() === "date")?.value ?? "";
  const messageId =
    headers.find((h) => h.name?.toLowerCase() === "message-id")?.value ?? id;

  let { bodyText, bodyHtmlSanitized } = extractBodiesFromPayload(
    full.data.payload as GmailPayload,
  );
  if (bodyText.length > FULL_BODY_MAX_CHARS) {
    bodyText =
      bodyText.slice(0, FULL_BODY_MAX_CHARS) +
      "\n\n… (preview truncated for size)";
  }
  if (bodyHtmlSanitized && bodyHtmlSanitized.length > FULL_BODY_MAX_CHARS * 2) {
    bodyHtmlSanitized = bodyHtmlSanitized.slice(0, FULL_BODY_MAX_CHARS * 2);
  }

  return {
    gmailMessageId: id,
    from,
    subject,
    date,
    messageId,
    snippet: full.data.snippet ?? "",
    bodyText,
    bodyHtmlSanitized,
  };
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
  const createdTransactions: {
    merchant: string | null;
    amount: number;
    currency: string;
    occurredAt: string;
    kind: "charge" | "reversal";
  }[] = [];
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

    const kind = extracted.entryKind ?? "charge";

    if (kind === "reversal") {
      const refForMatch =
        extracted.reversesReferenceId?.trim() || extracted.referenceId?.trim();
      const reversedCategoryId = await resolveCategoryId("reversed");
      const confidence = extracted.confidence ?? 0.7;
      const orig = await findChargeByBankReference(userId, refForMatch);

      if (orig) {
        await prisma.$transaction(async (db) => {
          await db.transaction.update({
            where: { id: orig.id },
            data: {
              excludedFromSpend: true,
              notes: orig.notes
                ? `${orig.notes} | Reversed (matched email reversal).`
                : "Reversed (matched email reversal).",
            },
          });
          await db.transaction.create({
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
              needsReview: confidence < 0.6,
              categoryId: reversedCategoryId,
              excludedFromSpend: true,
              isReversalLine: true,
              reversesTransactionId: orig.id,
            },
          });
        });
        createdCount += 1;
        createdTransactions.push({
          merchant: extracted.merchant ?? null,
          amount: extracted.amount,
          currency: extracted.currency,
          occurredAt: parseOccurredAt(extracted.date).toISOString(),
          kind: "reversal",
        });
        continue;
      }

      await prisma.transaction.create({
        data: {
          userId,
          amount: extracted.amount,
          currency: extracted.currency,
          occurredAt: parseOccurredAt(extracted.date),
          merchant: extracted.merchant ?? undefined,
          notes:
            extracted.notes ??
            "Reversal with no matching charge by bank reference — excluded from spend.",
          source: "email",
          rawSnippet: combined.slice(0, 4000),
          externalId,
          confidence,
          needsReview: true,
          categoryId: reversedCategoryId,
          excludedFromSpend: true,
          isReversalLine: true,
        },
      });
      createdCount += 1;
      createdTransactions.push({
        merchant: extracted.merchant ?? null,
        amount: extracted.amount,
        currency: extracted.currency,
        occurredAt: parseOccurredAt(extracted.date).toISOString(),
        kind: "reversal",
      });
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
    createdTransactions.push({
      merchant: extracted.merchant ?? null,
      amount: extracted.amount,
      currency: extracted.currency,
      occurredAt: parseOccurredAt(extracted.date).toISOString(),
      kind: "charge",
    });
  }

  return {
    created: createdCount > 0,
    duplicate: createdCount === 0 && duplicateCount >= lines.length,
    createdCount,
    duplicateCount,
    lineCount: lines.length,
    createdTransactions,
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

async function findChargeByBankReference(
  userId: string,
  refRaw: string | null | undefined,
) {
  const ref = refRaw?.trim();
  if (!ref) return null;
  const safe = ref.replace(/[^a-zA-Z0-9_-]+/g, "_").slice(0, 100);
  return prisma.transaction.findFirst({
    where: {
      userId,
      isReversalLine: false,
      excludedFromSpend: false,
      externalId: { endsWith: `:${safe}` },
    },
    select: { id: true, notes: true },
  });
}

function decodeBase64Url(input: string): string {
  const normalized = input.replace(/-/g, "+").replace(/_/g, "/");
  const padLength = (4 - (normalized.length % 4)) % 4;
  const padded = normalized + "=".repeat(padLength);
  return Buffer.from(padded, "base64").toString("utf8");
}

function sanitizeEmailHtml(input: string): string {
  let html = input;
  html = html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "");
  html = html.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "");
  html = html.replace(/<iframe[^>]*>[\s\S]*?<\/iframe>/gi, "");
  html = html.replace(/<object[^>]*>[\s\S]*?<\/object>/gi, "");
  html = html.replace(/<embed[^>]*>/gi, "");
  html = html.replace(/<link[^>]*>/gi, "");
  html = html.replace(/<meta[^>]*>/gi, "");
  html = html.replace(/<base[^>]*>/gi, "");
  html = html.replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "");
  html = html.replace(
    /\s(href|src)\s*=\s*"\s*javascript:[^"]*"/gi,
    ' $1="#"',
  );
  html = html.replace(/\s(href|src)\s*=\s*'\s*javascript:[^']*'/gi, " $1='#'");
  return html.trim();
}

function htmlToReadableText(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/gi, '"')
    .replace(/\s+/g, " ")
    .trim();
}

function extractBodiesFromPayload(
  payload: GmailPayload | null | undefined,
): { bodyText: string; bodyHtmlSanitized?: string } {
  if (!payload) return { bodyText: "" };

  const plainParts: string[] = [];
  const htmlParts: string[] = [];

  const walk = (node: GmailPayload | null | undefined) => {
    if (!node) return;
    const mime = (node.mimeType ?? "").toLowerCase();
    const data = node.body?.data;
    if (data) {
      const decoded = decodeBase64Url(data);
      if (mime.startsWith("text/plain")) {
        plainParts.push(decoded);
      } else if (mime.startsWith("text/html")) {
        htmlParts.push(decoded);
      }
    }
    for (const p of node.parts ?? []) walk(p);
  };

  walk(payload);

  const mergedHtml = htmlParts.join("\n").trim();
  const bodyHtmlSanitized = mergedHtml ? sanitizeEmailHtml(mergedHtml) : undefined;
  const mergedPlain = plainParts.join("\n").trim();
  const fallbackText = bodyHtmlSanitized ? htmlToReadableText(bodyHtmlSanitized) : "";

  return {
    bodyText: (mergedPlain || fallbackText).trim(),
    bodyHtmlSanitized,
  };
}

function extractTextFromPayload(payload: GmailPayload | null | undefined): string {
  return extractBodiesFromPayload(payload).bodyText;
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
    const { messages: previews } = await listGmailMessagesForUser(userId);
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
