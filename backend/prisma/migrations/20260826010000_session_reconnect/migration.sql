-- AlterTable
ALTER TABLE "StudentSession" ADD COLUMN     "disconnectedAt" TIMESTAMP(3),
ADD COLUMN     "endedReason" TEXT;
