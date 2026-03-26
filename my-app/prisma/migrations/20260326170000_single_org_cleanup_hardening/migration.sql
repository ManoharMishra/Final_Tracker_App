DO $$
DECLARE
  kept_org_id uuid;
BEGIN
  SELECT id
  INTO kept_org_id
  FROM organizations
  ORDER BY created_at ASC
  LIMIT 1;

  IF kept_org_id IS NULL THEN
    RETURN;
  END IF;

  -- Normalize users to the kept organization.
  UPDATE users
  SET org_id = kept_org_id
  WHERE org_id <> kept_org_id;

  -- Normalize invites to the kept organization.
  UPDATE invites
  SET "orgId" = kept_org_id
  WHERE "orgId" <> kept_org_id;

  -- Keep only memberships in the kept organization.
  DELETE FROM memberships
  WHERE "orgId" <> kept_org_id;

  -- Ensure each user has exactly one membership in the kept organization.
  INSERT INTO memberships (id, "userId", "orgId", role, "joinedAt")
  SELECT
    md5(u.id::text || ':' || kept_org_id::text || ':' || now()::text),
    u.id,
    kept_org_id,
    'MEMBER'::"Role",
    now()
  FROM users u
  LEFT JOIN memberships m
    ON m."userId" = u.id
   AND m."orgId" = kept_org_id
  WHERE m.id IS NULL;

  -- Ensure there is at least one OWNER membership.
  IF NOT EXISTS (
    SELECT 1
    FROM memberships m
    WHERE m."orgId" = kept_org_id
      AND m.role = 'OWNER'
  ) THEN
    UPDATE memberships
    SET role = 'OWNER'::"Role"
    WHERE id = (
      SELECT m.id
      FROM memberships m
      INNER JOIN users u ON u.id = m."userId"
      WHERE m."orgId" = kept_org_id
      ORDER BY u.created_at ASC
      LIMIT 1
    );
  END IF;

  -- Remove all non-kept organizations.
  DELETE FROM organizations
  WHERE id <> kept_org_id;
END $$;

-- Hardening: at most one organization row in runtime.
CREATE UNIQUE INDEX IF NOT EXISTS organizations_singleton_idx
  ON organizations ((true));

-- Hardening: membership org must always match users.org_id.
CREATE OR REPLACE FUNCTION enforce_membership_user_org_match()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  user_org_id uuid;
BEGIN
  SELECT org_id
  INTO user_org_id
  FROM users
  WHERE id = NEW."userId";

  IF user_org_id IS NULL THEN
    RAISE EXCEPTION 'User % not found for membership row', NEW."userId";
  END IF;

  IF user_org_id <> NEW."orgId" THEN
    RAISE EXCEPTION 'Membership orgId (%) must match users.org_id (%) for user %', NEW."orgId", user_org_id, NEW."userId";
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS memberships_enforce_user_org_match ON memberships;

CREATE TRIGGER memberships_enforce_user_org_match
BEFORE INSERT OR UPDATE ON memberships
FOR EACH ROW
EXECUTE FUNCTION enforce_membership_user_org_match();
