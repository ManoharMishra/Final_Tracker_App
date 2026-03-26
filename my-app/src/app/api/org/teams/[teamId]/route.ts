import { NextRequest } from "next/server";
import { z } from "zod";
import { ApiError, handleApiError } from "@/lib/errors";
import { prisma } from "@/lib/prisma";
import { assertManagerRole, getActorContext } from "@/app/api/org/_utils";

const renameTeamSchema = z
  .object({
    name: z.string().trim().min(2, "name must be at least 2 characters").max(100),
  })
  .strict();

type RouteContext = { params: Promise<{ teamId: string }> };

export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const actorId = request.headers.get("x-user-id") ?? "";
    const actor = await getActorContext(actorId);
    assertManagerRole(actor.role);

    const { teamId } = await context.params;
    if (!teamId) {
      throw new ApiError("BAD_REQUEST", "teamId is required");
    }

    const body = await request.json();
    const parsed = renameTeamSchema.safeParse(body);
    if (!parsed.success) {
      throw new ApiError("BAD_REQUEST", "Invalid request body", parsed.error.issues);
    }

    const existingRows = await prisma.$queryRaw<Array<{ id: string }>>`
      SELECT id
      FROM teams
      WHERE id = ${teamId}::uuid
        AND "orgId" = ${actor.orgId}::uuid
      LIMIT 1
    `;

    if (!existingRows[0]) {
      throw new ApiError("NOT_FOUND", "Team not found in this organization");
    }

    if (actor.role === "ADMIN") {
      const adminTeamRows = await prisma.$queryRaw<Array<{ teamId: string }>>`
        SELECT tm."teamId"
        FROM team_members tm
        INNER JOIN teams t ON t.id = tm."teamId"
        WHERE tm."userId" = ${actorId}::uuid
          AND t."orgId" = ${actor.orgId}::uuid
      `;

      if (!adminTeamRows.some((row) => row.teamId === teamId)) {
        throw new ApiError("FORBIDDEN", "ADMIN can only rename assigned teams");
      }
    }

    const updatedRows = await prisma.$queryRaw<Array<{ id: string; name: string }>>`
      UPDATE teams
      SET name = ${parsed.data.name},
          "updatedAt" = now()
      WHERE id = ${teamId}::uuid
      RETURNING id, name
    `;

    return Response.json({ data: updatedRows[0] ?? null });
  } catch (error) {
    return handleApiError(error);
  }
}
