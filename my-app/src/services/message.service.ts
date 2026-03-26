import type { Prisma } from "@prisma/client";
import { ApiError } from "@/lib/errors";
import { prisma } from "@/lib/prisma";
import { validateThreadAccess } from "@/lib/validate";
import { createThreadEventTx } from "@/services/threadEvent.service";
import { createNotificationsFromEvent } from "@/services/notification.service";
import { structuredLog } from "@/lib/logging";
import {
  metadataSchema,
  type CreateMessageInput,
  type GetMessagesInput,
} from "@/lib/validations/message.validation";

const NOT_DELETED = { deleted_at: null } as const;

function parseMentionsStub(content: string): string[] {
  const matches = content.matchAll(
    /@([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})/gi
  );

  return Array.from(matches, (match) => match[1]);
}

function normalizeMetadata(input: CreateMessageInput["metadata"], content: string) {
  const metadata = input ?? { mentions: [], attachments: [] };
  const parsedMentions = parseMentionsStub(content);

  return {
    mentions: Array.from(new Set([...(metadata.mentions ?? []), ...parsedMentions])),
    attachments: metadata.attachments ?? [],
  };
}

function safeMetadata(value: unknown) {
  const parsed = metadataSchema.safeParse(value);
  return parsed.success ? parsed.data : { mentions: [], attachments: [] };
}

export async function createMessage(input: CreateMessageInput, actorId: string) {
  structuredLog("SERVICE", "INPUT", {
    service: "message.createMessage",
    payload: { input, actorId },
  });

  const now = new Date();

  return prisma.$transaction(async (tx) => {
    await validateThreadAccess(tx, actorId, input.thread_id, { forUpdate: true });

    const metadata = normalizeMetadata(input.metadata, input.content);

    const message = await tx.message.create({
      data: {
        thread_id: input.thread_id,
        author_id: actorId,
        content: input.content,
        metadata: metadata as Prisma.InputJsonValue,
        created_at: now,
      },
    });

    await tx.thread.update({
      where: { id: input.thread_id },
      data: { last_activity_at: now },
    });

    await createThreadEventTx(tx, {
      threadId: input.thread_id,
      eventType: "message_created",
      actorId: actorId,
      payload: {
        entity_id: message.id,
        entity_type: "message",
        data: {
          message_id: message.id,
          mentions: metadata.mentions,
        },
      },
    });

    await createNotificationsFromEvent(
      {
        thread_id: input.thread_id,
        event_type: "message_created",
        actor_id: actorId,
        payload: {
          entity_id: message.id,
          entity_type: "message",
          data: {
            message_id: message.id,
            mentions: metadata.mentions,
          },
        },
        created_at: now,
      },
      metadata.mentions
    );

    return message;
  });
}

export async function getMessages(input: GetMessagesInput, actorId: string) {
  structuredLog("SERVICE", "INPUT", {
    service: "message.getMessages",
    payload: { input, actorId },
  });

  const { thread_id, page, limit } = input;
  const skip = (page - 1) * limit;

  await prisma.$transaction(async (tx) => {
    await validateThreadAccess(tx, actorId, thread_id);
  });

  const where = {
    thread_id,
    ...NOT_DELETED,
  };

  const [messages, total] = await prisma.$transaction([
    prisma.message.findMany({
      where,
      orderBy: { created_at: "desc" },
      skip,
      take: limit,
      select: {
        id: true,
        thread_id: true,
        author_id: true,
        content: true,
        metadata: true,
        created_at: true,
        updated_at: true,
      },
    }),
    prisma.message.count({ where }),
  ]);

  const authorIds = Array.from(new Set(messages.map((message) => message.author_id)));

  const authors = authorIds.length
    ? await prisma.user.findMany({
        where: { id: { in: authorIds } },
        select: {
          id: true,
          name: true,
          email: true,
          avatar_url: true,
        },
      })
    : [];

  const authorById = new Map(authors.map((author) => [author.id, author]));

  return {
    data: messages.map((message) => ({
      ...message,
      metadata: safeMetadata(message.metadata),
      author: authorById.get(message.author_id) ?? null,
    })),
    pagination: {
      page,
      limit,
      total,
      total_pages: Math.ceil(total / limit),
    },
  };
}
