import { GoogleGenerativeAI } from "@google/generative-ai";
import prisma from "@/lib/prisma";
import {
  extractedEmailLineSchema,
  extractedTransactionSchema,
  type ExtractedEmailLine,
  type ExtractedTransaction,
} from "@/lib/extraction-schema";

const DEFAULT_MODEL = "gemini-1.5-flash";

function isModelUnavailableError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return (
    message.includes("no longer available") ||
    message.includes("404 Not Found") ||
    message.includes("models/")
  );
}

function getModel() {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY is not set");
  const genAI = new GoogleGenerativeAI(key);
  const name = process.env.GEMINI_MODEL ?? DEFAULT_MODEL;
  return genAI.getGenerativeModel({ model: name });
}

function buildCategoryHint(): string {
  return `Allowed category slugs (pick the closest, or "other"): groceries, food-dining, travel, transport, shopping, entertainment, bills-utilities, health, education, other`;
}

const EXTRACTION_INSTRUCTION = `You extract ONE expense transaction from the user content. Respond with ONLY valid JSON, no markdown, no code fences.
Fields:
- amount: number (positive, major currency units e.g. 12.99)
- currency: string ISO code default USD
- merchant: string or null
- date: ISO 8601 date string (best effort from content or today)
- categorySlug: one of the allowed slugs below
- notes: short string or null
- confidence: number 0-1 how sure you are

${buildCategoryHint()}`;

const MULTI_EMAIL_INSTRUCTION = `You extract EVERY distinct charge/transaction line from a bank or card summary email (the body may list many rows).
Each real spend line should become one object in the JSON array (e.g. each merchant + amount pair, often with a separate "Ref. No" / reference).
Respond with ONLY valid JSON, no markdown, no code fences.
Shape:
{ "transactions": [ { "amount", "currency", "merchant", "date", "categorySlug", "notes", "confidence", "referenceId" } ] }
Rules:
- amount: positive number per line (not a running total unless only one total exists)
- referenceId: copy bank reference if shown (e.g. SFT-1274491881), else null
- If the email has only one charge, return exactly one object in the array
- categorySlug: one of the allowed slugs below
- date: ISO 8601 best effort per line or email date

${buildCategoryHint()}`;

export async function extractTransactionsFromEmailText(
  text: string,
): Promise<ExtractedEmailLine[]> {
  const model = getModel();
  const prompt = `${MULTI_EMAIL_INSTRUCTION}\n\n---\nCONTENT:\n${text.slice(0, 12000)}`;
  let result;
  try {
    result = await model.generateContent(prompt);
  } catch (error) {
    if (!isModelUnavailableError(error)) throw error;
    const fallbackKey = process.env.GEMINI_API_KEY;
    if (!fallbackKey) throw error;
    const fallback = new GoogleGenerativeAI(fallbackKey).getGenerativeModel({
      model: "gemini-1.5-flash",
    });
    result = await fallback.generateContent(prompt);
  }
  const raw = result.response.text().trim();
  const fromModel = parseMultiFromModelRaw(raw, text);
  if (fromModel.length > 0) return fromModel;

  const regexLines = regexFallbackMultipleTransactions(text);
  if (regexLines.length > 0) return regexLines;

  const single = await extractTransactionFromText(text);
  return [{ ...single, referenceId: null }];
}

function parseMultiFromModelRaw(
  raw: string,
  sourceText: string,
): ExtractedEmailLine[] {
  let obj: unknown;
  try {
    obj = parseJsonFromModel(raw);
  } catch {
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start < 0 || end <= start) return [];
    try {
      obj = JSON.parse(raw.slice(start, end + 1)) as unknown;
    } catch {
      return [];
    }
  }
  if (!obj || typeof obj !== "object") return [];
  const rec = obj as Record<string, unknown>;
  if (Array.isArray(rec.transactions)) {
    const lines: ExtractedEmailLine[] = [];
    for (const row of rec.transactions) {
      if (!row || typeof row !== "object") continue;
      const norm = applyAmountFallback(row as Record<string, unknown>, sourceText);
      const p = extractedEmailLineSchema.safeParse(norm);
      if (p.success) lines.push(p.data);
    }
    if (lines.length > 0) return lines;
  }
  const single = applyAmountFallback(rec, sourceText);
  const one = extractedTransactionSchema.safeParse(single);
  if (one.success) return [{ ...one.data, referenceId: null }];
  return [];
}

/** YouTrip-style blocks: Ref. No + USD amount per segment. */
function regexFallbackMultipleTransactions(text: string): ExtractedEmailLine[] {
  const normalized = text.replace(/\r\n/g, "\n");
  const parts = normalized.split(/(?=\bRef\.?\s*No:?\s*SFT-[0-9]+)/i);
  if (parts.length < 2) return [];

  const nowIso = new Date().toISOString();
  const out: ExtractedEmailLine[] = [];

  for (const part of parts) {
    const refM = part.match(/\bRef\.?\s*No:?\s*(SFT-[0-9]+)\b/i);
    const usdM = part.match(
      /\bUSD\s*([0-9]{1,3}(?:,[0-9]{3})*(?:\.[0-9]{2})|[0-9]+(?:\.[0-9]{2})?)\b/i,
    );
    if (!refM || !usdM) continue;
    const amount = Number.parseFloat(usdM[1].replace(/,/g, ""));
    if (!Number.isFinite(amount) || amount <= 0) continue;

    const lines = part
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);
    const merchantLine =
      lines.find(
        (l) =>
          l.length > 2 &&
          !/^ref\.?\s*no/i.test(l) &&
          !/^usd\s*[0-9]/i.test(l) &&
          !/^\d{1,2}:\d{2}\s*(am|pm)?/i.test(l) &&
          !/^yesterday$/i.test(l),
      ) ?? null;

    out.push({
      amount,
      currency: "USD",
      merchant: merchantLine,
      date: nowIso,
      categorySlug: "transport",
      notes: "Parsed via reference + amount pattern (multi-line email).",
      confidence: 0.55,
      referenceId: refM[1],
    });
  }

  return out;
}

export async function extractTransactionFromText(
  text: string,
): Promise<ExtractedTransaction> {
  const model = getModel();
  const prompt = `${EXTRACTION_INSTRUCTION}\n\n---\nCONTENT:\n${text.slice(0, 12000)}`;
  let result;
  try {
    result = await model.generateContent(prompt);
  } catch (error) {
    if (!isModelUnavailableError(error)) throw error;
    const fallbackKey = process.env.GEMINI_API_KEY;
    if (!fallbackKey) throw error;
    const fallback = new GoogleGenerativeAI(fallbackKey).getGenerativeModel({
      model: "gemini-1.5-flash",
    });
    result = await fallback.generateContent(prompt);
  }
  const raw = result.response.text().trim();
  const parsed = safeParseModelJson(raw);
  const normalized = applyAmountFallback(parsed, text);
  try {
    return extractedTransactionSchema.parse(normalized);
  } catch {
    const heuristic = applyAmountFallback(buildHeuristicExtraction(text), text);
    return extractedTransactionSchema.parse(heuristic);
  }
}

export async function extractTransactionFromImageBuffer(
  buffer: Buffer,
  mimeType: string,
): Promise<ExtractedTransaction> {
  const model = getModel();
  const prompt = `${EXTRACTION_INSTRUCTION}\n\nThe image is a receipt or payment screenshot. Extract the main total paid.`;
  let result;
  const parts = [
    { text: prompt },
    {
      inlineData: {
        mimeType: mimeType || "image/jpeg",
        data: buffer.toString("base64"),
      },
    },
  ];
  try {
    result = await model.generateContent(parts);
  } catch (error) {
    if (!isModelUnavailableError(error)) throw error;
    const fallbackKey = process.env.GEMINI_API_KEY;
    if (!fallbackKey) throw error;
    const fallback = new GoogleGenerativeAI(fallbackKey).getGenerativeModel({
      model: "gemini-1.5-flash",
    });
    result = await fallback.generateContent(parts);
  }
  const raw = result.response.text().trim();
  const parsed = safeParseModelJson(raw);
  const normalized = applyAmountFallback(parsed, prompt);
  try {
    return extractedTransactionSchema.parse(normalized);
  } catch {
    const heuristic = applyAmountFallback(buildHeuristicExtraction(prompt), prompt);
    return extractedTransactionSchema.parse(heuristic);
  }
}

function parseJsonFromModel(raw: string): unknown {
  let t = raw;
  if (t.startsWith("```")) {
    t = t.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
  }
  return JSON.parse(t) as unknown;
}

function safeParseModelJson(raw: string): Record<string, unknown> {
  try {
    return parseJsonFromModel(raw) as Record<string, unknown>;
  } catch {
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(raw.slice(start, end + 1)) as Record<string, unknown>;
      } catch {
        // Continue to heuristic extraction below.
      }
    }
    return buildHeuristicExtraction(raw);
  }
}

function buildHeuristicExtraction(sourceText: string): Record<string, unknown> {
  const nowIso = new Date().toISOString();
  const upper = sourceText.toUpperCase();

  const currencyAmountMatch = upper.match(
    /\b([A-Z]{3})\s*([0-9]{1,3}(?:,[0-9]{3})*(?:\.[0-9]{2})|[0-9]+(?:\.[0-9]{2})?)\b/,
  );
  const usdMatch = sourceText.match(
    /\$\s*([0-9]{1,3}(?:,[0-9]{3})*(?:\.[0-9]{2})|[0-9]+(?:\.[0-9]{2})?)/,
  );
  const merchantMatch = sourceText.match(
    /\b([A-Z0-9][A-Z0-9&.,' -]{2,40})\s+(?:USD|SGD|MYR|EUR|GBP|AUD|CAD)\s+[0-9]/i,
  );

  const amount = currencyAmountMatch
    ? Number.parseFloat(currencyAmountMatch[2].replace(/,/g, ""))
    : usdMatch
      ? Number.parseFloat(usdMatch[1].replace(/,/g, ""))
      : NaN;

  const currency = currencyAmountMatch
    ? currencyAmountMatch[1]
    : usdMatch
      ? "USD"
      : "USD";

  return {
    amount: Number.isFinite(amount) && amount > 0 ? amount : 0.01,
    currency,
    merchant: merchantMatch?.[1]?.trim() ?? null,
    date: nowIso,
    categorySlug: "other",
    notes: "Fallback extraction used due ambiguous email format.",
    confidence: 0.35,
  };
}

function applyAmountFallback(
  json: Record<string, unknown>,
  sourceText: string,
): Record<string, unknown> {
  const amount =
    typeof json.amount === "number"
      ? json.amount
      : Number.parseFloat(String(json.amount ?? "NaN"));

  if (Number.isFinite(amount) && amount > 0) return json;

  const lineMatch = sourceText.match(
    /\b([A-Z]{3})\s*([0-9]{1,3}(?:,[0-9]{3})*(?:\.[0-9]{2})|[0-9]+(?:\.[0-9]{2})?)\b/,
  );
  if (lineMatch) {
    const parsed = Number.parseFloat(lineMatch[2].replace(/,/g, ""));
    if (Number.isFinite(parsed) && parsed > 0) {
      return {
        ...json,
        amount: parsed,
        currency:
          typeof json.currency === "string" && json.currency.trim()
            ? json.currency
            : lineMatch[1],
      };
    }
  }

  const usdMatch = sourceText.match(
    /\$\s*([0-9]{1,3}(?:,[0-9]{3})*(?:\.[0-9]{2})|[0-9]+(?:\.[0-9]{2})?)/,
  );
  if (usdMatch) {
    const parsed = Number.parseFloat(usdMatch[1].replace(/,/g, ""));
    if (Number.isFinite(parsed) && parsed > 0) {
      return {
        ...json,
        amount: parsed,
        currency:
          typeof json.currency === "string" && json.currency.trim()
            ? json.currency
            : "USD",
      };
    }
  }

  return json;
}

/** Map slug to Category id for this user DB; falls back to "other" */
export async function resolveCategoryId(
  slug: string | null | undefined,
): Promise<string | null> {
  const s = (slug ?? "other").toLowerCase().replace(/\s+/g, "-");
  const cat = await prisma.category.findUnique({ where: { slug: s } });
  if (cat) return cat.id;
  const other = await prisma.category.findUnique({ where: { slug: "other" } });
  return other?.id ?? null;
}

export function parseOccurredAt(dateStr: string): Date {
  const d = new Date(dateStr);
  if (!Number.isNaN(d.getTime())) return d;
  return new Date();
}
