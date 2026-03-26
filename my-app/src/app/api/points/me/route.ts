import { NextRequest } from "next/server";
import { ApiError, handleApiError } from "@/lib/errors";
import { requireApiSession } from "@/lib/auth/api-session";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  try {
    const session = await requireApiSession(request);
    const actorId = session.userId;

    const user = await prisma.user.findUnique({
      where: { id: actorId },
      select: { id: true },
    });

    if (!user) {
      throw new ApiError("NOT_FOUND", "User not found");
    }

    const rows = await prisma.$queryRaw<Array<{
      userId: string;
      points: number;
      streak: number;
      lastActiveDate: Date | null;
    }>>`
      SELECT "userId", points, streak, "lastActiveDate"
      FROM user_points
      WHERE "userId" = ${actorId}::uuid
      LIMIT 1
    `;

    const points = rows[0] ?? {
      userId: actorId,
      points: 0,
      streak: 0,
      lastActiveDate: null,
    };

    return Response.json({ data: points });
  } catch (error) {
    return handleApiError(error);
  }
}
