import { NextRequest } from "next/server";
import { ApiError, handleApiError } from "@/lib/errors";
import { prisma } from "@/lib/prisma";
import { threadIdParamSchema } from "@/lib/validations/thread.validation";
import { validateThreadAccess } from "@/lib/validate";
import { awardUserPointsTx } from "@/services/points.service";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const actorId = request.headers.get("x-user-id") ?? "";
    if (!actorId) {
      throw new ApiError("FORBIDDEN", "x-user-id header is required");
    }

    const { id } = await context.params;
    const parsed = threadIdParamSchema.safeParse({ threadId: id });
    if (!parsed.success) {
      throw new ApiError("VALIDATION_ERROR", "Invalid thread ID", parsed.error.issues);
    }

    const result = await prisma.$transaction(async (tx) => {
      await validateThreadAccess(tx, actorId, parsed.data.threadId, { forUpdate: true });

      const threadRows = await tx.$queryRaw<Array<{
        id: string;
        title: string;
        content: string | null;
        input_type: "IDEA" | "TASK_SOURCE" | "UPDATE" | "BLOCKER" | null;
        created_by: string;
        taskId: string | null;
        deleted_at: Date | null;
      }>>`
        SELECT id, title, content, input_type, "created_by", "taskId", deleted_at
        FROM threads
        WHERE id = ${parsed.data.threadId}::uuid
        LIMIT 1
      `;

      const thread = threadRows[0];
      if (!thread || thread.deleted_at) {
        throw new ApiError("NOT_FOUND", "Thread not found");
      }

      if (thread.taskId) {
        throw new ApiError("CONFLICT", "Thread already converted to task");
      }

      if (thread.input_type !== "IDEA" && thread.input_type !== "TASK_SOURCE") {
        throw new ApiError("BAD_REQUEST", "Only IDEA or TASK_SOURCE threads can be converted");
      }

      const taskTitleRaw = (thread.content ?? thread.title ?? "").trim();
      const taskTitle = taskTitleRaw.length > 0 ? taskTitleRaw.slice(0, 200) : "Converted task";

      // Per requirement: createdBy = authorId (created_by)
      const task = await tx.task.create({
        data: {
          title: taskTitle,
          status: "open",
          created_by: thread.created_by,
          thread_id: thread.id,
        },
        select: {
          id: true,
          title: true,
          created_by: true,
          thread_id: true,
          status: true,
          created_at: true,
        },
      } as any);

      const updatedRows = await tx.$queryRaw<Array<{
        id: string;
        taskId: string | null;
        updated_at: Date;
      }>>`
        UPDATE threads
        SET "taskId" = ${task.id}::uuid,
            last_activity_at = now(),
            updated_at = now()
        WHERE id = ${thread.id}::uuid
        RETURNING id, "taskId", updated_at
      `;

      const updatedThread = updatedRows[0];

      const points = await awardUserPointsTx(
        tx,
        actorId,
        thread.input_type === "IDEA" ? 15 : 0
      );

      return { task, thread: updatedThread, points };
    });

    return Response.json({ data: result }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
