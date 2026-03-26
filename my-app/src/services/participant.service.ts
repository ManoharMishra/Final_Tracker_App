// services/participant.service.ts

import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/errors";
import { createThreadEventTx } from "@/services/threadEvent.service";
import { createNotificationsFromEvent } from "@/services/notification.service";
import { validateThreadAccess as validateThreadAccessByVisibility } from "@/lib/validate";
import type { Prisma } from "@prisma/client";
import type {
  AddParticipantInput,
} from "@/lib/validations/participant.validation";

// ─── Shared filters ─────────────────────────────────────────────────────────

/** SR-003: All queries MUST exclude soft-deleted records */
const NOT_DELETED = { deleted_at: null } as const;

/** Reusable user select shape for participant responses */
const USER_SELECT = {
  id: true,
  name: true,
  email: true,
  avatar_url: true,
  org_id: true,
} as const;

// ─── Internal helpers ───────────────────────────────────────────────────────

/**
 * Loads and validates that a thread exists and is not soft-deleted.
 * Returns the thread if found, throws NOT_FOUND otherwise.
 */
async function getActiveThread(threadId: string, tx?: Prisma.TransactionClient) {
  const db = tx ?? prisma;
  const thread = await db.thread.findFirst({
    where: { id: threadId, ...NOT_DELETED },
    select: { id: true, title: true, org_id: true },
  });

  if (!thread) {
    throw new ApiError("NOT_FOUND", `Thread ${threadId} not found`);
  }

  return thread;
}

/**
 * Validates that a user exists and belongs to the same org as the thread.
 * SR-014: multi-tenant isolation.
 */
async function validateUserInOrg(
  userId: string,
  orgId: string,
  label: string,
  tx?: Prisma.TransactionClient
) {
  const db = tx ?? prisma;
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { id: true, org_id: true },
  });

  if (!user) {
    throw new ApiError("NOT_FOUND", `User ${userId} not found`);
  }

  if (user.org_id !== orgId) {
    throw new ApiError(
      "FORBIDDEN",
      `${label} does not belong to the same organization as the thread`
    );
  }

  return user;
}

/**
 * Validates actor has access to the thread and belongs to the same org.
 */
async function validateThreadAccess(
  threadId: string,
  userId: string,
  tx?: Prisma.TransactionClient
) {
  const db = tx ?? prisma;
  const thread = await getActiveThread(threadId, tx);

  await validateUserInOrg(userId, thread.org_id, "Actor", tx);

  const participant = await db.threadParticipant.findUnique({
    where: {
      thread_id_user_id: {
        thread_id: threadId,
        user_id: userId,
      },
    },
  });

  if (!participant) {
    throw new ApiError(
      "FORBIDDEN",
      "You must be a participant in this thread to access it"
    );
  }

  return { thread, participant };
}

// ─── 1. Add Participant ─────────────────────────────────────────────────────

export async function addParticipant(
  threadId: string,
  input: AddParticipantInput & { added_by: string }
) {
  return prisma.$transaction(async (tx) => {
    // 1. Actor must have thread access and same-org membership
    const { thread } = await validateThreadAccess(threadId, input.added_by, tx);

    // 2. Validate the user being added belongs to the same org (SR-014)
    await validateUserInOrg(input.user_id, thread.org_id, "Target user", tx);

    // 3. Create participant and rely on unique constraint for race-safe duplicate prevention
    let participant;
    try {
      participant = await tx.threadParticipant.create({
        data: {
          thread_id: threadId,
          user_id: input.user_id,
          role: input.role,
        },
        include: {
          user: { select: USER_SELECT },
        },
      });
    } catch (error) {
      if (
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        (error as { code?: string }).code === "P2002"
      ) {
        throw new ApiError(
          "CONFLICT",
          `User ${input.user_id} is already a participant in this thread`
        );
      }
      throw error;
    }

    // 6. SR-002: create thread_event
    await createThreadEventTx(tx, {
      threadId,
      eventType: "participant_added",
      actorId: input.added_by,
      payload: {
        entity_id: threadId,
        entity_type: "thread",
        data: {
          user_id: input.user_id,
          role: input.role,
        },
      },
    });

    await createNotificationsFromEvent(
      {
        thread_id: threadId,
        event_type: "participant_added",
        actor_id: input.added_by,
        payload: {
          entity_id: threadId,
          entity_type: "thread",
          data: {
            user_id: input.user_id,
            role: input.role,
          },
        },
      },
      [input.user_id]
    );

    // Strip org_id from the user object in response (not part of contract)
    const { org_id: _orgId, ...userWithoutOrg } = participant.user;

    return {
      ...participant,
      user: userWithoutOrg,
    };
  });
}

// ─── 2. Get Participants ────────────────────────────────────────────────────

export async function getParticipants(
  threadId: string,
  actorId: string
) {
  // 1. Validate actor access based on thread visibility and org membership.
  await prisma.$transaction(async (tx) => {
    await validateThreadAccessByVisibility(tx, actorId, threadId);
  });

  // 3. Fetch all participants with user details
  const participants = await prisma.threadParticipant.findMany({
    where: { thread_id: threadId },
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
    orderBy: [
      { role: "asc" },       // owners first
      { created_at: "asc" }, // then by join order
    ],
  });

  return participants;
}

// ─── 3. Remove Participant ──────────────────────────────────────────────────

export async function removeParticipant(
  threadId: string,
  targetUserId: string,
  actorId: string
) {
  return prisma.$transaction(async (tx) => {
    // 1. Validate actor access (participant + same org)
    await validateThreadAccess(threadId, actorId, tx);

    // 2. Only an owner can remove participants
    const actorParticipant = await tx.threadParticipant.findUnique({
      where: {
        thread_id_user_id: {
          thread_id: threadId,
          user_id: actorId,
        },
      },
    });

    if (!actorParticipant || actorParticipant.role !== "owner") {
      throw new ApiError(
        "FORBIDDEN",
        "Only thread owners can remove participants"
      );
    }

    // 3. Target participant must exist
    const targetParticipant = await tx.threadParticipant.findUnique({
      where: {
        thread_id_user_id: {
          thread_id: threadId,
          user_id: targetUserId,
        },
      },
    });

    if (!targetParticipant) {
      throw new ApiError(
        "NOT_FOUND",
        `User ${targetUserId} is not a participant in this thread`
      );
    }

    // 4. Cannot remove the last owner
    if (targetParticipant.role === "owner") {
      const ownerCount = await tx.threadParticipant.count({
        where: {
          thread_id: threadId,
          role: "owner",
        },
      });

      if (ownerCount <= 1) {
        throw new ApiError(
          "VALIDATION_ERROR",
          "Cannot remove the last owner of a thread. Transfer ownership first."
        );
      }
    }

    // 5. Delete participant
    await tx.threadParticipant.delete({
      where: { id: targetParticipant.id },
    });

    // 6. SR-002: create thread_event
    await createThreadEventTx(tx, {
      threadId,
      eventType: "participant_removed",
      actorId,
      payload: {
        entity_id: threadId,
        entity_type: "thread",
        data: { user_id: targetUserId },
      },
    });
  }, { isolationLevel: "Serializable" });
}

// ─── 4. Update Last Read ────────────────────────────────────────────────────

export async function updateLastRead(
  threadId: string,
  actorId: string
) {
  // 1. Validate actor access (participant + same org)
  const { participant } = await validateThreadAccess(threadId, actorId);

  // 3. Update last_read_at (no event — read-tracking is passive)
  const now = new Date();

  const updated = await prisma.threadParticipant.update({
    where: { id: participant.id },
    data: { last_read_at: now },
    select: {
      thread_id: true,
      user_id: true,
      last_read_at: true,
    },
  });

  return updated;
}
