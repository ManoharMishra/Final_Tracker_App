import { NextRequest } from "next/server";
import { handleApiError } from "@/lib/errors";
import { getSessionFromRequest } from "@/lib/auth/session";

export async function GET(request: NextRequest) {
  try {
    const session = await getSessionFromRequest(request);

    return Response.json({
      data: session
        ? {
            user_id: session.userId,
            org_id: session.orgId,
            expires_at: session.expiresAt,
          }
        : null,
    });
  } catch (error) {
    return handleApiError(error);
  }
}