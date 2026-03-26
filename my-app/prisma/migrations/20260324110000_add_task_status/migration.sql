DO $$
BEGIN
  CREATE TYPE "TaskStatus" AS ENUM ('open', 'in_progress', 'done');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "tasks"
ADD COLUMN IF NOT EXISTS "status" "TaskStatus" NOT NULL DEFAULT 'open';
