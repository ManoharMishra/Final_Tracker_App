import { NextRequest } from "next/server";
import { z } from "zod";
import { randomUUID } from "crypto";
import { ApiError, handleApiError } from "@/lib/errors";
import { prisma } from "@/lib/prisma";
import {
  assertManagerRole,
  getActorContext,
  getMembershipById,
  getOwnerCount,
} from "@/app/api/org/_utils";

const patchMemberRoleSchema = z
  .object({
    memberId: z.string().uuid("memberId must be a valid UUID"),
    role: z.enum(["OWNER", "ADMIN", "MEMBER"]),
  })
  .strict();

export async function PATCH(request: NextRequest) {
  try {
    const actorId = request.headers.get("x-user-id") ?? "";
    const actor = await getActorContext(actorId);
    assertManagerRole(actor.role);

    const body = await request.json();
    const parsed = patchMemberRoleSchema.safeParse(body);
    if (!parsed.success) {
      throw new ApiError("BAD_REQUEST", "Invalid request body", parsed.error.issues);
    }

    const { memberId, role } = parsed.data;
    const target = await getMembershipById(actor.orgId, memberId);

    if (target.role === role) {
      throw new ApiError("BAD_REQUEST", "Invalid role change");
    }

    if (actor.role === "ADMIN") {
      if (role === "OWNER") {
        throw new ApiError("FORBIDDEN", "ADMIN cannot assign OWNER role");
      }
      if (target.role === "OWNER") {
        throw new ApiError("FORBIDDEN", "ADMIN cannot modify OWNER role");
      }
    }

    if (target.role === "OWNER" && role !== "OWNER") {
      const ownerCount = await getOwnerCount(actor.orgId);
      if (ownerCount <= 1) {
        throw new ApiError("FORBIDDEN", "Cannot demote the last OWNER");
      }
    }

    await prisma.$executeRaw`
      UPDATE memberships
      SET role = ${role}, "joinedAt" = "joinedAt"
      WHERE id = ${target.id}
    `;

    if (role === "ADMIN") {
      const teamRows = await prisma.$queryRaw<Array<{ teamId: string }>>`
        SELECT "teamId"
        FROM team_members
        WHERE "userId" = ${target.userId}::uuid
        LIMIT 1
      `;

      if (!teamRows[0]) {
        const slug = `admin-team-${target.userId.slice(0, 8).toLowerCase()}`;
        const createdTeamRows = await prisma.$queryRaw<Array<{ id: string }>>`
          INSERT INTO teams (id, "orgId", name, slug, "createdBy", "createdAt", "updatedAt")
          VALUES (
            ${randomUUID()}::uuid,
            ${actor.orgId}::uuid,
            ${`Admin Team ${target.userId.slice(0, 8)}`},
            ${slug},
            ${target.userId}::uuid,
            now(),
            now()
          )
          ON CONFLICT ("orgId", slug)
          DO UPDATE SET "updatedAt" = now()
          RETURNING id
        `;

        const teamId = createdTeamRows[0]?.id;
        if (teamId) {
          await prisma.$executeRaw`
            INSERT INTO team_members (id, "teamId", "userId", "joinedAt")
            VALUES (
              ${randomUUID()},
              ${teamId}::uuid,
              ${target.userId}::uuid,
              now()
            )
            ON CONFLICT ("userId") DO NOTHING
          `;
        }
      }
    }

    return Response.json({
      data: {
        memberId,
        role,
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
