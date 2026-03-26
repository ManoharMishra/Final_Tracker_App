-- Team support + team-scoped invites

-- 1) Teams table
CREATE TABLE IF NOT EXISTS teams (
  id uuid NOT NULL,
  "orgId" uuid NOT NULL,
  name varchar(100) NOT NULL,
  slug varchar(120) NOT NULL,
  "createdBy" uuid,
  "createdAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" timestamp(3) NOT NULL,
  CONSTRAINT teams_pkey PRIMARY KEY (id),
  CONSTRAINT teams_org_fkey FOREIGN KEY ("orgId") REFERENCES organizations(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS teams_org_slug_key ON teams("orgId", slug);
CREATE INDEX IF NOT EXISTS teams_org_idx ON teams("orgId");

-- 2) Team members table (one team per user)
CREATE TABLE IF NOT EXISTS team_members (
  id text NOT NULL,
  "teamId" uuid NOT NULL,
  "userId" uuid NOT NULL,
  "joinedAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT team_members_pkey PRIMARY KEY (id),
  CONSTRAINT team_members_team_fkey FOREIGN KEY ("teamId") REFERENCES teams(id) ON DELETE CASCADE,
  CONSTRAINT team_members_user_fkey FOREIGN KEY ("userId") REFERENCES users(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS team_members_team_user_key ON team_members("teamId", "userId");
CREATE UNIQUE INDEX IF NOT EXISTS team_members_user_key ON team_members("userId");
CREATE INDEX IF NOT EXISTS team_members_team_idx ON team_members("teamId");

-- 3) Team on invites
ALTER TABLE invites
  ADD COLUMN IF NOT EXISTS "teamId" uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'invites_team_fkey'
  ) THEN
    ALTER TABLE invites
      ADD CONSTRAINT invites_team_fkey
      FOREIGN KEY ("teamId") REFERENCES teams(id)
      ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS invites_team_idx ON invites("teamId");

-- 4) Backfill: create one team for each ADMIN without a team, then add membership to that team.
WITH admin_users AS (
  SELECT DISTINCT m."orgId", m."userId"
  FROM memberships m
  LEFT JOIN team_members tm ON tm."userId" = m."userId"
  WHERE m.role = 'ADMIN'::"Role"
    AND tm."userId" IS NULL
),
new_teams AS (
  INSERT INTO teams (id, "orgId", name, slug, "createdBy", "updatedAt")
  SELECT
    (
      substr(md5('team:' || a."userId"::text), 1, 8) || '-' ||
      substr(md5('team:' || a."userId"::text), 9, 4) || '-' ||
      substr(md5('team:' || a."userId"::text), 13, 4) || '-' ||
      substr(md5('team:' || a."userId"::text), 17, 4) || '-' ||
      substr(md5('team:' || a."userId"::text), 21, 12)
    )::uuid,
    a."orgId",
    'Admin Team ' || left(a."userId"::text, 8),
    'admin-team-' || lower(left(a."userId"::text, 8)),
    a."userId",
    now()
  FROM admin_users a
  ON CONFLICT (id) DO NOTHING
  RETURNING id, "orgId", "createdBy"
)
INSERT INTO team_members (id, "teamId", "userId", "joinedAt")
SELECT
  md5('team_member:' || nt.id::text || ':' || nt."createdBy"::text),
  nt.id,
  nt."createdBy",
  now()
FROM new_teams nt
ON CONFLICT ("userId") DO NOTHING;
