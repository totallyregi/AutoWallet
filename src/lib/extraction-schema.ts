import { z } from "zod";

/** Parsed JSON from Gemini before DB normalization */
export const extractedTransactionSchema = z.object({
  amount: z.number().positive(),
  currency: z.string().min(1).max(8).default("USD"),
  merchant: z.string().max(500).optional().nullable(),
  date: z.string().describe("ISO date or parseable date string"),
  categorySlug: z
    .string()
    .max(64)
    .optional()
    .nullable()
    .describe("One of the allowed category slugs"),
  notes: z.string().max(2000).optional().nullable(),
  confidence: z.number().min(0).max(1).optional().nullable(),
});

export type ExtractedTransaction = z.infer<typeof extractedTransactionSchema>;

/** One line from a multi-transaction bank email (e.g. YouTrip summary). */
export const extractedEmailLineSchema = extractedTransactionSchema.extend({
  referenceId: z
    .string()
    .max(128)
    .optional()
    .nullable()
    .describe("Bank reference e.g. SFT-1274491881 when present"),
});

export const multiExtractResponseSchema = z.object({
  transactions: z.array(extractedEmailLineSchema).min(1).max(40),
});

export type ExtractedEmailLine = z.infer<typeof extractedEmailLineSchema>;
