import { NextRequest } from "next/server";
import { handleApiError } from "@/lib/errors";
import { prisma } from "@/lib/prisma";
import { getActorContext } from "@/app/api/org/_utils";

type TeamRow = {
  id: string;
  name: string;
  slug: string;
  memberCount: number;
};

type TeamMemberRow = {
  teamId: string;
  userId: string;
  name: string;
  email: string;
  role: "OWNER" | "ADMIN" | "MEMBER";
  joinedAt: Date;
};

export async function GET(request: NextRequest) {
  try {
    const actorId = request.headers.get("x-user-id") ?? "";
    const actor = await getActorContext(actorId);

    const actorTeamRows = await prisma.$queryRaw<Array<{ teamId: string }>>`
      SELECT tm."teamId"
      FROM team_members tm
      INNER JOIN teams t ON t.id = tm."teamId"
      WHERE tm."userId" = ${actorId}::uuid
        AND t."orgId" = ${actor.orgId}::uuid
      ORDER BY t.name ASC
    `;

    const teamIds = actorTeamRows.map((row) => row.teamId);
    if (teamIds.length === 0) {
      return Response.json({ data: { teams: [], members: [] } });
    }

    const [teams, members] = await Promise.all([
      prisma.$queryRaw<TeamRow[]>`
        SELECT
          t.id,
          t.name,
          t.slug,
          COUNT(tm."userId")::int AS "memberCount"
        FROM teams t
        LEFT JOIN team_members tm ON tm."teamId" = t.id
        WHERE t."orgId" = ${actor.orgId}::uuid
          AND t.id = ANY(${teamIds}::uuid[])
        GROUP BY t.id, t.name, t.slug
        ORDER BY t.name ASC
      `,
      prisma.$queryRaw<TeamMemberRow[]>`
        SELECT
          tm."teamId",
          u.id AS "userId",
          u.name,
          u.email,
          m.role,
          tm."joinedAt"
        FROM team_members tm
        INNER JOIN teams t ON t.id = tm."teamId"
        INNER JOIN users u ON u.id = tm."userId"
        INNER JOIN memberships m
          ON m."userId" = u.id
         AND m."orgId" = t."orgId"
        WHERE t."orgId" = ${actor.orgId}::uuid
          AND tm."teamId" = ANY(${teamIds}::uuid[])
        ORDER BY t.name ASC,
          CASE m.role
            WHEN 'OWNER' THEN 1
            WHEN 'ADMIN' THEN 2
            ELSE 3
          END,
          u.name ASC
      `,
    ]);

    // Filter out OWNER members unless the viewing user is an OWNER
    const filteredMembers = actor.role === "OWNER" 
      ? members 
      : members.filter((m) => m.role !== "OWNER");

    return Response.json({ data: { teams, members: filteredMembers } });
  } catch (error) {
    return handleApiError(error);
  }
}
