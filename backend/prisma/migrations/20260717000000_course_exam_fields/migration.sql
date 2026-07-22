-- AlterTable
ALTER TABLE "Course" DROP COLUMN "subject",
ADD COLUMN     "section" TEXT,
ADD COLUMN     "year" TEXT;

-- AlterTable
ALTER TABLE "Exam" ADD COLUMN     "endsAt" TIMESTAMP(3),
ADD COLUMN     "startsAt" TIMESTAMP(3);
