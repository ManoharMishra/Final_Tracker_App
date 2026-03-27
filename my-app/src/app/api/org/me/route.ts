import { NextRequest } from "next/server";
import { handleApiError } from "@/lib/errors";
import { getActorContext } from "@/app/api/org/_utils";
import { prisma } from "@/lib/prisma";

type TeamRow = { teamId: string; teamName: string };

export async function GET(request: NextRequest) {
  try {
    const actorId = request.headers.get("x-user-id") ?? "";
    const actor = await getActorContext(actorId);

    const teamRows = await prisma.$queryRaw<TeamRow[]>`
      SELECT tm."teamId", t.name AS "teamName"
      FROM team_members tm
      INNER JOIN teams t ON t.id = tm."teamId"
      WHERE tm."userId" = ${actorId}::uuid
        AND t."orgId" = ${actor.orgId}::uuid
      ORDER BY t.name ASC
    `;

    const manageableRows = actor.role === "OWNER"
      ? await prisma.$queryRaw<TeamRow[]>`
          SELECT t.id AS "teamId", t.name AS "teamName"
          FROM teams t
          WHERE t."orgId" = ${actor.orgId}::uuid
          ORDER BY t.name ASC
        `
      : actor.role === "ADMIN"
        ? await prisma.$queryRaw<TeamRow[]>`
            SELECT DISTINCT t.id AS "teamId", t.name AS "teamName"
            FROM teams t
            LEFT JOIN team_members tm
              ON tm."teamId" = t.id
             AND tm."userId" = ${actorId}::uuid
            WHERE t."orgId" = ${actor.orgId}::uuid
              AND (
                tm."userId" IS NOT NULL
                OR t."createdBy" = ${actorId}::uuid
              )
            ORDER BY t.name ASC
          `
        : teamRows;

    const team = teamRows[0] ?? null;

    return Response.json({
      data: {
        orgId: actor.orgId,
        role: actor.role,
        teamId: team?.teamId ?? null,
        teamName: team?.teamName ?? null,
        teamIds: teamRows.map((t) => t.teamId),
        teams: teamRows.map((t) => ({ id: t.teamId, name: t.teamName })),
        manageableTeamIds: manageableRows.map((t) => t.teamId),
        manageableTeams: manageableRows.map((t) => ({ id: t.teamId, name: t.teamName })),
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
