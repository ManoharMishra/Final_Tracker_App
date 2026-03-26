import { randomUUID } from "crypto";
import { NextRequest } from "next/server";
import { z } from "zod";
import { ApiError, handleApiError } from "@/lib/errors";
import { prisma } from "@/lib/prisma";
import { assertManagerRole, getActorContext } from "@/app/api/org/_utils";

const moveMemberSchema = z
  .object({
    userId: z.string().uuid("userId must be a valid UUID"),
    teamIds: z.array(z.string().uuid("teamIds must contain valid UUID values")).min(1),
  })
  .strict();

export async function PATCH(request: NextRequest) {
  try {
    const actorId = request.headers.get("x-user-id") ?? "";
    const actor = await getActorContext(actorId);
    assertManagerRole(actor.role);

    const body = await request.json();
    const parsed = moveMemberSchema.safeParse(body);
    if (!parsed.success) {
      throw new ApiError("BAD_REQUEST", "Invalid request body", parsed.error.issues);
    }

    const { userId, teamIds } = parsed.data;
    const uniqueTeamIds = Array.from(new Set(teamIds));

    const adminTeamRows = actor.role === "ADMIN"
      ? await prisma.$queryRaw<Array<{ teamId: string }>>`
          SELECT tm."teamId"
          FROM team_members tm
          INNER JOIN teams t ON t.id = tm."teamId"
          WHERE tm."userId" = ${actorId}::uuid
            AND t."orgId" = ${actor.orgId}::uuid
        `
      : [];

    const adminTeamIds = new Set(adminTeamRows.map((row) => row.teamId));

    const memberRows = await prisma.$queryRaw<Array<{ role: "OWNER" | "ADMIN" | "MEMBER" }>>`
      SELECT role
      FROM memberships
      WHERE "orgId" = ${actor.orgId}::uuid
        AND "userId" = ${userId}::uuid
      LIMIT 1
    `;

    const member = memberRows[0];
    if (!member) {
      throw new ApiError("NOT_FOUND", "Member not found in this organization");
    }

    if (actor.role === "ADMIN") {
      if (member.role === "OWNER") {
        throw new ApiError("FORBIDDEN", "ADMIN cannot modify OWNER team assignments");
      }

      const targetVisibleRows = await prisma.$queryRaw<Array<{ teamId: string }>>`
        SELECT tm."teamId"
        FROM team_members tm
        INNER JOIN teams t ON t.id = tm."teamId"
        WHERE tm."userId" = ${userId}::uuid
          AND t."orgId" = ${actor.orgId}::uuid
          AND tm."teamId" = ANY(${Array.from(adminTeamIds)}::uuid[])
        LIMIT 1
      `;

      if (!targetVisibleRows[0]) {
        throw new ApiError("FORBIDDEN", "ADMIN can only manage members in assigned teams");
      }

      const requestedOutsideScope = uniqueTeamIds.some((teamId) => !adminTeamIds.has(teamId));
      if (requestedOutsideScope) {
        throw new ApiError("FORBIDDEN", "ADMIN can only assign members to their own teams");
      }
    }

    const teamRows = await prisma.$queryRaw<Array<{ id: string }>>`
      SELECT id
      FROM teams
      WHERE id = ANY(${uniqueTeamIds}::uuid[])
        AND "orgId" = ${actor.orgId}::uuid
    `;

    if (teamRows.length !== uniqueTeamIds.length) {
      throw new ApiError("NOT_FOUND", "One or more teams were not found in this organization");
    }

    await prisma.$transaction(async (tx) => {
      const finalTeamIds =
        actor.role === "ADMIN"
          ? Array.from(adminTeamIds).filter((teamId) => uniqueTeamIds.includes(teamId))
          : uniqueTeamIds;

      if (actor.role === "ADMIN") {
        await tx.$executeRaw`
          DELETE FROM team_members
          WHERE "userId" = ${userId}::uuid
            AND "teamId" = ANY(${Array.from(adminTeamIds)}::uuid[])
        `;
      } else {
        await tx.$executeRaw`
          DELETE FROM team_members
          WHERE "userId" = ${userId}::uuid
        `;
      }

      for (const teamId of finalTeamIds) {
        await tx.$executeRaw`
          INSERT INTO team_members (id, "teamId", "userId", "joinedAt")
          VALUES (
            ${randomUUID()},
            ${teamId}::uuid,
            ${userId}::uuid,
            now()
          )
          ON CONFLICT ("teamId", "userId") DO NOTHING
        `;
      }
    });

    return Response.json({
      data: {
        userId,
        teamIds: uniqueTeamIds,
        role: member.role,
        moved: true,
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
