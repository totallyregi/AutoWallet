import type { GmailTableRow } from "./gmail-types";

export type ParseJobResultLine = {
  merchant: string | null;
  amount: number;
  currency: string;
  occurredAt: string;
  kind: "charge" | "reversal";
};

export type ParseJobResultRow = {
  sourceId: string;
  title: string;
  subtitle?: string;
  status: "parsed" | "duplicate" | "error";
  error?: string;
  createdCount?: number;
  lineCount?: number;
  createdTransactions?: ParseJobResultLine[];
  /** Gmail: declined-authorization notice — no rows stored */
  skippedDeclined?: boolean;
};

export type ReceiptParseSource = {
  id: string;
  name: string;
  previewUrl: string;
  isPdf: boolean;
};

export type ParseJobConfig =
  | {
      kind: "gmail";
      rows: GmailTableRow[];
      onOpenEmail: (gmailMessageId: string) => void;
    }
  | { kind: "receipt"; sources: ReceiptParseSource[] }
  | { kind: "text"; pastedText: string };
