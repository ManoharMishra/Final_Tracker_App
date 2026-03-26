import { ApiError } from "@/lib/errors";
import { prisma } from "@/lib/prisma";
import { createThreadEventTx } from "@/services/threadEvent.service";

const NOT_DELETED = { deleted_at: null } as const;

export async function createSummary(
  thread_id: string,
  content: string,
  actorId: string
) {
  if (!thread_id) {
    throw new ApiError("VALIDATION_ERROR", "thread_id is required");
  }

  if (!content || !content.trim()) {
    throw new ApiError("VALIDATION_ERROR", "content is required");
  }

  if (!actorId) {
    throw new ApiError("FORBIDDEN", "actorId is required");
  }

  const now = new Date();

  return prisma.$transaction(
    async (tx) => {
      const thread = await tx.thread.findFirst({
        where: { id: thread_id, ...NOT_DELETED },
        select: { id: true },
      });

      if (!thread) {
        throw new ApiError("NOT_FOUND", `Thread ${thread_id} not found`);
      }

      const participant = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT id
        FROM thread_participants
        WHERE thread_id = ${thread_id}::uuid
          AND user_id = ${actorId}::uuid
        FOR UPDATE
      `;

      if (participant.length === 0) {
        throw new ApiError("FORBIDDEN", "You must be a participant in this thread");
      }

      await tx.$queryRaw<Array<{ id: string }>>`
        SELECT id
        FROM threads
        WHERE id = ${thread_id}::uuid
        FOR UPDATE
      `;

      const latestSummary = await tx.threadSummary.findFirst({
        where: { thread_id },
        orderBy: { version: "desc" },
        select: { version: true },
      });

      const version = (latestSummary?.version ?? 0) + 1;

      const summary = await tx.threadSummary.create({
        data: {
          thread_id,
          content: content.trim(),
          version,
          created_by: actorId,
          created_at: now,
        },
      });

      await createThreadEventTx(tx, {
        threadId: thread_id,
        eventType: "summary_created",
        actorId,
        payload: {
          entity_id: summary.id,
          entity_type: "summary",
          data: {
            summary_id: summary.id,
            version: summary.version,
          },
        },
      });

      return summary;
    },
    { isolationLevel: "Serializable" }
  );
}

export async function getLatestSummary(thread_id: string, userId: string) {
  if (!thread_id) {
    throw new ApiError("VALIDATION_ERROR", "thread_id is required");
  }

  if (!userId) {
    throw new ApiError("FORBIDDEN", "userId is required");
  }

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

  const summary = await prisma.threadSummary.findFirst({
    where: { thread_id },
    orderBy: { version: "desc" },
    take: 1,
  });

  return summary;
}