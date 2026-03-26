import { prisma } from "@/lib/prisma";

type MembershipRecord = {
  id: string;
  role: string;
  userId: string;
  orgId: string;
};

export async function getMembership(user_id: string, org_id: string) {
  const rows = await prisma.$queryRaw<MembershipRecord[]>`
    SELECT id, role, "userId", "orgId"
    FROM memberships
    WHERE "userId" = ${user_id}::uuid
      AND "orgId" = ${org_id}::uuid
    LIMIT 1
  `;

  return rows[0] ?? null;
}

export async function logMembershipSafeMode(input: {
  route: string;
  user_id: string;
  org_id: string;
}) {
  try {
    const membership = await getMembership(input.user_id, input.org_id);

    if (!membership) {
      console.error("INVALID MEMBERSHIP", {
        route: input.route,
        user_id: input.user_id,
        org_id: input.org_id,
      });
    }

    return membership;
  } catch (error) {
    console.error("MEMBERSHIP_CHECK_ERROR", {
      route: input.route,
      user_id: input.user_id,
      org_id: input.org_id,
      error,
    });
    return null;
  }
}

export async function logThreadOrgLinkageSafeMode(input: {
  route: string;
  thread_id: string;
  org_id: string;
}) {
  try {
    const thread = await prisma.thread.findUnique({
      where: { id: input.thread_id },
      select: { id: true, org_id: true, deleted_at: true },
    });

    if (!thread) {
      return;
    }

    if (thread.org_id !== input.org_id) {
      console.error("WRONG_ORG_LINKAGE", {
        route: input.route,
        entity: "thread",
        thread_id: input.thread_id,
        expected_org_id: input.org_id,
        actual_org_id: thread.org_id,
      });
    }
  } catch (error) {
    console.error("THREAD_LINKAGE_CHECK_ERROR", {
      route: input.route,
      thread_id: input.thread_id,
      org_id: input.org_id,
      error,
    });
  }
}

export async function logTaskOrgLinkageSafeMode(input: {
  route: string;
  task_id: string;
  org_id: string;
}) {
  try {
    const task = await prisma.task.findUnique({
      where: { id: input.task_id },
      select: { id: true, thread_id: true },
    });

    if (!task?.thread_id) {
      return;
    }

    await logThreadOrgLinkageSafeMode({
      route: input.route,
      thread_id: task.thread_id,
      org_id: input.org_id,
    });
  } catch (error) {
    console.error("TASK_LINKAGE_CHECK_ERROR", {
      route: input.route,
      task_id: input.task_id,
      org_id: input.org_id,
      error,
    });
  }
}