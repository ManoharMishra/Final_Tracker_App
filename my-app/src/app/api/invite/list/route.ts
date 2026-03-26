import { NextRequest } from "next/server";
import { ApiError, handleApiError } from "@/lib/errors";
import { prisma } from "@/lib/prisma";
import { getActorContext } from "@/app/api/org/_utils";

type InviteRow = {
  id: string;
  orgId: string;
  role: "OWNER" | "ADMIN" | "MEMBER";
  invitedBy: string;
  maxUses: number | null;
  usedCount: number;
  expiresAt: Date | null;
  isActive: boolean;
  createdAt: Date;
};

export async function GET(request: NextRequest) {
  try {
    const actorId = request.headers.get("x-user-id") ?? "";
    if (!actorId) {
      throw new ApiError("FORBIDDEN", "x-user-id header is required");
    }

    const actor = await getActorContext(actorId);

    const invites = await prisma.$queryRaw<InviteRow[]>`
      SELECT id, "orgId", role, "invitedBy", "maxUses", "usedCount",
             "expiresAt", "isActive", "createdAt"
      FROM invites
      WHERE "orgId" = ${actor.orgId}::uuid
        AND "isActive" = true
      ORDER BY "createdAt" DESC
    `;

    return Response.json({ data: invites });
  } catch (error) {
    return handleApiError(error);
  }
}
