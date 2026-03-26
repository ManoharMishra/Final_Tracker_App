import { randomUUID } from "node:crypto";
import { ApiError } from "@/lib/errors";
import { prisma } from "@/lib/prisma";
import { validateThreadAccess, validateUser, validateUserInOrg } from "@/lib/validate";
import { Prisma } from "@prisma/client";

type EntityType = "thread" | "message" | "task";

type TxClient = Omit<
  typeof prisma,
  "$connect" | "$disconnect" | "$extends" | "$on" | "$transaction"
>;

const NOT_DELETED = { deleted_at: null } as const;

export interface GenerateUploadUrlInput {
  org_id: string;
  file_name: string;
  file_type: string;
  file_size: number;
  entity_type: EntityType;
  entity_id: string;
  thread_id?: string;
  message_id?: string;
  task_id?: string;
}

export interface SaveAttachmentInput {
  org_id: string;
  file_name: string;
  file_type: string;
  file_size: number;
  file_url: string;
  entity_type: EntityType;
  entity_id: string;
  thread_id?: string;
  message_id?: string;
  task_id?: string;
}

export interface ListAttachmentsInput {
  org_id: string;
  entity_type?: EntityType;
  entity_id?: string;
  thread_id?: string;
  message_id?: string;
  task_id?: string;
  page?: number;
  limit?: number;
}

type ResolvedEntityContext = {
  entity_type: EntityType;
  entity_id: string;
  thread_id: string | null;
  message_id: string | null;
  task_id: string | null;
  threadContextId: string;
};

type AttachmentRow = {
  id: string;
  org_id: string;
  uploaded_by: string;
  file_name: string;
  file_type: string;
  file_size: number;
  file_url: string;
  entity_type: EntityType;
  entity_id: string;
  thread_id: string | null;
  message_id: string | null;
  task_id: string | null;
  created_at: Date;
  deleted_at: Date | null;
};

function isMissingAttachmentsTableError(error: unknown) {
  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "P2010"
  ) {
    const meta = (error as { meta?: unknown }).meta;
    if (
      typeof meta === "object" &&
      meta !== null &&
      "driverAdapterError" in meta
    ) {
      const driverAdapterError = (meta as { driverAdapterError?: unknown }).driverAdapterError;
      const message = String(driverAdapterError ?? "");
      return message.includes("TableDoesNotExist") || message.includes("attachments");
    }
  }

  return false;
}

async function attachmentTableExists(tx: TxClient) {
  const rows = await tx.$queryRaw<Array<{ exists: string | null }>>`
    SELECT to_regclass('public.attachments')::text AS exists
  `;

  return rows[0]?.exists === 'attachments' || rows[0]?.exists === 'public.attachments';
}

function countDefined(values: Array<string | undefined>) {
  return values.filter((v) => Boolean(v)).length;
}

function ensureRequiredString(value: string | undefined, field: string) {
  if (!value || !value.trim()) {
    throw new ApiError("VALIDATION_ERROR", `${field} is required`);
  }
}

function ensurePositiveInt(value: number, field: string) {
  if (!Number.isInteger(value) || value <= 0) {
    throw new ApiError("VALIDATION_ERROR", `${field} must be a positive integer`);
  }
}

function validateSingleFkAndMatch(input: {
  entity_type: EntityType;
  entity_id: string;
  thread_id?: string;
  message_id?: string;
  task_id?: string;
}) {
  const fkCount = countDefined([input.thread_id, input.message_id, input.task_id]);
  if (fkCount !== 1) {
    throw new ApiError(
      "VALIDATION_ERROR",
      "Exactly one of thread_id, message_id, task_id must be provided"
    );
  }

  if (input.entity_type === "thread" && !input.thread_id) {
    throw new ApiError("VALIDATION_ERROR", "entity_type thread requires thread_id");
  }
  if (input.entity_type === "message" && !input.message_id) {
    throw new ApiError("VALIDATION_ERROR", "entity_type message requires message_id");
  }
  if (input.entity_type === "task" && !input.task_id) {
    throw new ApiError("VALIDATION_ERROR", "entity_type task requires task_id");
  }

  if (input.entity_type === "thread" && input.entity_id !== input.thread_id) {
    throw new ApiError("VALIDATION_ERROR", "entity_id must match thread_id");
  }
  if (input.entity_type === "message" && input.entity_id !== input.message_id) {
    throw new ApiError("VALIDATION_ERROR", "entity_id must match message_id");
  }
  if (input.entity_type === "task" && input.entity_id !== input.task_id) {
    throw new ApiError("VALIDATION_ERROR", "entity_id must match task_id");
  }
}

async function ensureActorOrgAccess(tx: TxClient, actorId: string, orgId: string) {
  const user = await tx.user.findFirst({
    where: { id: actorId, org_id: orgId },
    select: { id: true },
  });

  if (!user) {
    throw new ApiError("FORBIDDEN", "Actor does not belong to this organization");
  }
}

async function ensureThreadParticipantRead(tx: TxClient, threadId: string, actorId: string) {
  const participant = await tx.threadParticipant.findUnique({
    where: {
      thread_id_user_id: {
        thread_id: threadId,
        user_id: actorId,
      },
    },
    select: { id: true },
  });

  if (!participant) {
    throw new ApiError("FORBIDDEN", "You must be a participant in this thread");
  }
}

async function ensureThreadParticipantWrite(tx: TxClient, threadId: string, actorId: string) {
  const participant = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT id
    FROM thread_participants
    WHERE thread_id = ${threadId}::uuid
      AND user_id = ${actorId}::uuid
    FOR UPDATE
  `;

  if (participant.length === 0) {
    throw new ApiError("FORBIDDEN", "You must be a participant in this thread");
  }
}

async function resolveEntityContext(
  tx: TxClient,
  input: {
    org_id: string;
    entity_type: EntityType;
    entity_id: string;
    thread_id?: string;
    message_id?: string;
    task_id?: string;
  }
): Promise<ResolvedEntityContext> {
  validateSingleFkAndMatch(input);

  if (input.thread_id) {
    const thread = await tx.thread.findFirst({
      where: { id: input.thread_id, ...NOT_DELETED },
      select: { id: true, org_id: true },
    });

    if (!thread) {
      throw new ApiError("NOT_FOUND", `Thread ${input.thread_id} not found`);
    }

    if (thread.org_id !== input.org_id) {
      throw new ApiError("VALIDATION_ERROR", "org_id does not match thread organization");
    }

    return {
      entity_type: "thread",
      entity_id: thread.id,
      thread_id: thread.id,
      message_id: null,
      task_id: null,
      threadContextId: thread.id,
    };
  }

  if (input.message_id) {
    const message = await tx.message.findFirst({
      where: { id: input.message_id, ...NOT_DELETED },
      select: { id: true, thread_id: true },
    });

    if (!message) {
      throw new ApiError("NOT_FOUND", `Message ${input.message_id} not found`);
    }

    const thread = await tx.thread.findFirst({
      where: { id: message.thread_id, ...NOT_DELETED },
      select: { id: true, org_id: true },
    });

    if (!thread) {
      throw new ApiError("NOT_FOUND", `Thread ${message.thread_id} not found`);
    }

    if (thread.org_id !== input.org_id) {
      throw new ApiError("VALIDATION_ERROR", "org_id does not match message organization");
    }

    return {
      entity_type: "message",
      entity_id: message.id,
      thread_id: thread.id,
      message_id: message.id,
      task_id: null,
      threadContextId: thread.id,
    };
  }

  const task = await tx.task.findFirst({
    where: { id: input.task_id!, ...NOT_DELETED },
    select: { id: true, thread_id: true },
  });

  if (!task) {
    throw new ApiError("NOT_FOUND", `Task ${input.task_id} not found`);
  }

  if (!task.thread_id) {
    throw new ApiError(
      "VALIDATION_ERROR",
      "Task must be linked to a thread for attachment operations"
    );
  }

  const thread = await tx.thread.findFirst({
    where: { id: task.thread_id, ...NOT_DELETED },
    select: { id: true, org_id: true },
  });

  if (!thread) {
    throw new ApiError("NOT_FOUND", `Thread ${task.thread_id} not found`);
  }

  if (thread.org_id !== input.org_id) {
    throw new ApiError("VALIDATION_ERROR", "org_id does not match task organization");
  }

  return {
    entity_type: "task",
    entity_id: task.id,
    thread_id: thread.id,
    message_id: null,
    task_id: task.id,
    threadContextId: thread.id,
  };
}

export async function generateUploadUrl(input: GenerateUploadUrlInput) {
  ensureRequiredString(input.org_id, "org_id");
  ensureRequiredString(input.file_name, "file_name");
  ensureRequiredString(input.file_type, "file_type");
  ensurePositiveInt(input.file_size, "file_size");
  ensureRequiredString(input.entity_id, "entity_id");

  const resolved = await prisma.$transaction(async (tx) => {
    return resolveEntityContext(tx, input);
  });

  const safeFileName = input.file_name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const key = [
    "attachments",
    input.org_id,
    resolved.entity_type,
    resolved.entity_id,
    `${Date.now()}-${randomUUID()}-${safeFileName}`,
  ].join("/");

  const baseUrl = process.env.ATTACHMENTS_BASE_URL ?? "";
  const upload_url = baseUrl
    ? `${baseUrl.replace(/\/+$/, "")}/${key}`
    : `/uploads/${key}`;

  return {
    upload_url,
    file_url: upload_url,
    key,
  };
}

export async function saveAttachment(input: SaveAttachmentInput, actorId: string) {
  ensureRequiredString(input.org_id, "org_id");
  ensureRequiredString(input.file_name, "file_name");
  ensureRequiredString(input.file_type, "file_type");
  ensurePositiveInt(input.file_size, "file_size");
  ensureRequiredString(input.file_url, "file_url");
  ensureRequiredString(input.entity_id, "entity_id");

  return prisma.$transaction(async (tx) => {
    await validateUser(tx, actorId);
    await validateUserInOrg(tx, actorId, input.org_id);

    const resolved = await resolveEntityContext(tx, input);
    await validateThreadAccess(tx, actorId, resolved.threadContextId, { forUpdate: true });

    const attachmentModel = (tx as any).attachment;
    const hasAttachmentTable = attachmentModel?.create
      ? true
      : await attachmentTableExists(tx);

    if (!hasAttachmentTable) {
      throw new ApiError("NOT_FOUND", "Attachments table does not exist");
    }

    const attachment = attachmentModel?.create
      ? await attachmentModel.create({
          data: {
            org_id: input.org_id,
            uploaded_by: actorId,
            file_name: input.file_name,
            file_type: input.file_type,
            file_size: input.file_size,
            file_url: input.file_url,
            entity_type: resolved.entity_type,
            entity_id: resolved.entity_id,
            thread_id: resolved.thread_id,
            message_id: resolved.message_id,
            task_id: resolved.task_id,
          },
        })
      : (
          await tx.$queryRaw<Array<AttachmentRow>>(Prisma.sql`
            INSERT INTO "attachments"
            (
              "org_id",
              "uploaded_by",
              "file_name",
              "file_type",
              "file_size",
              "file_url",
              "entity_type",
              "entity_id",
              "thread_id",
              "message_id",
              "task_id"
            )
            VALUES (
              ${input.org_id}::uuid,
              ${actorId}::uuid,
              ${input.file_name},
              ${input.file_type},
              ${input.file_size},
              ${input.file_url},
              ${resolved.entity_type}::"AttachmentEntityType",
              ${resolved.entity_id}::uuid,
              ${resolved.thread_id ? Prisma.sql`${resolved.thread_id}::uuid` : Prisma.sql`NULL`},
              ${resolved.message_id ? Prisma.sql`${resolved.message_id}::uuid` : Prisma.sql`NULL`},
              ${resolved.task_id ? Prisma.sql`${resolved.task_id}::uuid` : Prisma.sql`NULL`}
            )
            RETURNING
              "id",
              "org_id",
              "uploaded_by",
              "file_name",
              "file_type",
              "file_size",
              "file_url",
              "entity_type",
              "entity_id",
              "thread_id",
              "message_id",
              "task_id",
              "created_at",
              "deleted_at"
          `)
        )[0];

    return attachment;
  });
}

export async function listAttachments(input: ListAttachmentsInput, actorId: string) {
  ensureRequiredString(input.org_id, "org_id");

  const page = input.page ?? 1;
  const rawLimit = input.limit ?? 20;
  const limit = Math.min(rawLimit, 100);

  if (!Number.isInteger(page) || page < 1) {
    throw new ApiError("VALIDATION_ERROR", "page must be an integer >= 1");
  }

  if (!Number.isInteger(rawLimit) || rawLimit < 1) {
    throw new ApiError("VALIDATION_ERROR", "limit must be an integer between 1 and 100");
  }

  const skip = (page - 1) * limit;

  return prisma.$transaction(async (tx) => {
    await ensureActorOrgAccess(tx, actorId, input.org_id);

    const fkCount = countDefined([input.thread_id, input.message_id, input.task_id]);
    const hasAnyPolymorphic = Boolean(input.entity_type || input.entity_id);
    const hasPolymorphicPair = Boolean(input.entity_type && input.entity_id);

    if (hasPolymorphicPair && fkCount > 0) {
      throw new ApiError("VALIDATION_ERROR", "Conflicting parameters provided");
    }

    if ((hasAnyPolymorphic && !hasPolymorphicPair) || (!hasPolymorphicPair && fkCount !== 1)) {
      throw new ApiError(
        "VALIDATION_ERROR",
        "Provide either entity_type+entity_id OR a single FK (thread_id/message_id/task_id)"
      );
    }

    let resolved: {
      entity_type: EntityType;
      entity_id: string;
      threadContextId: string;
    };

    if (hasPolymorphicPair) {
      const entityType = input.entity_type as EntityType;
      const entityId = input.entity_id as string;

      if (entityType === "thread") {
        const thread = await tx.thread.findFirst({
          where: { id: entityId, ...NOT_DELETED },
          select: { id: true, org_id: true },
        });

        if (!thread) {
          throw new ApiError("NOT_FOUND", `Thread ${entityId} not found`);
        }

        if (thread.org_id !== input.org_id) {
          throw new ApiError("VALIDATION_ERROR", "org_id does not match thread organization");
        }

        resolved = {
          entity_type: "thread",
          entity_id: thread.id,
          threadContextId: thread.id,
        };
      } else if (entityType === "message") {
        const message = await tx.message.findFirst({
          where: { id: entityId, ...NOT_DELETED },
          select: { id: true, thread_id: true },
        });

        if (!message) {
          throw new ApiError("NOT_FOUND", `Message ${entityId} not found`);
        }

        const thread = await tx.thread.findFirst({
          where: { id: message.thread_id, ...NOT_DELETED },
          select: { id: true, org_id: true },
        });

        if (!thread) {
          throw new ApiError("NOT_FOUND", `Thread ${message.thread_id} not found`);
        }

        if (thread.org_id !== input.org_id) {
          throw new ApiError("VALIDATION_ERROR", "org_id does not match message organization");
        }

        resolved = {
          entity_type: "message",
          entity_id: message.id,
          threadContextId: thread.id,
        };
      } else {
        const task = await tx.task.findFirst({
          where: { id: entityId, ...NOT_DELETED },
          select: { id: true, thread_id: true },
        });

        if (!task) {
          throw new ApiError("NOT_FOUND", `Task ${entityId} not found`);
        }

        if (!task.thread_id) {
          throw new ApiError(
            "VALIDATION_ERROR",
            "Task must be linked to a thread for attachment operations"
          );
        }

        const thread = await tx.thread.findFirst({
          where: { id: task.thread_id, ...NOT_DELETED },
          select: { id: true, org_id: true },
        });

        if (!thread) {
          throw new ApiError("NOT_FOUND", `Thread ${task.thread_id} not found`);
        }

        if (thread.org_id !== input.org_id) {
          throw new ApiError("VALIDATION_ERROR", "org_id does not match task organization");
        }

        resolved = {
          entity_type: "task",
          entity_id: task.id,
          threadContextId: thread.id,
        };
      }
    } else if (input.thread_id) {
      const thread = await tx.thread.findFirst({
        where: { id: input.thread_id, ...NOT_DELETED },
        select: { id: true, org_id: true },
      });

      if (!thread) {
        throw new ApiError("NOT_FOUND", `Thread ${input.thread_id} not found`);
      }

      if (thread.org_id !== input.org_id) {
        throw new ApiError("VALIDATION_ERROR", "org_id does not match thread organization");
      }

      resolved = {
        entity_type: "thread",
        entity_id: thread.id,
        threadContextId: thread.id,
      };
    } else if (input.message_id) {
      const message = await tx.message.findFirst({
        where: { id: input.message_id, ...NOT_DELETED },
        select: { id: true, thread_id: true },
      });

      if (!message) {
        throw new ApiError("NOT_FOUND", `Message ${input.message_id} not found`);
      }

      const thread = await tx.thread.findFirst({
        where: { id: message.thread_id, ...NOT_DELETED },
        select: { id: true, org_id: true },
      });

      if (!thread) {
        throw new ApiError("NOT_FOUND", `Thread ${message.thread_id} not found`);
      }

      if (thread.org_id !== input.org_id) {
        throw new ApiError("VALIDATION_ERROR", "org_id does not match message organization");
      }

      resolved = {
        entity_type: "message",
        entity_id: message.id,
        threadContextId: thread.id,
      };
    } else {
      const task = await tx.task.findFirst({
        where: { id: input.task_id!, ...NOT_DELETED },
        select: { id: true, thread_id: true },
      });

      if (!task) {
        throw new ApiError("NOT_FOUND", `Task ${input.task_id} not found`);
      }

      if (!task.thread_id) {
        throw new ApiError(
          "VALIDATION_ERROR",
          "Task must be linked to a thread for attachment operations"
        );
      }

      const thread = await tx.thread.findFirst({
        where: { id: task.thread_id, ...NOT_DELETED },
        select: { id: true, org_id: true },
      });

      if (!thread) {
        throw new ApiError("NOT_FOUND", `Thread ${task.thread_id} not found`);
      }

      if (thread.org_id !== input.org_id) {
        throw new ApiError("VALIDATION_ERROR", "org_id does not match task organization");
      }

      resolved = {
        entity_type: "task",
        entity_id: task.id,
        threadContextId: thread.id,
      };
    }

    await ensureThreadParticipantRead(tx, resolved.threadContextId, actorId);

    const where = {
      org_id: input.org_id,
      entity_type: resolved.entity_type,
      entity_id: resolved.entity_id,
      ...NOT_DELETED,
    };

    const attachmentModel = (tx as any).attachment;
    let data: AttachmentRow[] = [];
    let total = 0;

    if (attachmentModel?.findMany && attachmentModel?.count) {
      const result = await tx.$transaction([
        attachmentModel.findMany({
          where,
          orderBy: { created_at: "desc" },
          skip,
          take: limit,
        }),
        attachmentModel.count({ where }),
      ]);

      data = result[0];
      total = result[1];
    } else {
      const hasAttachmentTable = await attachmentTableExists(tx);

      if (!hasAttachmentTable) {
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

      try {
        data = await tx.$queryRaw<AttachmentRow[]>(Prisma.sql`
          SELECT
            "id",
            "org_id",
            "uploaded_by",
            "file_name",
            "file_type",
            "file_size",
            "file_url",
            "entity_type",
            "entity_id",
            "thread_id",
            "message_id",
            "task_id",
            "created_at",
            "deleted_at"
          FROM "attachments"
          WHERE "org_id" = ${input.org_id}::uuid
            AND "entity_type" = ${resolved.entity_type}::"AttachmentEntityType"
            AND "entity_id" = ${resolved.entity_id}::uuid
            AND "deleted_at" IS NULL
          ORDER BY "created_at" DESC
          OFFSET ${skip}
          LIMIT ${limit}
        `);

        const countRows = await tx.$queryRaw<Array<{ count: bigint | number }>>(Prisma.sql`
          SELECT COUNT(*)::bigint AS "count"
          FROM "attachments"
          WHERE "org_id" = ${input.org_id}::uuid
            AND "entity_type" = ${resolved.entity_type}::"AttachmentEntityType"
            AND "entity_id" = ${resolved.entity_id}::uuid
            AND "deleted_at" IS NULL
        `);

        const countValue = countRows[0]?.count ?? 0;
        total = typeof countValue === "bigint" ? Number(countValue) : countValue;
      } catch (error) {
        if (isMissingAttachmentsTableError(error)) {
          data = [];
          total = 0;
        } else {
          throw error;
        }
      }
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
  });
}
