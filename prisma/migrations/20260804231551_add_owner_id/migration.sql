-- AlterTable
ALTER TABLE "ScanSession" ADD COLUMN     "ownerId" TEXT;

-- CreateIndex
CREATE INDEX "ScanSession_ownerId_status_idx" ON "ScanSession"("ownerId", "status");
