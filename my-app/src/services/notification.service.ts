import { ApiError } from "@/lib/errors";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";

type NotificationType =
  | "thread_update"
  | "mention"
  | "task_assigned"
  | "decision_added";

type NotificationEntityType = "thread" | "message" | "task";

type EventInput = {
  thread_id: string;
  event_type: string;
  actor_id?: string | null;
  payload?: unknown;
  created_at?: Date | string;
};

type GetNotificationsInput = {
  user_id: string;
  is_read?: boolean;
  page?: number;
  limit?: number;
};

const NOT_DELETED = { deleted_at: null } as const;

function toObject(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function toEntityType(value: unknown): NotificationEntityType | null {
  if (value === "thread" || value === "message" || value === "task") {
    return value;
  }
  return null;
}

function toType(value: unknown): NotificationType | null {
  if (
    value === "thread_update" ||
    value === "mention" ||
    value === "task_assigned" ||
    value === "decision_added"
  ) {
    return value;
  }
  return null;
}

function toDate(value: Date | string | undefined): Date {
  if (!value) return new Date();
  if (value instanceof Date) return value;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}

function normalizeLimit(limit?: number): number {
  const resolved = limit ?? 20;
  if (!Number.isInteger(resolved) || resolved < 1) {
    throw new ApiError("VALIDATION_ERROR", "limit must be an integer >= 1");
  }
  return Math.min(resolved, 100);
}

function normalizePage(page?: number): number {
  const resolved = page ?? 1;
  if (!Number.isInteger(resolved) || resolved < 1) {
    throw new ApiError("VALIDATION_ERROR", "page must be an integer >= 1");
  }
  return resolved;
}

function titleForType(type: NotificationType): string {
  if (type === "mention") return "You were mentioned";
  if (type === "task_assigned") return "Task assigned to you";
  if (type === "decision_added") return "New decision added";
  return "Thread updated";
}

function baseTypeFromEvent(eventType: string): NotificationType {
  if (eventType === "decision_added") return "decision_added";
  return "thread_update";
}

async function notificationTableExists(
  tx: Omit<
    typeof prisma,
    "$connect" | "$disconnect" | "$extends" | "$on" | "$transaction"
  >
) {
  const rows = await tx.$queryRaw<Array<{ exists: string | null }>>`
    SELECT to_regclass('public.notifications')::text AS exists
  `;

  return rows[0]?.exists === "notifications" || rows[0]?.exists === "public.notifications";
}

export async function createNotificationsFromEvent(
  event: EventInput,
  recipients: string[]
) {
  if (!event.thread_id) {
    throw new ApiError("VALIDATION_ERROR", "thread_id is required");
  }

  if (!Array.isArray(recipients)) {
    throw new ApiError("VALIDATION_ERROR", "recipients must be an array");
  }

  return prisma.$transaction(async (tx) => {
    const thread = await tx.thread.findFirst({
      where: { id: event.thread_id, ...NOT_DELETED },
      select: { id: true, org_id: true },
    });

    if (!thread) {
      throw new ApiError("NOT_FOUND", `Thread ${event.thread_id} not found`);
    }

    const actorId = event.actor_id ?? null;
    const uniqueRecipients = Array.from(new Set(recipients)).filter(
      (userId) => userId && userId !== actorId
    );

    if (uniqueRecipients.length === 0) {
      return { created_count: 0 };
    }

    const validUsers = await tx.user.findMany({
      where: {
        id: { in: uniqueRecipients },
        org_id: thread.org_id,
      },
      select: { id: true },
    });

    const validRecipientIds = validUsers.map((u) => u.id);

    if (validRecipientIds.length === 0) {
      return { created_count: 0 };
    }

    const payload = toObject(event.payload);
    const payloadData = toObject(payload.data);
    const payloadType = toType(payload.notification_type);

    const eventEntityType = toEntityType(payload.entity_type) ?? "thread";
    const eventEntityId =
      typeof payload.entity_id === "string" ? payload.entity_id : thread.id;

    const mentionsRaw = payloadData.mentions;
    const mentions = Array.isArray(mentionsRaw)
      ? mentionsRaw.filter((v): v is string => typeof v === "string")
      : [];

    const assignedToRaw = payloadData.assigned_to;
    const assignedTo = typeof assignedToRaw === "string" ? assignedToRaw : null;

    const createdAt = toDate(event.created_at);

    const rows = validRecipientIds.map((recipientId) => {
      let type: NotificationType = payloadType ?? baseTypeFromEvent(event.event_type);

      if (mentions.includes(recipientId)) {
        type = "mention";
      } else if (assignedTo && assignedTo === recipientId) {
        type = "task_assigned";
      }

      return {
        user_id: recipientId,
        org_id: thread.org_id,
        type,
        title: titleForType(type),
        entity_type: eventEntityType,
        entity_id: eventEntityId,
        is_read: false,
        created_at: createdAt,
      };
    });

    const notificationModel = (tx as any).notification;
    if (notificationModel?.createMany) {
      const result = await notificationModel.createMany({
        data: rows,
      });

      return { created_count: result.count };
    }

    if (rows.length === 0) {
      return { created_count: 0 };
    }

    if (!(await notificationTableExists(tx))) {
      return { created_count: 0 };
    }

    const values = Prisma.join(
      rows.map((row) =>
        Prisma.sql`(
          ${row.user_id}::uuid,
          ${row.org_id}::uuid,
          ${row.type}::"NotificationType",
          ${row.title},
          ${row.entity_type}::"NotificationEntityType",
          ${row.entity_id}::uuid,
          ${row.is_read},
          ${row.created_at}
        )`
      )
    );

    await tx.$executeRaw(Prisma.sql`
      INSERT INTO "notifications"
      ("user_id", "org_id", "type", "title", "entity_type", "entity_id", "is_read", "created_at")
      VALUES ${values}
    `);

    return { created_count: rows.length };
  });
}

export async function getNotifications(input: GetNotificationsInput) {
  if (!input.user_id) {
    throw new ApiError("VALIDATION_ERROR", "user_id is required");
  }

  const page = normalizePage(input.page);
  const limit = normalizeLimit(input.limit);
  const skip = (page - 1) * limit;

  const user = await prisma.user.findUnique({
    where: { id: input.user_id },
    select: { id: true, org_id: true },
  });

  if (!user) {
    throw new ApiError("NOT_FOUND", `User ${input.user_id} not found`);
  }

  const where = {
    user_id: user.id,
    org_id: user.org_id,
    ...(typeof input.is_read === "boolean" ? { is_read: input.is_read } : {}),
  };

  const notificationModel = (prisma as any).notification;
  let data: Array<{
    id: string;
    user_id: string;
    org_id: string;
    type: NotificationType;
    title: string;
    entity_type: NotificationEntityType;
    entity_id: string;
    is_read: boolean;
    created_at: Date;
  }> = [];
  let total = 0;

  if (notificationModel?.findMany && notificationModel?.count) {
    const result = await prisma.$transaction([
      notificationModel.findMany({
        where,
        orderBy: { created_at: "desc" },
        skip,
        take: limit,
      }),
      notificationModel.count({ where }),
    ]);

    data = result[0];
    total = result[1];
  } else {
    if (!(await notificationTableExists(prisma))) {
      return {
        data: [],
        pagination: {
          page,
          limit,
          total: 0,
          total_pages: 0,
        },
      };
    }

    const isReadClause =
      typeof input.is_read === "boolean"
        ? Prisma.sql`AND "is_read" = ${input.is_read}`
        : Prisma.empty;

    const rows = await prisma.$queryRaw<typeof data>(Prisma.sql`
      SELECT
        "id",
        "user_id",
        "org_id",
        "type",
        "title",
        "entity_type",
        "entity_id",
        "is_read",
        "created_at"
      FROM "notifications"
      WHERE "user_id" = ${user.id}::uuid
        AND "org_id" = ${user.org_id}::uuid
        ${isReadClause}
      ORDER BY "created_at" DESC
      OFFSET ${skip}
      LIMIT ${limit}
    `);

    const countRows = await prisma.$queryRaw<Array<{ count: bigint | number }>>(Prisma.sql`
      SELECT COUNT(*)::bigint AS "count"
      FROM "notifications"
      WHERE "user_id" = ${user.id}::uuid
        AND "org_id" = ${user.org_id}::uuid
        ${isReadClause}
    `);

    data = rows;
    const countValue = countRows[0]?.count ?? 0;
    total = typeof countValue === "bigint" ? Number(countValue) : countValue;
  }

  return {
    data,
    pagination: {
      page,
      limit,
      total,
      total_pages: Math.ceil(total / limit),
    },
  };
}

export async function markNotificationRead(notificationId: string, actorId: string) {
  if (!notificationId) {
    throw new ApiError("VALIDATION_ERROR", "notificationId is required");
  }

  if (!actorId) {
    throw new ApiError("FORBIDDEN", "actorId is required");
  }

  return prisma.$transaction(async (tx) => {
    const actor = await tx.user.findUnique({
      where: { id: actorId },
      select: { id: true, org_id: true },
    });

    if (!actor) {
      throw new ApiError("FORBIDDEN", "Actor not found");
    }

    const notificationModel = (tx as any).notification;
    const hasNotificationTable = notificationModel?.findUnique
      ? true
      : await notificationTableExists(tx);

    if (!hasNotificationTable) {
      throw new ApiError("NOT_FOUND", `Notification ${notificationId} not found`);
    }

    const existing = notificationModel?.findUnique
      ? await notificationModel.findUnique({
          where: { id: notificationId },
          select: {
            id: true,
            user_id: true,
            org_id: true,
            is_read: true,
            type: true,
            title: true,
            entity_type: true,
            entity_id: true,
            created_at: true,
          },
        })
      : (
          await tx.$queryRaw<
            Array<{
              id: string;
              user_id: string;
              org_id: string;
              is_read: boolean;
              type: NotificationType;
              title: string;
              entity_type: NotificationEntityType;
              entity_id: string;
              created_at: Date;
            }>
          >(Prisma.sql`
            SELECT
              "id",
              "user_id",
              "org_id",
              "is_read",
              "type",
              "title",
              "entity_type",
              "entity_id",
              "created_at"
            FROM "notifications"
            WHERE "id" = ${notificationId}::uuid
            LIMIT 1
          `)
        )[0] ?? null;

    if (!existing) {
      throw new ApiError("NOT_FOUND", `Notification ${notificationId} not found`);
    }

    if (existing.user_id !== actor.id || existing.org_id !== actor.org_id) {
      throw new ApiError("FORBIDDEN", "You do not have access to this notification");
    }

    if (existing.is_read) {
      return existing;
    }

    if (notificationModel?.update) {
      return notificationModel.update({
        where: { id: notificationId },
        data: { is_read: true },
      });
    }

    const updatedRows = await tx.$queryRaw<
      Array<{
        id: string;
        user_id: string;
        org_id: string;
        is_read: boolean;
        type: NotificationType;
        title: string;
        entity_type: NotificationEntityType;
        entity_id: string;
        created_at: Date;
      }>
    >(Prisma.sql`
      UPDATE "notifications"
      SET "is_read" = true
      WHERE "id" = ${notificationId}::uuid
      RETURNING
        "id",
        "user_id",
        "org_id",
        "is_read",
        "type",
        "title",
        "entity_type",
        "entity_id",
        "created_at"
    `);

    return updatedRows[0] ?? existing;
  });
}

export async function markAllRead(userId: string) {
  if (!userId) {
    throw new ApiError("VALIDATION_ERROR", "userId is required");
  }

  return prisma.$transaction(async (tx) => {
    const user = await tx.user.findUnique({
      where: { id: userId },
      select: { id: true, org_id: true },
    });

    if (!user) {
      throw new ApiError("NOT_FOUND", `User ${userId} not found`);
    }

    const notificationModel = (tx as any).notification;
    if (notificationModel?.updateMany) {
      const result = await notificationModel.updateMany({
        where: {
          user_id: user.id,
          org_id: user.org_id,
          is_read: false,
        },
        data: { is_read: true },
      });

      return { updated_count: result.count };
    }

    if (!(await notificationTableExists(tx))) {
      return { updated_count: 0 };
    }

    const updatedCount = await tx.$executeRaw(Prisma.sql`
      UPDATE "notifications"
      SET "is_read" = true
      WHERE "user_id" = ${user.id}::uuid
        AND "org_id" = ${user.org_id}::uuid
        AND "is_read" = false
    `);

    return { updated_count: Number(updatedCount) };
  });
}
