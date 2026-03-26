// app/api/threads/[id]/participants/route.ts

import { NextRequest } from "next/server";
import { handleApiError, ApiError } from "@/lib/errors";
import {
  threadIdParamSchema,
  addParticipantSchema,
  getParticipantsQuerySchema,
} from "@/lib/validations/participant.validation";
import {
  addParticipant,
  getParticipants,
} from "@/services/participant.service";

type RouteContext = { params: Promise<{ id: string }> };

// ─── POST /api/threads/:threadId/participants ───────────────────────────────

export async function POST(request: NextRequest, context: RouteContext) {
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

    const body = await request.json();
    const parsed = addParticipantSchema.safeParse(body);
    if (!parsed.success) {
      throw new ApiError(
        "VALIDATION_ERROR",
        "Invalid request body",
        parsed.error.issues
      );
    }

    const participant = await addParticipant(paramParsed.data.threadId, {
      ...parsed.data,
      added_by: actorId,
    });

    return Response.json({ data: participant }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}

// ─── GET /api/threads/:threadId/participants ────────────────────────────────

export async function GET(request: NextRequest, context: RouteContext) {
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

    const { searchParams } = new URL(request.url);
    const queryParsed = getParticipantsQuerySchema.safeParse({
      user_id: searchParams.get("user_id") ?? undefined,
    });
    if (!queryParsed.success) {
      throw new ApiError(
        "VALIDATION_ERROR",
        "Invalid query parameters",
        queryParsed.error.issues
      );
    }

    const participants = await getParticipants(paramParsed.data.threadId, actorId);

    return Response.json({ data: participants });
  } catch (error) {
    return handleApiError(error);
  }
}
