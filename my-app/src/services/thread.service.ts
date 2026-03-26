// services/thread.service.ts

import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/errors";
import { validateOrgExists, validateUser, validateUserInOrg, canAccessThread } from "@/lib/validate";
import { createThreadEventTx } from "@/services/threadEvent.service";
import { structuredLog } from "@/lib/logging";
import type {
  CreateThreadInput,
  ListThreadsInput,
  UpdateThreadRequestInput,
} from "@/lib/validations/thread.validation";

type TransactionClient = Omit<
  typeof prisma,
  "$connect" | "$disconnect" | "$extends" | "$on" | "$transaction"
>;

// ─── Shared filters ─────────────────────────────────────────────────────────

/** SR-003: All queries MUST exclude soft-deleted records */
const NOT_DELETED = { deleted_at: null } as const;

// ─── 1. Create Thread ───────────────────────────────────────────────────────

export async function createThread(input: CreateThreadInput) {
  structuredLog("SERVICE", "INPUT", {
    service: "thread.createThread",
    payload: input,
  });

  const now = new Date();

  return prisma.$transaction(async (tx: TransactionClient) => {
    await validateUser(tx, input.created_by);
    await validateOrgExists(tx, input.org_id);
    await validateUserInOrg(tx, input.created_by, input.org_id);

    // 1. Create the thread (status = "open", SR-001: last_activity_at = now)
    const thread = await tx.thread.create({
      data: {
        title: input.title,
        type: input.type,
        status: "open",
        goal: input.goal,
        org_id: input.org_id,
        created_by: input.created_by,
        last_activity_at: now,
        // store which team this thread is scoped to (team threads)
        team_id: input.team_id ?? null,
      },
    });

    // 2. SR-006: creator must be participant (owner)
    await tx.threadParticipant.create({
      data: {
        thread_id: thread.id,
        user_id: input.created_by,
        role: "owner",
      },
    });

    // 3. For team threads: auto-add all current team members as participants
    if (input.type === "team" && input.team_id) {
      const teamMembers = await tx.teamMember.findMany({
        where: { teamId: input.team_id },
        select: { userId: true },
      });
      const extraTeamIds = teamMembers
        .map((m) => m.userId)
        .filter((uid) => uid !== input.created_by);
      if (extraTeamIds.length > 0) {
        await tx.threadParticipant.createMany({
          data: extraTeamIds.map((uid) => ({
            thread_id: thread.id,
            user_id: uid,
            role: "member" as const,
          })),
          skipDuplicates: true,
        });
      }
    }

    // 4. For private threads: add explicitly chosen participants
    if (input.type === "private" && input.participant_ids && input.participant_ids.length > 0) {
      const extraPrivateIds = input.participant_ids.filter((uid) => uid !== input.created_by);
      if (extraPrivateIds.length > 0) {
        await tx.threadParticipant.createMany({
          data: extraPrivateIds.map((uid) => ({
            thread_id: thread.id,
            user_id: uid,
            role: "member" as const,
          })),
          skipDuplicates: true,
        });
      }
    }

    // 5. SR-002: create thread_event
    await createThreadEventTx(tx, {
      threadId: thread.id,
      eventType: "thread_created",
      actorId: input.created_by,
      payload: {
        entity_id: thread.id,
        entity_type: "thread",
        data: { title: input.title, type: input.type },
      },
    });

    return thread;
  });
}

// ─── 2. Get Threads List ────────────────────────────────────────────────────

export async function getThreads(input: ListThreadsInput) {
  structuredLog("SERVICE", "INPUT", {
    service: "thread.getThreads",
    payload: input,
  });

  const { org_id, user_id, status, type, page, limit } = input;
  const skip = (page - 1) * limit;

  // Build where clause: SR-014 org scoping, SR-003 soft delete, visibility-aware filter
  const where = {
    ...NOT_DELETED,
    org_id,
    ...(status && { status }),
    ...(type && { type }),
    // Visibility rules:
    //   org     → any org member can see (org_id filter above is sufficient)
    //   team    → must be a participant
    //   private → must be a participant
    OR: [
      { type: "org" as const },
      { type: "team" as const, participants: { some: { user_id } } },
      { type: "private" as const, participants: { some: { user_id } } },
    ],
  };

  const [threads, total] = await prisma.$transaction([
    prisma.thread.findMany({
      where,
      orderBy: { last_activity_at: "desc" },
      skip,
      take: limit,
      include: {
        creator: {
          select: {
            id: true,
            name: true,
            email: true,
            avatar_url: true,
          },
        },
        meta: {
          select: {
            workType: true,
            blockerType: true,
            urgency: true,
            ideaImpact: true,
          },
        },
        stats: {
          select: {
            reactionsCount: true,
            commentsCount: true,
            conversionCount: true,
          },
        },
        _count: {
          select: {
            participants: true,
            messages: { where: NOT_DELETED },
          },
        },
      },
    }),
    prisma.thread.count({ where }),
  ]);

  return {
    data: threads,
    pagination: {
      page,
      limit,
      total,
      total_pages: Math.ceil(total / limit),
    },
  };
}

// ─── 3. Get Thread By ID ────────────────────────────────────────────────────

export async function getThreadById(threadId: string, userId: string) {
  structuredLog("SERVICE", "INPUT", {
    service: "thread.getThreadById",
    payload: { threadId, userId },
  });

  const thread = await prisma.thread.findFirst({
    where: {
      id: threadId,
      ...NOT_DELETED,
    },
    include: {
      participants: {
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              avatar_url: true,
            },
          },
        },
      },
      // Latest summary (most recent version)
      summaries: {
        orderBy: { version: "desc" },
        take: 1,
      },
      // Recent decisions (limit 5, excluding deleted)
      decisions: {
        where: NOT_DELETED,
        orderBy: { created_at: "desc" },
        take: 5,
        select: {
          id: true,
          content: true,
          is_ai_generated: true,
          created_by: true,
          created_at: true,
        },
      },
      // Counts only — messages are NOT returned here
      _count: {
        select: {
          messages: { where: NOT_DELETED },
          participants: true,
          tasks: { where: NOT_DELETED },
          decisions: { where: NOT_DELETED },
        },
      },
    },
  });

  if (!thread) {
    throw new ApiError("NOT_FOUND", `Thread ${threadId} not found`);
  }

  // Visibility access check — enforces org/team/private rules
  await prisma.$transaction(async (tx: TransactionClient) => {
    await validateUser(tx, userId);
    await validateUserInOrg(tx, userId, thread.org_id);
    await canAccessThread(tx, userId, thread);
  });

  // Shape the response to match the API contract
  return {
    ...thread,
    latest_summary: thread.summaries[0] ?? null,
    recent_decisions: thread.decisions,
    summaries: undefined, // strip raw relation
    decisions: undefined, // strip raw relation
  };
}

// ─── 4. Update Thread ───────────────────────────────────────────────────────

export async function updateThread(
  threadId: string,
  input: UpdateThreadRequestInput
) {
  structuredLog("SERVICE", "INPUT", {
    service: "thread.updateThread",
    payload: { threadId, input },
  });

  const { updated_by, ...fields } = input;
  const now = new Date();

  // Fetch current thread (SR-003: not deleted)
  const existing = await prisma.thread.findFirst({
    where: { id: threadId, ...NOT_DELETED },
  });

  if (!existing) {
    throw new ApiError("NOT_FOUND", `Thread ${threadId} not found`);
  }

  // Determine what changed
  const isStatusChange =
    fields.status !== undefined && fields.status !== existing.status;
  const changedFields: Record<string, unknown> = {};

  if (fields.title !== undefined && fields.title !== existing.title) {
    changedFields.title = fields.title;
  }
  if (fields.goal !== undefined && fields.goal !== existing.goal) {
    changedFields.goal = fields.goal;
  }
  if (isStatusChange) {
    changedFields.status = fields.status;
  }

  // Nothing actually changed
  if (Object.keys(changedFields).length === 0) {
    return existing;
  }

  return prisma.$transaction(async (tx: TransactionClient) => {
    // Update thread + SR-001: refresh last_activity_at
    const updated = await tx.thread.update({
      where: { id: threadId },
      data: {
        ...fields,
        last_activity_at: now,
        updated_at: now,
      },
    });

    // SR-002: create event
    if (isStatusChange) {
      await createThreadEventTx(tx, {
        threadId,
        eventType: "thread_status_changed",
        actorId: updated_by,
        payload: {
          entity_id: threadId,
          entity_type: "thread",
          data: {
            from: existing.status as string,
            to: fields.status as string,
          },
        },
      });
    } else {
      await createThreadEventTx(tx, {
        threadId,
        eventType: "thread_updated",
        actorId: updated_by,
        payload: {
          entity_id: threadId,
          entity_type: "thread",
          data: changedFields,
        },
      });
    }

    return updated;
  });
}

// ─── 5. Delete Thread (Soft Delete) ─────────────────────────────────────────

export async function deleteThread(
  threadId: string,
  deletedBy: string
): Promise<void> {
  const now = new Date();

  // Verify thread exists and is not already deleted
  const existing = await prisma.thread.findFirst({
    where: { id: threadId, ...NOT_DELETED },
  });

  if (!existing) {
    throw new ApiError("NOT_FOUND", `Thread ${threadId} not found`);
  }

  await prisma.$transaction(async (tx: TransactionClient) => {
    // Soft delete — SR-003
    await tx.thread.update({
      where: { id: threadId },
      data: { deleted_at: now },
    });

    // SR-002: event
    await createThreadEventTx(tx, {
      threadId,
      eventType: "thread_updated",
      actorId: deletedBy,
      payload: {
        entity_id: threadId,
        entity_type: "thread",
        data: { action: "soft_deleted" },
      },
    });
  });
}
