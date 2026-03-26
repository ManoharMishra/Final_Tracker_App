import { Prisma } from "@prisma/client";
import { ApiError } from "@/lib/errors";
import { prisma } from "@/lib/prisma";

const MAX_RESULTS = 20;
const NOT_DELETED = { deleted_at: null } as const;

type MyTaskItem = {
  id: string;
  title: string;
  status: "open" | "in_progress" | "done";
  thread_id: string | null;
  created_by: string;
  created_at: Date;
  updated_at: Date;
};

type MyMentionItem = {
  id: string;
  thread_id: string;
  author_id: string;
  content: string;
  metadata: unknown;
  created_at: Date;
  updated_at: Date;
};

type MyNotificationItem = {
  id: string;
  user_id: string;
  org_id: string;
  type: "thread_update" | "mention" | "task_assigned" | "decision_added";
  title: string;
  entity_type: "thread" | "message" | "task";
  entity_id: string;
  is_read: boolean;
  created_at: Date;
};

async function getUserContext(userId: string) {
  if (!userId) {
    throw new ApiError("VALIDATION_ERROR", "userId is required");
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, org_id: true },
  });

  if (!user) {
    throw new ApiError("NOT_FOUND", `User ${userId} not found`);
  }

  return user;
}

async function notificationTableExists() {
  const rows = await prisma.$queryRaw<Array<{ exists: string | null }>>`
    SELECT to_regclass('public.notifications')::text AS exists
  `;

  return rows[0]?.exists === "notifications" || rows[0]?.exists === "public.notifications";
}

export async function getMyTasks(userId: string) {
  const user = await getUserContext(userId);

  const tasks = await prisma.task.findMany({
    where: {
      assigned_to: user.id,
      ...NOT_DELETED,
      thread: {
        is: {
          org_id: user.org_id,
          deleted_at: null,
        },
      },
    },
    orderBy: { created_at: "desc" },
    take: MAX_RESULTS,
    select: {
      id: true,
      title: true,
      status: true,
      thread_id: true,
      created_by: true,
      created_at: true,
      updated_at: true,
    },
  } as any);

  return tasks as MyTaskItem[];
}

export async function getMyMentions(userId: string) {
  const user = await getUserContext(userId);

  const mentions = await prisma.$queryRaw<MyMentionItem[]>(Prisma.sql`
    SELECT
      m."id",
      m."thread_id",
      m."author_id",
      m."content",
      m."metadata",
      m."created_at",
      m."updated_at"
    FROM "messages" m
    INNER JOIN "threads" t ON t."id" = m."thread_id"
    WHERE t."org_id" = ${user.org_id}::uuid
      AND t."deleted_at" IS NULL
      AND m."deleted_at" IS NULL
      AND m."metadata" @> ${JSON.stringify({ mentions: [user.id] })}::jsonb
    ORDER BY m."created_at" DESC
    LIMIT ${MAX_RESULTS}
  `);

  return mentions;
}

export async function getMyNotifications(userId: string) {
  const user = await getUserContext(userId);

  const notificationModel = (prisma as any).notification;
  if (notificationModel?.findMany) {
    const notifications = await notificationModel.findMany({
      where: {
        user_id: user.id,
        org_id: user.org_id,
      },
      orderBy: { created_at: "desc" },
      take: MAX_RESULTS,
    });

    return notifications as MyNotificationItem[];
  }

  if (!(await notificationTableExists())) {
    return [] as MyNotificationItem[];
  }

  const notifications = await prisma.$queryRaw<MyNotificationItem[]>(Prisma.sql`
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
    ORDER BY "created_at" DESC
    LIMIT ${MAX_RESULTS}
  `);

  return notifications;
}