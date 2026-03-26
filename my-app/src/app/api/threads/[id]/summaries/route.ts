import { NextRequest } from "next/server";
import { z } from "zod";
import { ApiError, handleApiError } from "@/lib/errors";
import { threadIdParamSchema } from "@/lib/validations/thread.validation";
import { createSummary } from "@/services/summary.service";

type RouteContext = { params: Promise<{ id: string }> };

const actorIdSchema = z.string().uuid("x-user-id must be a valid UUID");
const createSummarySchema = z.object({
  content: z.string().trim().min(1, "content is required"),
});

export async function POST(request: NextRequest, context: RouteContext) {
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

    const body = await request.json();
    const parsedBody = createSummarySchema.safeParse(body);

    if (!parsedBody.success) {
      throw new ApiError(
        "VALIDATION_ERROR",
        "Invalid request body",
        parsedBody.error.issues
      );
    }

    const summary = await createSummary(
      parsedThread.data.threadId,
      parsedBody.data.content,
      parsedActorId.data
    );

    return Response.json({ data: summary }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}