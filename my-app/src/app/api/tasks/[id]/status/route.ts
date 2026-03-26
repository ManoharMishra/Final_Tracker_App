import { NextRequest } from "next/server";
import { ApiError, handleApiError } from "@/lib/errors";
import { requireApiSession } from "@/lib/auth/api-session";
import { updateTaskStatusSchema } from "@/lib/validations/task.validation";
import { updateTaskStatus } from "@/services/task.service";

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const session = await requireApiSession(request);

    const { id } = await context.params;
    const body = await request.json();

    const parsed = updateTaskStatusSchema.safeParse({
      task_id: id,
      status: body?.status,
    });

    if (!parsed.success) {
      throw new ApiError(
        "VALIDATION_ERROR",
        "Invalid request body",
        parsed.error.issues
      );
    }

    const updated = await updateTaskStatus(
      parsed.data.task_id,
      parsed.data.status,
      session.userId
    );

    return Response.json({ data: updated });
  } catch (error) {
    return handleApiError(error);
  }
}
