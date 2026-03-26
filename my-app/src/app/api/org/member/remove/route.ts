import { NextRequest } from "next/server";
import { z } from "zod";
import { ApiError, handleApiError } from "@/lib/errors";
import { prisma } from "@/lib/prisma";
import {
  assertManagerRole,
  getActorContext,
  getMembershipById,
  getOwnerCount,
} from "@/app/api/org/_utils";

const removeMemberSchema = z
  .object({
    memberId: z.string().uuid("memberId must be a valid UUID"),
  })
  .strict();

export async function DELETE(request: NextRequest) {
  try {
    const actorId = request.headers.get("x-user-id") ?? "";
    const actor = await getActorContext(actorId);
    assertManagerRole(actor.role);

    const body = await request.json();
    const parsed = removeMemberSchema.safeParse(body);
    if (!parsed.success) {
      throw new ApiError("BAD_REQUEST", "Invalid request body", parsed.error.issues);
    }

    const { memberId } = parsed.data;
  const target = await getMembershipById(actor.orgId, memberId);

    if (actor.role === "ADMIN" && target.role === "OWNER") {
      throw new ApiError("FORBIDDEN", "ADMIN cannot remove OWNER");
    }

    if (target.role === "OWNER") {
      const ownerCount = await getOwnerCount(actor.orgId);
      if (ownerCount <= 1) {
        throw new ApiError("FORBIDDEN", "Cannot remove the last OWNER");
      }
    }

    await prisma.$executeRaw`
      DELETE FROM memberships
      WHERE id = ${target.id}
    `;

    return Response.json({
      data: {
        memberId,
        removed: true,
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
