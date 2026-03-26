-- Allow users to belong to multiple teams
DROP INDEX IF EXISTS team_members_user_key;
CREATE INDEX IF NOT EXISTS team_members_user_idx ON team_members("userId");
