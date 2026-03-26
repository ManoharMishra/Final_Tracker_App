import { NextRequest } from "next/server";
import { z } from "zod";
import { ApiError, handleApiError } from "@/lib/errors";
import { threadIdParamSchema } from "@/lib/validations/thread.validation";
import { getThreadActivity } from "@/services/activity.service";

type RouteContext = { params: Promise<{ id: string }> };

const actorIdSchema = z.string().uuid("x-user-id must be a valid UUID");
const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).default(20),
});

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const actorId = request.headers.get("x-user-id") ?? "";
    const parsedActorId = actorIdSchema.safeParse(actorId);

    if (!parsedActorId.success) {
      throw new ApiError("FORBIDDEN", "x-user-id header is required");
    }

    const { id } = await context.params;
    const parsedThreadId = threadIdParamSchema.safeParse({ threadId: id });

    if (!parsedThreadId.success) {
      throw new ApiError(
        "VALIDATION_ERROR",
        "Invalid thread ID",
        parsedThreadId.error.issues
      );
    }

    const { searchParams } = new URL(request.url);
    const parsedPagination = paginationSchema.safeParse({
      page: searchParams.get("page") ?? "1",
      limit: searchParams.get("limit") ?? "20",
    });

    if (!parsedPagination.success) {
      throw new ApiError(
        "VALIDATION_ERROR",
        "Invalid query parameters",
        parsedPagination.error.issues
      );
    }

    const result = await getThreadActivity(
      parsedThreadId.data.threadId,
      parsedActorId.data,
      parsedPagination.data.page,
      parsedPagination.data.limit
    );

    return Response.json(result);
  } catch (error) {
    return handleApiError(error);
  }
}