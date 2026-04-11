-- Clear parsed finance data only (Supabase / Postgres).
-- Keeps: User, Account, Session, VerificationToken, Category
-- Removes: all transactions, Gmail parse tracking, optional saved senders (see bottom).

BEGIN;

TRUNCATE TABLE "EmailParseSnapshot" RESTART IDENTITY CASCADE;
TRUNCATE TABLE "Transaction" RESTART IDENTITY CASCADE;

-- Uncomment the next line if you also want to remove saved Gmail sender filters:
-- TRUNCATE TABLE "SavedGmailSender" RESTART IDENTITY CASCADE;

COMMIT;
