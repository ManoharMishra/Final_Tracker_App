// app/api/threads/[id]/participants/[userId]/route.ts

import { NextRequest } from "next/server";
import { handleApiError, ApiError } from "@/lib/errors";
import {
  participantParamsSchema,
} from "@/lib/validations/participant.validation";
import { removeParticipant } from "@/services/participant.service";

type RouteContext = { params: Promise<{ id: string; userId: string }> };

// ─── DELETE /api/threads/:threadId/participants/:userId ─────────────────────

export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const { id, userId } = await context.params;
    const actorId = request.headers.get("x-user-id") ?? "";

    if (!actorId) {
      throw new ApiError("FORBIDDEN", "x-user-id header is required");
    }

    const paramParsed = participantParamsSchema.safeParse({
      threadId: id,
      userId,
    });
    if (!paramParsed.success) {
      throw new ApiError(
        "VALIDATION_ERROR",
        "Invalid path parameters",
        paramParsed.error.issues
      );
    }

    await removeParticipant(
      paramParsed.data.threadId,
      paramParsed.data.userId,
      actorId
    );

    return new Response(null, { status: 204 });
  } catch (error) {
    return handleApiError(error);
  }
}
