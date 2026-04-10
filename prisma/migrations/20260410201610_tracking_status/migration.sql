-- CreateIndex
CREATE INDEX "Transaction_userId_excludedFromSpend_idx" ON "Transaction"("userId", "excludedFromSpend");
