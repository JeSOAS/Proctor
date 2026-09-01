-- Add optional expected-student count and required exam link to Exam.
ALTER TABLE "Exam" ADD COLUMN "expectedStudents" INTEGER;
ALTER TABLE "Exam" ADD COLUMN "examLink" TEXT;
