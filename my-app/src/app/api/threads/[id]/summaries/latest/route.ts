import { NextRequest } from "next/server";
import { z } from "zod";
import { ApiError, handleApiError } from "@/lib/errors";
import { threadIdParamSchema } from "@/lib/validations/thread.validation";
import { getLatestSummary } from "@/services/summary.service";

type RouteContext = { params: Promise<{ id: string }> };

const actorIdSchema = z.string().uuid("x-user-id must be a valid UUID");

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const actorId = request.headers.get("x-user-id") ?? "";
    const parsedActorId = actorIdSchema.safeParse(actorId);

    if (!parsedActorId.success) {
      throw new ApiError("FORBIDDEN", "x-user-id header is required");
    }

    const { id } = await context.params;
    const parsedThread = threadIdParamSchema.safeParse({ threadId: id });

    if (!parsedThread.success) {
      throw new ApiError(
        "VALIDATION_ERROR",
        "Invalid thread ID",
        parsedThread.error.issues
      );
    }

    const summary = await getLatestSummary(
      parsedThread.data.threadId,
      parsedActorId.data
    );

    return Response.json({ data: summary });
  } catch (error) {
    return handleApiError(error);
  }
}