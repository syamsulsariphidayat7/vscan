/*
  Warnings:

  - You are about to drop the column `webhookToken` on the `ScanSession` table. All the data in the column will be lost.
  - You are about to drop the column `webhookUrl` on the `ScanSession` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "ScanSession" DROP COLUMN "webhookToken",
DROP COLUMN "webhookUrl";
