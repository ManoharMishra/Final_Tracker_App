import { ApiError } from "@/lib/errors";
import { prisma } from "@/lib/prisma";

type ActivityEventType =
  | "message_created"
  | "task_created"
  | "task_status_changed"
  | "decision_added"
  | "participant_added"
  | "attachment_added";

function activityTitle(eventType: string) {
  const titleMap: Record<ActivityEventType, string> = {
    message_created: "New message posted",
    task_created: "Task created",
    task_status_changed: "Task status updated",
    decision_added: "Decision added",
    participant_added: "User added",
    attachment_added: "File attached",
  };

  return titleMap[eventType as ActivityEventType] ?? "Thread activity";
}

function payloadField(payload: unknown, field: "entity_type" | "entity_id") {
  if (typeof payload !== "object" || payload === null) {
    return null;
  }

  const value = (payload as Record<string, unknown>)[field];
  return typeof value === "string" ? value : null;
}

export async function getThreadActivity(
  thread_id: string,
  userId: string,
  page = 1,
  limit = 20
) {
  if (!thread_id) {
    throw new ApiError("VALIDATION_ERROR", "thread_id is required");
  }

  if (!userId) {
    throw new ApiError("FORBIDDEN", "userId is required");
  }

  if (!Number.isInteger(page) || page < 1) {
    throw new ApiError("VALIDATION_ERROR", "page must be an integer >= 1");
  }

  if (!Number.isInteger(limit) || limit < 1) {
    throw new ApiError("VALIDATION_ERROR", "limit must be an integer >= 1");
  }

  const take = Math.min(limit, 50);
  const skip = (page - 1) * take;

  const participant = await prisma.threadParticipant.findUnique({
    where: {
      thread_id_user_id: {
        thread_id,
        user_id: userId,
      },
    },
    select: { id: true },
  });

  if (!participant) {
    throw new ApiError("FORBIDDEN", "You must be a participant in this thread");
  }

  const where = { thread_id };

  const [events, total] = await prisma.$transaction([
    prisma.threadEvent.findMany({
      where,
      orderBy: { created_at: "desc" },
      skip,
      take,
      select: {
        id: true,
        actor_id: true,
        event_type: true,
        payload: true,
        created_at: true,
      },
    }),
    prisma.threadEvent.count({ where }),
  ]);

  return {
    data: events.map((event) => ({
      id: event.id,
      actor_id: event.actor_id,
      event_type: event.event_type,
      entity_type: payloadField(event.payload, "entity_type") ?? "thread",
      entity_id: payloadField(event.payload, "entity_id") ?? thread_id,
      title: activityTitle(event.event_type),
      created_at: event.created_at,
    })),
    pagination: {
      page,
      limit: take,
      total,
      total_pages: Math.ceil(total / take),
    },
  };
}