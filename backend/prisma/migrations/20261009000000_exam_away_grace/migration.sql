-- Per-exam "away from Chrome" allowance (seconds); previously a fixed 30 s.
ALTER TABLE "Exam" ADD COLUMN "awayGraceSec" INTEGER NOT NULL DEFAULT 30;
