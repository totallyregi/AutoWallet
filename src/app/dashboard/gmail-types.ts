export type GmailConnectionState =
  | "oauth_disabled"
  | "not_linked"
  | "needs_reconnect"
  | "connected";

/** Row shape for the Gmail messages table (matches API). */
export type GmailTableRow = {
  gmailMessageId: string;
  from: string;
  subject: string;
  date: string;
  messageId: string;
  snippet: string;
  parseStatus: "open" | "partial" | "complete";
};
