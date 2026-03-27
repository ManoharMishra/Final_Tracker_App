import { NextRequest } from "next/server";
import { z } from "zod";
import { ApiError, handleApiError } from "@/lib/errors";
import { prisma } from "@/lib/prisma";
import { createInvite } from "@/lib/services/invite.service";
import { getActorContext } from "@/app/api/org/_utils";

const createInviteSchema = z
  .object({
    role: z.enum(["OWNER", "ADMIN", "MEMBER"]).default("MEMBER"),
    teamId: z.string().uuid("teamId must be a valid UUID").optional().nullable(),
    maxUses: z.number().int().positive().optional().nullable(),
    expiresAt: z
      .string()
      .datetime({ message: "expiresAt must be a valid ISO datetime" })
      .optional()
      .nullable(),
  })
  .strict();

export async function POST(request: NextRequest) {
  try {
    const actorId = request.headers.get("x-user-id") ?? "";
    if (!actorId) {
      throw new ApiError("FORBIDDEN", "x-user-id header is required");
    }

    const body = await request.json();
    const parsed = createInviteSchema.safeParse(body);
    if (!parsed.success) {
      throw new ApiError("BAD_REQUEST", "Invalid request body", parsed.error.issues);
    }

    const actor = await getActorContext(actorId);

    const actorTeamRows = await prisma.$queryRaw<Array<{ teamId: string }>>`
      SELECT tm."teamId"
      FROM team_members tm
      INNER JOIN teams t ON t.id = tm."teamId"
      WHERE tm."userId" = ${actorId}::uuid
        AND t."orgId" = ${actor.orgId}::uuid
    `;

    const actorTeamIds = new Set(actorTeamRows.map((row) => row.teamId));

    const adminCreatedTeamRows = actor.role === "ADMIN"
      ? await prisma.$queryRaw<Array<{ id: string }>>`
          SELECT t.id
          FROM teams t
          WHERE t."orgId" = ${actor.orgId}::uuid
            AND t."createdBy" = ${actorId}::uuid
        `
      : [];

    const manageableTeamIds = actor.role === "ADMIN"
      ? new Set([...actorTeamIds, ...adminCreatedTeamRows.map((row) => row.id)])
      : actorTeamIds;

    const requestedTeamId = parsed.data.teamId ?? null;

    if (parsed.data.role === "ADMIN" && !requestedTeamId) {
      throw new ApiError("BAD_REQUEST", "teamId is required when inviting ADMIN");
    }

    if (actor.role === "ADMIN" && parsed.data.role === "OWNER") {
      throw new ApiError("FORBIDDEN", "ADMIN cannot create OWNER invites");
    }

    if (actor.role === "MEMBER" && parsed.data.role !== "MEMBER") {
      throw new ApiError("FORBIDDEN", "MEMBER can only create MEMBER invites");
    }

    if (actor.role === "ADMIN" || actor.role === "MEMBER") {
      if (manageableTeamIds.size === 0) {
        throw new ApiError("FORBIDDEN", `${actor.role} has no manageable teams for invite creation`);
      }

      if (!requestedTeamId) {
        throw new ApiError("BAD_REQUEST", "teamId is required for ADMIN and MEMBER invites");
      }

      if (!manageableTeamIds.has(requestedTeamId)) {
        throw new ApiError("FORBIDDEN", `${actor.role} can only create invites for manageable teams`);
      }
    }

    if (requestedTeamId) {
      const teamRows = await prisma.$queryRaw<Array<{ id: string }>>`
        SELECT id
        FROM teams
        WHERE id = ${requestedTeamId}::uuid
          AND "orgId" = ${actor.orgId}::uuid
        LIMIT 1
      `;

      if (!teamRows[0]) {
        throw new ApiError("NOT_FOUND", "Team not found in this organization");
      }
    }

    const invite = await createInvite(
      actor.orgId,
      parsed.data.role,
      actorId,
      requestedTeamId,
      parsed.data.maxUses,
      parsed.data.expiresAt ? new Date(parsed.data.expiresAt) : null
    );

    const inviteLink = `${request.nextUrl.origin}/invite/${encodeURIComponent(invite.token)}`;

    return Response.json({
      data: {
        token: invite.token,
        invite_link: inviteLink,
        invite: invite.invite,
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
