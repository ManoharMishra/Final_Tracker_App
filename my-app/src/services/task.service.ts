import { ApiError } from "@/lib/errors";
import { prisma } from "@/lib/prisma";
import { validateThreadAccess } from "@/lib/validate";
import { createThreadEventTx } from "@/services/threadEvent.service";
import { createNotificationsFromEvent } from "@/services/notification.service";
import { structuredLog } from "@/lib/logging";
import type {
  CreateTaskInput,
  GetTasksInput,
  UpdateTaskStatusInput,
} from "@/lib/validations/task.validation";

const NOT_DELETED = { deleted_at: null } as const;

// ─── createTask ──────────────────────────────────────────────────────────────

export async function createTask(input: CreateTaskInput, actorId: string) {
  structuredLog("SERVICE", "INPUT", {
    service: "task.createTask",
    payload: { input, actorId },
  });

  const now = new Date();

  return prisma.$transaction(async (tx) => {
    // Resolve thread_id: either supplied directly or derived from source_message
    let resolvedThreadId = input.thread_id ?? null;

    if (input.source_message_id) {
      const sourceMessage = await tx.message.findFirst({
        where: {
          id: input.source_message_id,
          // If thread_id was also supplied, enforce consistency
          ...(resolvedThreadId ? { thread_id: resolvedThreadId } : {}),
          ...NOT_DELETED,
        },
        select: { id: true, thread_id: true },
      });

      if (!sourceMessage) {
        throw new ApiError(
          "NOT_FOUND",
          input.thread_id
            ? `Message ${input.source_message_id} not found in this thread`
            : `Message ${input.source_message_id} not found`
        );
      }

      resolvedThreadId = sourceMessage.thread_id;
    }

    if (!resolvedThreadId) {
      throw new ApiError(
        "VALIDATION_ERROR",
        "A valid thread could not be resolved from the provided inputs"
      );
    }

    await validateThreadAccess(tx, actorId, resolvedThreadId, { forUpdate: true });

    // SR-006: assigned_to must also be a participant
    if (input.assigned_to) {
      const assigneeParticipant = await tx.threadParticipant.findUnique({
        where: {
          thread_id_user_id: {
            thread_id: resolvedThreadId,
            user_id: input.assigned_to,
          },
        },
        select: { id: true },
      });

      if (!assigneeParticipant) {
        throw new ApiError(
          "VALIDATION_ERROR",
          `User ${input.assigned_to} is not a participant in this thread`
        );
      }
    }

    const task = await tx.task.create({
      data: {
        title: input.title,
        status: "open",
        thread_id: resolvedThreadId,
        source_message_id: input.source_message_id ?? null,
        assigned_to: input.assigned_to ?? null,
        created_by: actorId,
        created_at: now,
      },
    } as any);

    // SR-001: update thread.last_activity_at
    await tx.thread.update({
      where: { id: resolvedThreadId },
      data: { last_activity_at: now },
    });

    // SR-002: create thread_event
    await createThreadEventTx(tx, {
      threadId: resolvedThreadId,
      eventType: "task_created",
      actorId,
      payload: {
        entity_id: task.id,
        entity_type: "task",
        data: {
          task_id: task.id,
          assigned_to: input.assigned_to ?? null,
        },
      },
    });

    await createNotificationsFromEvent(
      {
        thread_id: resolvedThreadId,
        event_type: "task_created",
        actor_id: actorId,
        payload: {
          entity_id: task.id,
          entity_type: "task",
          notification_type: "task_assigned",
          data: {
            task_id: task.id,
            assigned_to: input.assigned_to ?? null,
          },
        },
        created_at: now,
      },
      input.assigned_to ? [input.assigned_to] : []
    );

    return task;
  });
}

// ─── getTasks ─────────────────────────────────────────────────────────────────

export async function getTasks(input: GetTasksInput, actorId: string) {
  structuredLog("SERVICE", "INPUT", {
    service: "task.getTasks",
    payload: { input, actorId },
  });

  const { thread_id, page, limit } = input;
  const skip = (page - 1) * limit;

  await prisma.$transaction(async (tx) => {
    await validateThreadAccess(tx, actorId, thread_id);
  });

  const where = { thread_id, ...NOT_DELETED };

  const [tasks, total] = await prisma.$transaction([
    prisma.task.findMany({
      where,
      orderBy: { created_at: "desc" },
      skip,
      take: limit,
      select: {
        id: true,
        title: true,
        status: true,
        thread_id: true,
        source_message_id: true,
        assigned_to: true,
        created_by: true,
        created_at: true,
        updated_at: true,
      },
    } as any),
    prisma.task.count({ where }),
  ]);

  const userIds = Array.from(
    new Set([
      ...tasks.map((t) => t.created_by),
      ...tasks.filter((t) => t.assigned_to).map((t) => t.assigned_to as string),
    ])
  );

  const users = userIds.length
    ? await prisma.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, name: true, email: true, avatar_url: true },
      })
    : [];

  const userById = new Map(users.map((u) => [u.id, u]));

  return {
    data: tasks.map((t) => ({
      ...t,
      creator: userById.get(t.created_by) ?? null,
      assignee: t.assigned_to ? (userById.get(t.assigned_to) ?? null) : null,
    })),
    pagination: {
      page,
      limit,
      total,
      total_pages: Math.ceil(total / limit),
    },
  };
}

// ─── updateTaskStatus ───────────────────────────────────────────────────────

export async function updateTaskStatus(
  task_id: UpdateTaskStatusInput["task_id"],
  status: UpdateTaskStatusInput["status"],
  actorId: string
) {
  structuredLog("SERVICE", "INPUT", {
    service: "task.updateTaskStatus",
    payload: { task_id, status, actorId },
  });

  const now = new Date();

  return prisma.$transaction(async (tx) => {
    const existingTask = (await tx.task.findFirst({
      where: {
        id: task_id,
        ...NOT_DELETED,
      },
      select: {
        id: true,
        status: true,
        thread_id: true,
      },
    } as any)) as {
      id: string;
      thread_id: string | null;
      status: "open" | "in_progress" | "done";
    } | null;

    if (!existingTask) {
      throw new ApiError("NOT_FOUND", `Task ${task_id} not found`);
    }

    if (!existingTask.thread_id) {
      throw new ApiError(
        "VALIDATION_ERROR",
        "Cannot update status for a task without thread linkage"
      );
    }

    const lockedParticipant = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT id
      FROM thread_participants
      WHERE thread_id = ${existingTask.thread_id}::uuid
        AND user_id = ${actorId}::uuid
      FOR UPDATE
    `;

    if (lockedParticipant.length === 0) {
      throw new ApiError(
        "FORBIDDEN",
        "Only participants can update task status in this thread"
      );
    }

    if (existingTask.status === status) {
      return tx.task.findUnique({ where: { id: existingTask.id } });
    }

    const updatedTask = await tx.task.update({
      where: { id: existingTask.id },
      data: { status },
    } as any);

    await tx.thread.update({
      where: { id: existingTask.thread_id },
      data: { last_activity_at: now },
    });

    await createThreadEventTx(tx, {
      threadId: existingTask.thread_id,
      eventType: "task_status_changed",
      actorId,
      payload: {
        entity_id: existingTask.id,
        entity_type: "task",
        data: {
          task_id: existingTask.id,
          from_status: existingTask.status,
          to_status: status,
        },
      },
    });

    return updatedTask;
  });
}
