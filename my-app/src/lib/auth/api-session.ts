import { NextRequest } from "next/server";
import { ApiError } from "@/lib/errors";
import { prisma } from "@/lib/prisma";
import { getSessionFromRequest } from "@/lib/auth/session";

export type ApiSession = {
  userId: string;
  orgId: string;
  expiresAt: string;
};

export async function requireApiSession(request: NextRequest): Promise<ApiSession> {
  const session = await getSessionFromRequest(request);

  if (!session) {
    throw new ApiError("UNAUTHORIZED", "No active session");
  }

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { id: true, org_id: true },
  });

  if (!user) {
    throw new ApiError("UNAUTHORIZED", "Session user not found");
  }

  if (user.org_id !== session.orgId) {
    throw new ApiError("FORBIDDEN", "Organization mismatch");
  }

  return session;
}

export function assertSessionOrg(session: ApiSession, requestedOrgId?: string | null) {
  if (requestedOrgId && requestedOrgId !== session.orgId) {
    throw new ApiError("FORBIDDEN", "Organization mismatch");
  }
}