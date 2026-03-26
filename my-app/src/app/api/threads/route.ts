// app/api/threads/route.ts

import { NextRequest } from "next/server";
import { handleApiError, ApiError } from "@/lib/errors";
import { assertSessionOrg, requireApiSession } from "@/lib/auth/api-session";
import { requireOrgContext } from "@/lib/auth/org-context";
import {
  logMembershipSafeMode,
  logThreadOrgLinkageSafeMode,
} from "@/lib/auth/membership-safe";
import { prisma } from "@/lib/prisma";
import { awardUserPointsTx } from "@/services/points.service";
import {
  createThreadSchema,
  listThreadsSchema,
} from "@/lib/validations/thread.validation";
import {
  createThread,
  getThreads,
} from "@/services/thread.service";
import { structuredLog } from "@/lib/logging";

type StructuredThreadType = "UPDATE" | "BLOCKER" | "IDEA" | "TASK_SOURCE";

function isStructuredThreadType(value: unknown): value is StructuredThreadType {
  return (
    value === "UPDATE" ||
    value === "BLOCKER" ||
    value === "IDEA" ||
    value === "TASK_SOURCE"
  );
}

function validateStructuredMeta(type: StructuredThreadType, meta: Record<string, unknown>) {
  if (type === "UPDATE") {
    const workType = meta.workType;
    const ok =
      workType === "FEATURE" ||
      workType === "BUG" ||
      workType === "MEETING" ||
      workType === "OTHER";
    if (!ok) {
      throw new ApiError("BAD_REQUEST", "UPDATE requires meta.workType");
    }
  }

  if (type === "BLOCKER") {
    const blockerType = meta.blockerType;
    const urgency = meta.urgency;
    const blockerOk =
      blockerType === "CODE" ||
      blockerType === "DEPENDENCY" ||
      blockerType === "REQUIREMENT";
    const urgencyOk = urgency === "LOW" || urgency === "MEDIUM" || urgency === "HIGH";
    if (!blockerOk || !urgencyOk) {
      throw new ApiError("BAD_REQUEST", "BLOCKER requires meta.blockerType and meta.urgency");
    }
  }

  if (type === "IDEA") {
    const ideaImpact = meta.ideaImpact;
    const ok = ideaImpact === "LOW" || ideaImpact === "MEDIUM" || ideaImpact === "HIGH";
    if (!ok) {
      throw new ApiError("BAD_REQUEST", "IDEA requires meta.ideaImpact");
    }
  }
}

// ─── POST /api/threads ─────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    const session = await requireApiSession(request);
    const actorId = session.userId;
    const org_id = await requireOrgContext(request);

    const body = await request.json();

    structuredLog("API", "HIT", {
      endpoint: "/api/threads",
      user_id: actorId,
      org_id,
      method: "POST",
    });

    await logMembershipSafeMode({
      route: "/api/threads POST",
      user_id: actorId,
      org_id,
    });

    // New structured mode: { type, content, meta }
    // Backward compatible: keep old create flow unchanged if this shape is not used.
    const structuredType = body?.type;
    const structuredContent = body?.content;
    const structuredMeta = body?.meta;

    if (isStructuredThreadType(structuredType) && typeof structuredContent === "string") {
      const content = structuredContent.trim();
      if (!content) {
        throw new ApiError("BAD_REQUEST", "content is required");
      }

      const meta =
        structuredMeta && typeof structuredMeta === "object" && !Array.isArray(structuredMeta)
          ? (structuredMeta as Record<string, unknown>)
          : {};

      validateStructuredMeta(structuredType, meta);

      const actor = await prisma.user.findUnique({
        where: { id: actorId },
        select: { id: true, org_id: true },
      });

      if (!actor) {
        throw new ApiError("NOT_FOUND", "User not found");
      }

      // Resolve visibility: ORG (default) | TEAM | PRIVATE
      const VALID_VISIBILITIES = ["ORG", "TEAM", "PRIVATE"] as const;
      type VisKey = typeof VALID_VISIBILITIES[number];
      const rawVis = typeof body?.visibility === "string" ? String(body.visibility).toUpperCase() : "ORG";
      const visibility: VisKey = (VALID_VISIBILITIES as readonly string[]).includes(rawVis) ? (rawVis as VisKey) : "ORG";
      const visToType: Record<VisKey, "org" | "team" | "private"> = { ORG: "org", TEAM: "team", PRIVATE: "private" };
      const threadType = visToType[visibility];
      const teamId = typeof body?.team_id === "string" ? body.team_id : null;
      const participantIds: string[] = Array.isArray(body?.participant_ids)
        ? (body.participant_ids as unknown[]).filter((x): x is string => typeof x === "string")
        : [];

      const created = await prisma.$transaction(async (tx) => {
        const thread = await tx.thread.create({
          data: {
            title:
              typeof body?.title === "string" && body.title.trim().length > 0
                ? body.title.trim().slice(0, 200)
                : content.slice(0, 200),
            content,
            input_type: structuredType,
            type: threadType,
            visibility,
            status: "open",
            org_id: actor.org_id,
            created_by: actor.id,
            last_activity_at: new Date(),
            team_id: teamId,
          },
        });

        await tx.threadParticipant.create({
          data: { thread_id: thread.id, user_id: actor.id, role: "owner" },
        });

        // Auto-add all team members for team threads
        if (threadType === "team" && teamId) {
          const teamMembers = await tx.teamMember.findMany({
            where: { teamId },
            select: { userId: true },
          });
          const extraTeamIds = teamMembers.map((m) => m.userId).filter((uid) => uid !== actor.id);
          if (extraTeamIds.length > 0) {
            await tx.threadParticipant.createMany({
              data: extraTeamIds.map((uid) => ({ thread_id: thread.id, user_id: uid, role: "member" as const })),
              skipDuplicates: true,
            });
          }
        }

        // Add chosen members for private threads
        if (threadType === "private" && participantIds.length > 0) {
          const extraPrivateIds = participantIds.filter((uid) => uid !== actor.id);
          if (extraPrivateIds.length > 0) {
            await tx.threadParticipant.createMany({
              data: extraPrivateIds.map((uid) => ({ thread_id: thread.id, user_id: uid, role: "member" as const })),
              skipDuplicates: true,
            });
          }
        }

        const metaRow = await tx.threadMeta.create({
          data: {
            threadId: thread.id,
            workType: (meta.workType as "FEATURE" | "BUG" | "MEETING" | "OTHER" | undefined) ?? null,
            blockerType:
              (meta.blockerType as "CODE" | "DEPENDENCY" | "REQUIREMENT" | undefined) ?? null,
            urgency: (meta.urgency as "LOW" | "MEDIUM" | "HIGH" | undefined) ?? null,
            ideaImpact: (meta.ideaImpact as "LOW" | "MEDIUM" | "HIGH" | undefined) ?? null,
          },
        });

        const rewardByType: Record<StructuredThreadType, number> = {
          UPDATE: 5,
          BLOCKER: 10,
          IDEA: 8,
          TASK_SOURCE: 0,
        };

        const points = await awardUserPointsTx(tx, actor.id, rewardByType[structuredType]);

        return { thread, meta: metaRow, points };
      });

      return Response.json({ success: true, data: created }, { status: 201 });
    }

    const parsed = createThreadSchema.safeParse({
      ...body,
      org_id,
      created_by: actorId,
    });
    if (!parsed.success) {
      throw new ApiError(
        "BAD_REQUEST",
        "Invalid request body",
        parsed.error.issues
      );
    }

    const thread = await createThread(parsed.data);

    await logThreadOrgLinkageSafeMode({
      route: "/api/threads POST",
      thread_id: thread.id,
      org_id,
    });

    return Response.json({ success: true, data: thread }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}

// ─── GET /api/threads ───────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  try {
    const session = await requireApiSession(request);
    const org_id = await requireOrgContext(request);

    const { searchParams } = new URL(request.url);
    assertSessionOrg(session, org_id);

    const params = {
      org_id,
      user_id: session.userId,
      status: searchParams.get("status") ?? undefined,
      type: searchParams.get("type") ?? undefined,
      page: searchParams.get("page") ?? "1",
      limit: searchParams.get("limit") ?? "20",
    };

    structuredLog("API", "HIT", {
      endpoint: "/api/threads",
      user_id: session.userId,
      org_id: params.org_id,
      method: "GET",
    });

    await logMembershipSafeMode({
      route: "/api/threads GET",
      user_id: session.userId,
      org_id,
    });

    const parsed = listThreadsSchema.safeParse(params);
    if (!parsed.success) {
      throw new ApiError(
        "BAD_REQUEST",
        "Invalid query parameters",
        parsed.error.issues
      );
    }

    const result = await getThreads(parsed.data);

    return Response.json({ success: true, data: result });
  } catch (error) {
    return handleApiError(error);
  }
}
