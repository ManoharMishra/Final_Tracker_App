import { ApiError } from "@/lib/errors";
import { prisma } from "@/lib/prisma";
import { validateThreadAccess } from "@/lib/validate";
import { createThreadEventTx } from "@/services/threadEvent.service";
import { createNotificationsFromEvent } from "@/services/notification.service";
import { structuredLog } from "@/lib/logging";
import type {
  CreateDecisionInput,
  GetDecisionsInput,
} from "@/lib/validations/decision.validation";

const NOT_DELETED = { deleted_at: null } as const;

export async function createDecision(
  input: CreateDecisionInput,
  actorId: string
) {
  structuredLog("SERVICE", "INPUT", {
    service: "decision.createDecision",
    payload: { input, actorId },
  });

  const now = new Date();

  return prisma.$transaction(async (tx) => {
    await validateThreadAccess(tx, actorId, input.thread_id, { forUpdate: true });

    // Validate source_message_id belongs to the same thread
    if (input.source_message_id) {
      const sourceMessage = await tx.message.findFirst({
        where: {
          id: input.source_message_id,
          thread_id: input.thread_id,
          ...NOT_DELETED,
        },
        select: { id: true },
      });

      if (!sourceMessage) {
        throw new ApiError(
          "NOT_FOUND",
          `Message ${input.source_message_id} not found in this thread`
        );
      }
    }

    const decision = await tx.decision.create({
      data: {
        thread_id: input.thread_id,
        content: input.content,
        source_message_id: input.source_message_id ?? null,
        is_ai_generated: input.is_ai_generated,
        created_by: actorId,
        created_at: now,
      },
    });

    // SR-002: create thread_event
    await createThreadEventTx(tx, {
      threadId: input.thread_id,
      eventType: "decision_added",
      actorId,
      payload: {
        entity_id: decision.id,
        entity_type: "decision",
        data: { decision_id: decision.id },
      },
    });

    const participants = await tx.threadParticipant.findMany({
      where: { thread_id: input.thread_id },
      select: { user_id: true },
    });

    await createNotificationsFromEvent(
      {
        thread_id: input.thread_id,
        event_type: "decision_added",
        actor_id: actorId,
        payload: {
          entity_id: decision.id,
          entity_type: "thread",
          notification_type: "decision_added",
          data: { decision_id: decision.id },
        },
        created_at: now,
      },
      participants.map((participant) => participant.user_id)
    );

    return decision;
  });
}

export async function getDecisions(
  input: GetDecisionsInput,
  actorId: string
) {
  structuredLog("SERVICE", "INPUT", {
    service: "decision.getDecisions",
    payload: { input, actorId },
  });

  const { thread_id, page, limit } = input;
  const skip = (page - 1) * limit;

  await prisma.$transaction(async (tx) => {
    await validateThreadAccess(tx, actorId, thread_id);
  });

  const where = { thread_id, ...NOT_DELETED };

  const [decisions, total] = await prisma.$transaction([
    prisma.decision.findMany({
      where,
      orderBy: { created_at: "desc" },
      skip,
      take: limit,
      select: {
        id: true,
        thread_id: true,
        content: true,
        source_message_id: true,
        is_ai_generated: true,
        created_by: true,
        created_at: true,
        updated_at: true,
      },
    }),
    prisma.decision.count({ where }),
  ]);

  const creatorIds = Array.from(
    new Set(decisions.map((d) => d.created_by))
  );

  const creators = creatorIds.length
    ? await prisma.user.findMany({
        where: { id: { in: creatorIds } },
        select: { id: true, name: true, email: true, avatar_url: true },
      })
    : [];

  const creatorById = new Map(creators.map((c) => [c.id, c]));

  return {
    data: decisions.map((d) => ({
      ...d,
      creator: creatorById.get(d.created_by) ?? null,
    })),
    pagination: {
      page,
      limit,
      total,
      total_pages: Math.ceil(total / limit),
    },
  };
}
