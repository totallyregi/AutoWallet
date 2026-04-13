-- New enum value must be the only statement in this migration so it commits
-- before any UPDATE uses `text` (PostgreSQL 55P04 otherwise).
ALTER TYPE "TransactionSource" ADD VALUE 'text';
