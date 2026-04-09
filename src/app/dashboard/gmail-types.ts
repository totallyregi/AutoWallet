export type GmailConnectionState =
  | "oauth_disabled"
  | "not_linked"
  | "needs_reconnect"
  | "connected";

/** Row shape for the Gmail messages table (matches API + optional tracked flag). */
export type GmailTableRow = {
  gmailMessageId: string;
  from: string;
  subject: string;
  date: string;
  messageId: string;
  snippet: string;
  tracked?: boolean;
};
