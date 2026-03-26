import { NextRequest } from "next/server";
import { ApiError, handleApiError } from "@/lib/errors";
import { validateInvite } from "@/lib/services/invite.service";

type RouteContext = { params: Promise<{ token: string }> };

export async function GET(_request: NextRequest, context: RouteContext) {
  try {
    const { token } = await context.params;
    if (!token) {
      throw new ApiError("BAD_REQUEST", "Invite token is required");
    }

    const invite = await validateInvite(token);

    return Response.json({ data: invite });
  } catch (error) {
    return handleApiError(error);
  }
}
