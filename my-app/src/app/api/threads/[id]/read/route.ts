// app/api/threads/[id]/read/route.ts

import { NextRequest } from "next/server";
import { handleApiError, ApiError } from "@/lib/errors";
import {
  threadIdParamSchema,
} from "@/lib/validations/participant.validation";
import { updateLastRead } from "@/services/participant.service";

type RouteContext = { params: Promise<{ id: string }> };

// ─── PATCH /api/threads/:threadId/read ──────────────────────────────────────

export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const actorId = request.headers.get("x-user-id") ?? "";

    if (!actorId) {
      throw new ApiError("FORBIDDEN", "x-user-id header is required");
    }

    const paramParsed = threadIdParamSchema.safeParse({ threadId: id });
    if (!paramParsed.success) {
      throw new ApiError(
        "VALIDATION_ERROR",
        "Invalid thread ID",
        paramParsed.error.issues
      );
    }

    const result = await updateLastRead(paramParsed.data.threadId, actorId);

    return Response.json({ data: result });
  } catch (error) {
    return handleApiError(error);
  }
}
