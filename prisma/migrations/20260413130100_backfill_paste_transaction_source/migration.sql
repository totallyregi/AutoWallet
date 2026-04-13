UPDATE "Transaction"
SET source = 'text'::"TransactionSource"
WHERE "externalId" LIKE 'paste:%';
