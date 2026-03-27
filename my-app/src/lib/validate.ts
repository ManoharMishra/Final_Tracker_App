import { ApiError } from "@/lib/errors";
import { prisma } from "@/lib/prisma";

export type TxClient = Omit<
  typeof prisma,
  "$connect" | "$disconnect" | "$extends" | "$on" | "$transaction"
>;

/**
 * Asserts that the caller user_id is present and the user exists.
 * Throws FORBIDDEN if empty, NOT_FOUND if user does not exist.
 * Must be called inside a Prisma transaction (pass the tx client).
 */
export async function validateUser(
  tx: TxClient,
  userId: string
): Promise<void> {
  console.log("Incoming user_id:", userId);

  if (!userId) {
    throw new ApiError("FORBIDDEN", "x-user-id header is required");
  }

  const user = await tx.user.findUnique({
    where: { id: userId },
    select: { id: true },
  });

  if (!user) {
    throw new ApiError("NOT_FOUND", "User not found");
  }
}

/**
 * Asserts that a user exists and belongs to the given organization.
 * Throws FORBIDDEN if the user is not found in that org.
 * Must be called inside a Prisma transaction (pass the tx client).
 */
export async function validateUserInOrg(
  tx: TxClient,
  userId: string,
  orgId: string
): Promise<void> {
  const user = await tx.user.findFirst({
    where: { id: userId, org_id: orgId },
    select: { id: true },
  });

  if (!user) {
    throw new ApiError(
      "FORBIDDEN",
      "User does not belong to this organization"
    );
  }
}

/**
 * Asserts that an organization exists.
 * Throws NOT_FOUND if absent.
 */
export async function validateOrgExists(
  tx: TxClient,
  orgId: string
): Promise<void> {
  const org = await tx.organization.findUnique({
    where: { id: orgId },
    select: { id: true },
  });

  if (!org) {
    throw new ApiError("NOT_FOUND", "Organization not found");
  }
}

/**
 * Enforces visibility-based access rules for a thread.
 * - org:     org membership is sufficient (already checked via validateUserInOrg)
 * - team:    user must be a member of the thread's assigned team (team_id)
 *            Falls back to participant check if team_id is not set.
 * - private: user must be a thread participant
 */
export async function canAccessThread(
  tx: TxClient,
  userId: string,
  thread: { id: string; org_id: string; type: string; team_id?: string | null }
): Promise<void> {
  if (thread.type === "org") {
    // org-scoped threads are visible to all org members — no participant check needed
    return;
  }

  if (thread.type === "team" && thread.team_id) {
    // team-scoped: check user is a member of the thread's team
    const teamMember = await (tx as typeof prisma).teamMember.findFirst({
      where: { teamId: thread.team_id, userId },
      select: { id: true },
    });
    if (!teamMember) {
      throw new ApiError("FORBIDDEN", "You are not a member of this team");
    }
    return;
  }

  // private (and team without team_id): must be a participant
  const participant = await tx.threadParticipant.findUnique({
    where: {
      thread_id_user_id: {
        thread_id: thread.id,
        user_id: userId,
      },
    },
    select: { id: true },
  });

  if (!participant) {
    throw new ApiError("FORBIDDEN", "User is not a participant in this thread");
  }
}

export async function validateThreadAccess(
  tx: TxClient,
  userId: string,
  threadId: string,
  options?: { forUpdate?: boolean }
): Promise<{ thread_id: string; org_id: string }> {
  const thread = await tx.thread.findFirst({
    where: { id: threadId, deleted_at: null },
    select: { id: true, org_id: true, type: true, team_id: true, status: true },
  });

  if (!thread) {
    throw new ApiError("NOT_FOUND", `Thread ${threadId} not found`);
  }

  await validateUser(tx, userId);
  await validateUserInOrg(tx, userId, thread.org_id);

  if (options?.forUpdate && thread.status !== "open") {
    throw new ApiError("FORBIDDEN", "This thread is read-only");
  }

  if (options?.forUpdate && thread.type !== "org") {
    // Use FOR UPDATE row lock for non-org threads to prevent race conditions
    const participant = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT id
      FROM thread_participants
      WHERE thread_id = ${threadId}::uuid
        AND user_id = ${userId}::uuid
      FOR UPDATE
    `;

    if (participant.length === 0) {
      throw new ApiError("FORBIDDEN", "User is not a participant in this thread");
    }
  } else {
    await canAccessThread(tx, userId, thread);
  }

  return { thread_id: thread.id, org_id: thread.org_id };
}
