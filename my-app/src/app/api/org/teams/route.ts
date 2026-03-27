import { randomUUID } from "crypto";
import { NextRequest } from "next/server";
import { z } from "zod";
import { ApiError, handleApiError } from "@/lib/errors";
import { prisma } from "@/lib/prisma";
import { assertManagerRole, getActorContext } from "@/app/api/org/_utils";

const createTeamSchema = z
  .object({
    name: z.string().trim().min(2, "name must be at least 2 characters").max(100),
  })
  .strict();

function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
}

export async function GET(request: NextRequest) {
  try {
    const actorId = request.headers.get("x-user-id") ?? "";
    const actor = await getActorContext(actorId);
    assertManagerRole(actor.role);

    if (actor.role === "ADMIN") {
      const manageableTeamRows = await prisma.$queryRaw<Array<{ id: string }>>`
        SELECT DISTINCT t.id
        FROM teams t
        LEFT JOIN team_members tm
          ON tm."teamId" = t.id
         AND tm."userId" = ${actorId}::uuid
        WHERE t."orgId" = ${actor.orgId}::uuid
          AND (
            tm."userId" IS NOT NULL
            OR t."createdBy" = ${actorId}::uuid
          )
      `;

      const manageableTeamIds = manageableTeamRows.map((row) => row.id);

      if (manageableTeamIds.length === 0) {
        return Response.json({ data: { teams: [], members: [] } });
      }

      const [teams, members] = await Promise.all([
        prisma.$queryRaw<
          Array<{
            id: string;
            name: string;
            slug: string;
            createdAt: Date;
            memberCount: number;
          }>
        >`
          SELECT
            t.id,
            t.name,
            t.slug,
            t."createdAt",
            COUNT(tm."userId")::int AS "memberCount"
          FROM teams t
          LEFT JOIN team_members tm ON tm."teamId" = t.id
          WHERE t."orgId" = ${actor.orgId}::uuid
            AND t.id = ANY(${manageableTeamIds}::uuid[])
          GROUP BY t.id, t.name, t.slug, t."createdAt"
          ORDER BY t.name ASC
        `,
        prisma.$queryRaw<
          Array<{
            userId: string;
            name: string;
            email: string;
            role: "OWNER" | "ADMIN" | "MEMBER";
            teamIds: string[];
            teamNames: string[];
          }>
        >`
          SELECT
            u.id AS "userId",
            u.name,
            u.email,
            m.role,
            COALESCE(
              ARRAY_AGG(DISTINCT tm."teamId") FILTER (WHERE tm."teamId" IS NOT NULL),
              ARRAY[]::uuid[]
            )::text[] AS "teamIds",
            COALESCE(
              ARRAY_AGG(DISTINCT t.name) FILTER (WHERE t.name IS NOT NULL),
              ARRAY[]::text[]
            ) AS "teamNames"
          FROM memberships m
          INNER JOIN users u ON u.id = m."userId"
          INNER JOIN team_members tm ON tm."userId" = u.id
          INNER JOIN teams t ON t.id = tm."teamId"
          WHERE m."orgId" = ${actor.orgId}::uuid
            AND tm."teamId" = ANY(${manageableTeamIds}::uuid[])
            AND m.role <> 'OWNER'
          GROUP BY u.id, u.name, u.email, m.role
          ORDER BY
            CASE m.role
              WHEN 'ADMIN' THEN 1
              ELSE 2
            END,
            u.name ASC
        `,
      ]);

      return Response.json({ data: { teams, members, actorRole: actor.role } });
    }

    const [teams, members] = await Promise.all([
      prisma.$queryRaw<
        Array<{
          id: string;
          name: string;
          slug: string;
          createdAt: Date;
          memberCount: number;
        }>
      >`
        SELECT
          t.id,
          t.name,
          t.slug,
          t."createdAt",
          COUNT(tm."userId")::int AS "memberCount"
        FROM teams t
        LEFT JOIN team_members tm ON tm."teamId" = t.id
        WHERE t."orgId" = ${actor.orgId}::uuid
        GROUP BY t.id, t.name, t.slug, t."createdAt"
        ORDER BY t.name ASC
      `,
      prisma.$queryRaw<
        Array<{
          userId: string;
          name: string;
          email: string;
          role: "OWNER" | "ADMIN" | "MEMBER";
          teamIds: string[];
          teamNames: string[];
        }>
      >`
        SELECT
          u.id AS "userId",
          u.name,
          u.email,
          m.role,
          COALESCE(
            ARRAY_AGG(DISTINCT tm."teamId") FILTER (WHERE tm."teamId" IS NOT NULL),
            ARRAY[]::uuid[]
          )::text[] AS "teamIds",
          COALESCE(
            ARRAY_AGG(DISTINCT t.name) FILTER (WHERE t.name IS NOT NULL),
            ARRAY[]::text[]
          ) AS "teamNames"
        FROM memberships m
        INNER JOIN users u ON u.id = m."userId"
        LEFT JOIN team_members tm ON tm."userId" = u.id
        LEFT JOIN teams t ON t.id = tm."teamId"
        WHERE m."orgId" = ${actor.orgId}::uuid
        GROUP BY u.id, u.name, u.email, m.role
        ORDER BY
          CASE m.role
            WHEN 'OWNER' THEN 1
            WHEN 'ADMIN' THEN 2
            ELSE 3
          END,
          u.name ASC
      `,
    ]);

    return Response.json({ data: { teams, members, actorRole: actor.role } });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const actorId = request.headers.get("x-user-id") ?? "";
    const actor = await getActorContext(actorId);
    assertManagerRole(actor.role);

    const body = await request.json();
    const parsed = createTeamSchema.safeParse(body);
    if (!parsed.success) {
      throw new ApiError("BAD_REQUEST", "Invalid request body", parsed.error.issues);
    }

    const baseSlug = slugify(parsed.data.name);
    if (!baseSlug) {
      throw new ApiError("BAD_REQUEST", "Team name must contain letters or numbers");
    }

    let slug = baseSlug;
    let suffix = 2;

    while (true) {
      const existing = await prisma.$queryRaw<Array<{ id: string }>>`
        SELECT id
        FROM teams
        WHERE "orgId" = ${actor.orgId}::uuid
          AND slug = ${slug}
        LIMIT 1
      `;

      if (!existing[0]) {
        break;
      }

      slug = `${baseSlug}-${suffix}`.slice(0, 120);
      suffix += 1;
    }

    const teamId = randomUUID();
    const created = await prisma.$transaction(async (tx) => {
      const createdRows = await tx.$queryRaw<
        Array<{ id: string; name: string; slug: string; createdAt: Date }>
      >`
        INSERT INTO teams (id, "orgId", name, slug, "createdBy", "createdAt", "updatedAt")
        VALUES (
          ${teamId}::uuid,
          ${actor.orgId}::uuid,
          ${parsed.data.name},
          ${slug},
          ${actorId}::uuid,
          now(),
          now()
        )
        RETURNING id, name, slug, "createdAt"
      `;

      const createdTeam = createdRows[0];
      if (!createdTeam) {
        return null;
      }

      await tx.$executeRaw`
        INSERT INTO team_members (id, "teamId", "userId", "joinedAt")
        VALUES (
          ${randomUUID()},
          ${teamId}::uuid,
          ${actorId}::uuid,
          now()
        )
        ON CONFLICT ("teamId", "userId") DO NOTHING
      `;

      return createdTeam;
    });

    if (!created) {
      throw new ApiError("INTERNAL_ERROR", "Failed to create team");
    }

    return Response.json({
      data: {
        ...created,
        memberCount: 1,
      },
    }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
