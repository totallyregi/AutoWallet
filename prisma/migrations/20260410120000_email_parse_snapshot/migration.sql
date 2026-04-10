-- Expected transaction external IDs per RFC Message-ID (normalized), for Gmail parse state (open / partial / complete).
CREATE TABLE "EmailParseSnapshot" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "messageKey" TEXT NOT NULL,
    "externalIds" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmailParseSnapshot_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "EmailParseSnapshot_userId_messageKey_key" ON "EmailParseSnapshot"("userId", "messageKey");
CREATE INDEX "EmailParseSnapshot_userId_idx" ON "EmailParseSnapshot"("userId");

ALTER TABLE "EmailParseSnapshot" ADD CONSTRAINT "EmailParseSnapshot_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
