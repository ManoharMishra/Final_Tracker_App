-- Add team_id to threads table for team-scoped thread visibility
ALTER TABLE threads ADD COLUMN IF NOT EXISTS "team_id" UUID REFERENCES teams(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS "threads_team_id_idx" ON threads("team_id");
