import { NextRequest } from "next/server";
import { ApiError, handleApiError } from "@/lib/errors";
import { prisma } from "@/lib/prisma";
import { threadIdParamSchema } from "@/lib/validations/thread.validation";
import { validateThreadAccess } from "@/lib/validate";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const actorId = request.headers.get("x-user-id") ?? "";
    if (!actorId) {
      throw new ApiError("FORBIDDEN", "x-user-id header is required");
    }

    const { id } = await context.params;
    const parsed = threadIdParamSchema.safeParse({ threadId: id });
    if (!parsed.success) {
      throw new ApiError("VALIDATION_ERROR", "Invalid thread ID", parsed.error.issues);
    }

    const body = await request.json().catch(() => ({}));
    const reaction = typeof body?.reaction === "string" && body.reaction.trim()
      ? body.reaction.trim().slice(0, 32)
      : "like";

    const data = await prisma.$transaction(async (tx) => {
      await validateThreadAccess(tx, actorId, parsed.data.threadId, { forUpdate: true });

      await tx.$executeRaw`
        INSERT INTO thread_activities (id, "threadId", type, "userId", metadata, "createdAt")
        VALUES (
          gen_random_uuid()::text,
          ${parsed.data.threadId}::uuid,
          'REACTION'::"ActivityType",
          ${actorId}::uuid,
          ${JSON.stringify({ reaction })}::jsonb,
          now()
        )
      `;

      const statsRows = await tx.$queryRaw<Array<{
        id: string;
        reactionsCount: number;
        commentsCount: number;
        conversionCount: number;
      }>>`
        INSERT INTO thread_stats (id, "threadId", "reactionsCount", "commentsCount", "conversionCount")
        VALUES (gen_random_uuid()::text, ${parsed.data.threadId}::uuid, 1, 0, 0)
        ON CONFLICT ("threadId")
        DO UPDATE SET "reactionsCount" = thread_stats."reactionsCount" + 1
        RETURNING id, "reactionsCount", "commentsCount", "conversionCount"
      `;

      return { reaction, stats: statsRows[0] ?? null };
    });

    return Response.json({ data }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
