import { NextRequest } from "next/server";
import { handleApiError } from "@/lib/errors";
import { prisma } from "@/lib/prisma";
import { requireApiSession } from "@/lib/auth/api-session";
import { getActorContext } from "@/app/api/org/_utils";

type MemberRow = {
  id: string;
  userId: string;
  role: "OWNER" | "ADMIN" | "MEMBER";
  joinedAt: Date;
  name: string;
  email: string;
};

export async function GET(request: NextRequest) {
  try {
    const session = await requireApiSession(request);
    const actor = await getActorContext(session.userId);

    const members = await prisma.$queryRaw<MemberRow[]>`
      SELECT
        m.id,
        m."userId",
        m.role,
        m."joinedAt",
        u.name,
        u.email
      FROM memberships m
      INNER JOIN users u ON u.id = m."userId"
      WHERE m."orgId" = ${actor.orgId}::uuid
      ORDER BY
        CASE m.role
          WHEN 'OWNER' THEN 1
          WHEN 'ADMIN' THEN 2
          ELSE 3
        END,
        m."joinedAt" ASC
    `;

    return Response.json({ data: members });
  } catch (error) {
    return handleApiError(error);
  }
}
