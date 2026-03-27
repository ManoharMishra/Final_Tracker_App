import { randomUUID } from "crypto";
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
      const manageableRows = await prisma.$queryRaw<Array<{ id: string }>>`
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
          AND t.id = ${teamId}::uuid
        LIMIT 1
      `;

      if (!manageableRows[0]) {
        throw new ApiError("FORBIDDEN", "ADMIN can only rename manageable teams");
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

export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const actorId = request.headers.get("x-user-id") ?? "";
    const actor = await getActorContext(actorId);
    assertManagerRole(actor.role);

    const { teamId } = await context.params;
    if (!teamId) {
      throw new ApiError("BAD_REQUEST", "teamId is required");
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
      const manageableRows = await prisma.$queryRaw<Array<{ id: string }>>`
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
          AND t.id = ${teamId}::uuid
        LIMIT 1
      `;

      if (!manageableRows[0]) {
        throw new ApiError("FORBIDDEN", "ADMIN can only delete manageable teams");
      }
    }

    const teamMemberRows = await prisma.$queryRaw<Array<{ userId: string }>>`
      SELECT tm."userId"
      FROM team_members tm
      WHERE tm."teamId" = ${teamId}::uuid
    `;

    if (actor.role !== "OWNER" && teamMemberRows.length > 0) {
      throw new ApiError("BAD_REQUEST", "Cannot delete team with members. Remove all members first.");
    }

    const conversion = await prisma.$transaction(async (tx) => {
      const threadRows = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT id
        FROM threads
        WHERE team_id = ${teamId}::uuid
          AND deleted_at IS NULL
      `;

      const threadIds = threadRows.map((row) => row.id);
      const memberIds = Array.from(new Set(teamMemberRows.map((row) => row.userId)));

      // Safety net for future policy changes: if team had members, preserve access by adding them as participants.
      if (threadIds.length > 0 && memberIds.length > 0) {
        for (const threadId of threadIds) {
          for (const userId of memberIds) {
            await tx.$executeRaw`
              INSERT INTO thread_participants (id, thread_id, user_id, role, created_at, updated_at)
              VALUES (
                ${randomUUID()}::uuid,
                ${threadId}::uuid,
                ${userId}::uuid,
                'member'::"ParticipantRole",
                now(),
                now()
              )
              ON CONFLICT (thread_id, user_id) DO NOTHING
            `;
          }
        }
      }

      await tx.$executeRaw`
        DELETE FROM team_members
        WHERE "teamId" = ${teamId}::uuid
      `;

      let convertedThreadCount = 0;
      if (threadIds.length > 0) {
        const updatedRows = await tx.$queryRaw<Array<{ id: string }>>`
          UPDATE threads
          SET
            team_id = NULL,
            type = 'private'::"ThreadType",
            visibility = 'PRIVATE'::"ThreadVisibility",
            status = 'dormant'::"ThreadStatus",
            updated_at = now()
          WHERE id = ANY(${threadIds}::uuid[])
          RETURNING id
        `;
        convertedThreadCount = updatedRows.length;
      }

      await tx.$executeRaw`
        DELETE FROM teams
        WHERE id = ${teamId}::uuid
      `;

      return { convertedThreadCount };
    });

    return Response.json({
      data: {
        id: teamId,
        deleted: true,
        convertedThreadCount: conversion.convertedThreadCount,
        convertedToScope: "participant",
        forceDeletedByOwner: actor.role === "OWNER" && teamMemberRows.length > 0,
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
