-- Category for unmatched reversal lines (excluded from spend)
INSERT INTO "Category" ("id", "name", "slug")
SELECT 'cmigcat_reversed', 'Reversed', 'reversed'
WHERE NOT EXISTS (SELECT 1 FROM "Category" WHERE "slug" = 'reversed');

-- Saved Gmail senders (multi-select); backfill from legacy User.gmailSender
CREATE TABLE "SavedGmailSender" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SavedGmailSender_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SavedGmailSender_userId_email_key" ON "SavedGmailSender"("userId", "email");
CREATE INDEX "SavedGmailSender_userId_idx" ON "SavedGmailSender"("userId");

ALTER TABLE "SavedGmailSender" ADD CONSTRAINT "SavedGmailSender_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "SavedGmailSender" ("id", "userId", "email", "createdAt")
SELECT
  'mig_' || "id" || '_' || substr(md5(random()::text), 1, 8),
  "id",
  lower(trim("gmailSender")),
  CURRENT_TIMESTAMP
FROM "User"
WHERE "gmailSender" IS NOT NULL AND trim("gmailSender") <> '';

-- Transaction reversal / spend exclusion
ALTER TABLE "Transaction" ADD COLUMN "excludedFromSpend" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Transaction" ADD COLUMN "isReversalLine" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Transaction" ADD COLUMN "reversesTransactionId" TEXT;

CREATE UNIQUE INDEX "Transaction_reversesTransactionId_key" ON "Transaction"("reversesTransactionId");

ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_reversesTransactionId_fkey" FOREIGN KEY ("reversesTransactionId") REFERENCES "Transaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "User" DROP COLUMN "gmailSender";
