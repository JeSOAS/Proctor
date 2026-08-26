-- AlterTable
ALTER TABLE "Exam" ADD COLUMN     "autoClose" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "disconnectGraceSec" INTEGER NOT NULL DEFAULT 180,
ADD COLUMN     "notifyStudent" BOOLEAN NOT NULL DEFAULT false;
