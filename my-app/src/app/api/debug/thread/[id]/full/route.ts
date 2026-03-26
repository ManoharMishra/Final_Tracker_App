import { NextRequest } from "next/server";
import { handleApiError, ApiError } from "@/lib/errors";
import { requireApiSession } from "@/lib/auth/api-session";
import { prisma } from "@/lib/prisma";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const session = await requireApiSession(request);
    const { id } = await context.params;

    if (!id) {
      throw new ApiError("BAD_REQUEST", "thread id is required");
    }

    const membership = await prisma.membership.findUnique({
      where: {
        userId_orgId: {
          userId: session.userId,
          orgId: session.orgId,
        },
      },
      select: {
        id: true,
        role: true,
        joinedAt: true,
      },
    });

    const orgThreadCount = await prisma.thread.count({
      where: {
        org_id: session.orgId,
        deleted_at: null,
      },
    });

    const thread = await prisma.thread.findFirst({
      where: {
        id,
        deleted_at: null,
      },
      include: {
        creator: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    const participants = await prisma.threadParticipant.findMany({
      where: { thread_id: id },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            org_id: true,
          },
        },
      },
      orderBy: [{ role: "asc" }, { created_at: "asc" }],
    });

    const messages = await prisma.message.findMany({
      where: {
        thread_id: id,
        deleted_at: null,
      },
      orderBy: { created_at: "desc" },
      take: 100,
      select: {
        id: true,
        thread_id: true,
        author_id: true,
        content: true,
        created_at: true,
      },
    });

    const tasks = await prisma.task.findMany({
      where: {
        thread_id: id,
        deleted_at: null,
      },
      orderBy: { created_at: "desc" },
      take: 100,
      select: {
        id: true,
        thread_id: true,
        title: true,
        status: true,
        assigned_to: true,
        created_by: true,
        created_at: true,
      },
    });

    const isUserThreadParticipant = participants.some(
      (participant) => participant.user_id === session.userId
    );

    const mismatches: string[] = [];

    if (!membership) {
      mismatches.push("Session user has no membership record in session org");
    }

    if (!thread) {
      mismatches.push("Thread not found (or soft-deleted)");
    }

    if (thread && thread.org_id !== session.orgId) {
      mismatches.push("Thread org_id does not match session org_id");
    }

    if (thread && thread.type !== "org" && !isUserThreadParticipant) {
      mismatches.push("Session user is not a participant on non-org thread");
    }

    if (messages.some((message) => message.thread_id !== id)) {
      mismatches.push("Messages contain wrong thread_id");
    }

    if (tasks.some((task) => task.thread_id !== id)) {
      mismatches.push("Tasks contain wrong thread_id");
    }

    return Response.json({
      success: true,
      data: {
        session: {
          user_id: session.userId,
          org_id: session.orgId,
          expires_at: session.expiresAt,
        },
        checks: {
          has_membership_in_org: Boolean(membership),
          org_thread_count: orgThreadCount,
          thread_exists: Boolean(thread),
          thread_org_matches_session: thread ? thread.org_id === session.orgId : false,
          user_is_thread_participant: isUserThreadParticipant,
          participants_count: participants.length,
          messages_count: messages.length,
          tasks_count: tasks.length,
        },
        mismatch_report: mismatches,
        thread,
        participants,
        messages,
        tasks,
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}