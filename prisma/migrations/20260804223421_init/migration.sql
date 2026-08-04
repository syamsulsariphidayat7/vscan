-- CreateTable
CREATE TABLE "ScanSession" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "webhookUrl" TEXT,
    "webhookToken" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ScanSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PendingScan" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "barcode" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deliveredAt" TIMESTAMP(3),

    CONSTRAINT "PendingScan_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ScanSession_code_key" ON "ScanSession"("code");

-- CreateIndex
CREATE INDEX "ScanSession_code_idx" ON "ScanSession"("code");

-- CreateIndex
CREATE INDEX "ScanSession_status_idx" ON "ScanSession"("status");

-- CreateIndex
CREATE INDEX "PendingScan_sessionId_status_idx" ON "PendingScan"("sessionId", "status");

-- CreateIndex
CREATE INDEX "PendingScan_createdAt_idx" ON "PendingScan"("createdAt");

-- AddForeignKey
ALTER TABLE "PendingScan" ADD CONSTRAINT "PendingScan_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "ScanSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
