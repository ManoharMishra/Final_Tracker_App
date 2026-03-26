import { NextRequest } from "next/server";
import { handleApiError } from "@/lib/errors";
import { getActorContext } from "@/app/api/org/_utils";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  try {
    const actorId = request.headers.get("x-user-id") ?? "";
    const actor = await getActorContext(actorId);
    const teamRows = await prisma.$queryRaw<Array<{ teamId: string; teamName: string }>>`
      SELECT tm."teamId", t.name AS "teamName"
      FROM team_members tm
      INNER JOIN teams t ON t.id = tm."teamId"
      WHERE tm."userId" = ${actorId}::uuid
        AND t."orgId" = ${actor.orgId}::uuid
      ORDER BY t.name ASC
    `;

    const team = teamRows[0] ?? null;

    return Response.json({
      data: {
        orgId: actor.orgId,
        role: actor.role,
        teamId: team?.teamId ?? null,
        teamName: team?.teamName ?? null,
        teamIds: teamRows.map((t) => t.teamId),
        teams: teamRows.map((t) => ({ id: t.teamId, name: t.teamName })),
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
