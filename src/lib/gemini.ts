import { GoogleGenerativeAI } from "@google/generative-ai";
import prisma from "@/lib/prisma";
import {
  extractedTransactionSchema,
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
  const json = parseJsonFromModel(raw) as Record<string, unknown>;
  const normalized = applyAmountFallback(json, text);
  return extractedTransactionSchema.parse(normalized);
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
  const json = parseJsonFromModel(raw) as Record<string, unknown>;
  const normalized = applyAmountFallback(json, prompt);
  return extractedTransactionSchema.parse(normalized);
}

function parseJsonFromModel(raw: string): unknown {
  let t = raw;
  if (t.startsWith("```")) {
    t = t.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
  }
  return JSON.parse(t) as unknown;
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
